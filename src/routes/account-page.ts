/**
 * Account Page Route
 *
 * GET /account-page?domain=sanity.io
 * or
 * GET /accounts/sanity.io
 *
 * Returns an HTML page displaying account data from Sanity.
 */

export async function handleAccountPage(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  const url = new URL(request.url);
  const domain =
    url.searchParams.get('domain') ||
    (url.pathname.startsWith('/accounts/')
      ? url.pathname.replace(/^\/accounts\/?/, '').replace(/\/$/, '')
      : '');
  if (!domain) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Account Page</title></head><body>
        <h1>Account Page</h1>
        <p>Usage: <code>/account-page?domain=sanity.io</code> or <code>/accounts/sanity.io</code></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const { initSanityClient, groqQuery } = await import('../sanity-client.js');
  const client = initSanityClient(env);
  if (!client) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title></head><body>
        <h1>Error</h1><p>Sanity not configured.</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
    const account = (await groqQuery(
      client,
      `*[_type == "account" && (rootDomain == $d || domain == $d || accountKey == $d)][0]{
        companyName,
        name,
        domain,
        rootDomain,
        canonicalUrl,
        industry,
        opportunityScore,
        profileCompleteness,
        aiReadiness,
        performance,
        businessScale,
        benchmarks,
        "technologies": technologies[]->{name},
        technologyStack,
        painPoints,
        leadership
      }`,
      { d: domain.replace(/^www\./, '') },
    )) as any;

    const norm = (s: string) => (s || '').toLowerCase().replace(/^www\./, '');
    const requestedNorm = norm(domain);
    const matches =
      norm(account?.rootDomain || '') === requestedNorm ||
      norm(account?.domain || '') === requestedNorm ||
      norm(String(account?.accountKey || '')) === requestedNorm;

    if (!account || !matches) {
      return new Response(
        `<!DOCTYPE html><html><head><title>Account Not Found</title></head><body>
          <h1>Account Not Found</h1>
          <p>No account found for <strong>${domain}</strong>. <a href="/scan?url=https://${domain}">Scan it</a> first.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const name =
      account.companyName || account.name || account.rootDomain || account.domain || domain;
    const canonicalUrl = account.canonicalUrl || (domain ? `https://${domain}` : '');
    const completeness = account.profileCompleteness?.score ?? null;
    const aiScore = account.aiReadiness?.score ?? null;
    const perfScore = account.performance?.performanceScore ?? null;
    const techNames = (account.technologies || []).map((t: any) =>
      typeof t === 'object' && t?.name != null ? t.name : t,
    );
    const techFlat = [
      ...(account.technologyStack?.cms || []),
      ...(account.technologyStack?.frameworks || []),
      ...(account.technologyStack?.legacySystems || []),
      ...techNames,
    ].filter(Boolean).slice(0, 16);
    const painPoints = account.painPoints || [];
    const gaps = account.profileCompleteness?.gaps || [];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} — Account</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 2rem; max-width: 720px; line-height: 1.5; color: #1a1a1a; background: #fafafa; }
    h1 { margin: 0 0 0.25rem 0; font-size: 1.75rem; }
    a { color: #2276fc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    header { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e5e5; }
    .domain { font-size: 0.95rem; color: #555; }
    .badges { margin-top: 0.75rem; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; margin-right: 0.5rem; }
    .badge--high { background: #d4edda; color: #155724; }
    .badge--mid { background: #fff3cd; color: #856404; }
    .badge--low { background: #f8d7da; color: #721c24; }
    section { margin-bottom: 1.5rem; }
    h2 { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 0 0 0.5rem 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .tag { padding: 0.2rem 0.5rem; background: #f3f4f6; border-radius: 4px; font-size: 0.8rem; }
    .pain { padding: 0.5rem 0; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    .pain:last-child { border-bottom: none; }
    .empty { color: #9ca3af; font-size: 0.9rem; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(name)}</h1>
    ${domain ? `<div class="domain"><a href="${escapeHtml(canonicalUrl)}" target="_blank" rel="noopener">${escapeHtml(domain)}</a></div>` : ''}
    <div class="badges">
      ${completeness != null ? `<span class="badge badge--${completeness >= 70 ? 'high' : completeness >= 40 ? 'mid' : 'low'}">Profile: ${completeness}%</span>` : ''}
      ${aiScore != null ? `<span class="badge badge--${aiScore >= 70 ? 'high' : aiScore >= 40 ? 'mid' : 'low'}">AI Readiness: ${aiScore}</span>` : ''}
      ${perfScore != null ? `<span class="badge badge--${perfScore >= 70 ? 'high' : perfScore >= 40 ? 'mid' : 'low'}">Performance: ${perfScore}</span>` : ''}
    </div>
  </header>

  ${account.industry ? `<section><h2>Industry</h2><span>${escapeHtml(account.industry)}</span></section>` : ''}

  ${account.benchmarks && Object.keys(account.benchmarks).length ? `
  <section><h2>Benchmarks</h2>
    <div class="tags">
      ${account.benchmarks.estimatedEmployees ? `<span class="tag">Employees: ${escapeHtml(String(account.benchmarks.estimatedEmployees))}</span>` : ''}
      ${account.benchmarks.headquarters ? `<span class="tag">HQ: ${escapeHtml(account.benchmarks.headquarters)}</span>` : ''}
      ${account.benchmarks.estimatedRevenue ? `<span class="tag">Revenue: ${escapeHtml(String(account.benchmarks.estimatedRevenue))}</span>` : ''}
    </div>
  </section>
  ` : ''}

  ${techFlat.length ? `
  <section><h2>Technology Stack</h2>
    <div class="tags">${techFlat.map((t: string) => `<span class="tag">${escapeHtml(String(t))}</span>`).join('')}</div>
  </section>
  ` : ''}

  ${painPoints.length ? `
  <section><h2>Pain Points</h2>
    ${painPoints.map((p: any) => `
    <div class="pain">
      <strong>${escapeHtml(p.category || 'General')}</strong>${p.severity ? ` · ${escapeHtml(p.severity)}` : ''}
      ${p.description ? `<div style="margin-top:4px;color:#666">${escapeHtml(p.description)}</div>` : ''}
    </div>
    `).join('')}
  </section>
  ` : ''}

  ${gaps.length ? `
  <section><h2>Profile Gaps</h2>
    <div class="tags">${gaps.map((g: string) => `<span class="tag">${escapeHtml(g)}</span>`).join('')}</div>
  </section>
  ` : ''}

  ${!techFlat.length && !painPoints.length && completeness == null && !account.industry ? `
  <section><p class="empty">No enrichment data yet. <a href="/scan?url=https://${escapeHtml(domain)}">Run a scan</a> to populate this page.</p></section>
  ` : ''}
</body>
</html>`;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err: any) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title></head><body>
        <h1>Error</h1><p>${escapeHtml(err?.message || 'Unknown error')}</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

function escapeHtml(s: string): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
