/**
 * Account Page Route
 *
 * GET /account-page?domain=sanity.io
 * GET /accounts/sanity.io
 * GET /accounts/ulta.com?action=queue-enrichment  → trigger gap-fill, redirect with ?queued=1
 *
 * Full account layout: overview, scores, benchmarks, pipeline stages, progress, gaps, and
 * "Queue missing enrichment" to run the research pipeline.
 */

const DIMENSION_LABELS: Record<string, string> = {
  scan: 'Website Scan',
  discovery: 'Page Discovery',
  crawl: 'Content Crawl',
  extraction: 'Evidence Extraction',
  linkedin: 'LinkedIn Intelligence',
  brief: 'Research Brief',
  verification: 'Claim Verification',
  competitors: 'Competitive Intel',
  classification: 'Account Classification',
  technologies: 'Technology Linking',
  leadership: 'Leadership Team',
  painPoints: 'Pain Point Analysis',
  benchmarks: 'Company Benchmarks',
};

export async function handleAccountPage(
  request: Request,
  requestId: string,
  env: any,
): Promise<Response> {
  const url = new URL(request.url);
  const domain =
    url.searchParams.get('domain') ||
    decodeURIComponent(
      url.pathname.startsWith('/accounts/')
        ? url.pathname.replace(/^\/accounts\/?/, '').replace(/\/$/, '')
        : '',
    );
  if (!domain) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Account Page</title></head><body>
        <h1>Account Page</h1>
        <p>Usage: <code>/account-page?domain=sanity.io</code> or <code>/accounts/sanity.io</code></p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const { initSanityClient, groqQuery, generateAccountKey, normalizeCanonicalUrl } = await import(
    '../sanity-client.js'
  );
  const client = initSanityClient(env);
  if (!client) {
    return new Response(
      `<!DOCTYPE html><html><head><title>Error</title></head><body>
        <h1>Error</h1><p>Sanity not configured.</p>
      </body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const norm = (s: string) => (s || '').toLowerCase().replace(/^www\./, '');
  const requestedNorm = norm(domain);

  try {
    const account = (await groqQuery(
      client,
      `*[_type == "account" && (rootDomain == $d || domain == $d || accountKey == $d)][0]{
        _id,
        accountKey,
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
        technologyStack,
        classification,
        competitorResearch,
        signals,
        lastScannedAt,
        lastEnrichedAt,
        updatedAt,
        "technologies": technologies[]->{name},
        "leadership": leadership[]->{name, headline},
        painPoints
      }`,
      { d: requestedNorm },
    )) as any;

    const accountKey = account?.accountKey;
    const [accountPack, enrichmentJob] =
      accountKey
        ? await Promise.all([
            groqQuery(client, `*[_type == "accountPack" && accountKey == $key][0]{ accountKey, payload }`, {
              key: accountKey,
            }) as Promise<any>,
            groqQuery(client, `*[_type == "enrichmentJob" && accountKey == $key] | order(updatedAt desc)[0]{ _id, status, currentStage, completedStages, failedStages, startedAt, updatedAt }`, {
              key: accountKey,
            }) as Promise<any>,
          ])
        : [null, null];

    const accountDomain = account?.rootDomain || account?.domain || account?.accountKey || '';
    const matches =
      norm(accountDomain) === requestedNorm || norm(String(account?.accountKey || '')) === requestedNorm;

    if (!account || !matches) {
      return new Response(
        `<!DOCTYPE html><html><head><title>Account Not Found</title></head><body>
          <h1>Account Not Found</h1>
          <p>No account found for <strong>${escapeHtml(domain)}</strong>. <a href="/scan?url=https://${escapeHtml(domain)}">Scan it</a> first.</p>
        </body></html>`,
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const action = url.searchParams.get('action');
    const basePath = `/accounts/${encodeURIComponent(domain)}`;
    if (action === 'queue-enrichment') {
      const canonicalUrl =
        account.canonicalUrl || (accountDomain ? `https://${accountDomain}` : `https://${domain}`);
      const accountKey =
        account.accountKey || (await generateAccountKey(canonicalUrl));
      if (accountKey) {
        const { triggerGapFill } = await import('../services/gap-fill-orchestrator.js');
        await triggerGapFill({
          env,
          accountKey,
          domain: accountDomain || domain,
          canonicalUrl,
          trigger: 'account_page',
        });
      }
      return Response.redirect(url.origin + basePath + '?queued=1', 302);
    }

    const { analyseCompleteness } = await import('../services/account-completeness.js');
    const completenessAnalysis = analyseCompleteness(account, accountPack, enrichmentJob);
    const dimensions = completenessAnalysis.dimensions || {};
    const gaps = completenessAnalysis.gaps || [];
    const score = completenessAnalysis.score ?? account?.profileCompleteness?.score ?? null;

    const name =
      account.companyName || account.name || account.rootDomain || account.domain || domain;
    const canonicalUrl = account.canonicalUrl || (accountDomain ? `https://${accountDomain}` : `https://${domain}`);
    const aiScore = account.aiReadiness?.score ?? null;
    const perfScore = account.performance?.performanceScore ?? null;
    const techNames = (account.technologies || []).map((t: any) => (t?.name != null ? t.name : t));
    const techStack = account.technologyStack || {};
    const techFlat = [
      ...(techStack.cms || []),
      ...(techStack.frameworks || []),
      ...(techStack.legacySystems || []),
      ...(techStack.pimSystems || []),
      ...(techStack.damSystems || []),
      ...techNames,
    ].filter(Boolean);
    const painPoints = account.painPoints || [];
    const leadership = account.leadership || [];
    const queued = url.searchParams.get('queued') === '1';
    const jobStatus = enrichmentJob?.status || null;
    const completedStages = enrichmentJob?.completedStages || [];
    const currentStage = enrichmentJob?.currentStage || null;

    const section = (
      title: string,
      content: string,
      isPresent: boolean,
      gapKey?: string,
    ) => {
      const gap = gapKey ? gaps.includes(gapKey) : false;
      return `
      <section class="card ${isPresent ? '' : 'card--empty'}">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        <div class="section-body">${content}</div>
        ${gap ? `<p class="section-hint">Missing — queue enrichment below to fill.</p>` : ''}
      </section>`;
    };

    const row = (label: string, value: string | number | null | undefined) =>
      `<tr><td class="row-label">${escapeHtml(label)}</td><td>${value != null && value !== '' ? escapeHtml(String(value)) : '<span class="muted">—</span>'}</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(name)} — Account</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; line-height: 1.5; color: #1a1a1a; background: #f1f5f9; }
    .container { max-width: 900px; margin: 0 auto; padding: 1.5rem; }
    h1 { margin: 0 0 0.25rem 0; font-size: 1.75rem; font-weight: 700; }
    a { color: #0f766e; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .header { background: #fff; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .domain { font-size: 0.95rem; color: #64748b; margin-top: 0.25rem; }
    .badges { margin-top: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .badge { display: inline-block; padding: 0.35rem 0.65rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; }
    .badge--high { background: #d1fae5; color: #065f46; }
    .badge--mid { background: #fef3c7; color: #92400e; }
    .badge--low { background: #fee2e2; color: #991b1b; }
    .badge--neutral { background: #e2e8f0; color: #475569; }
    .actions { margin-top: 1rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
    .btn { display: inline-block; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none; text-decoration: none; }
    .btn--primary { background: #0f766e; color: #fff; }
    .btn--primary:hover { background: #0d6961; }
    .btn--secondary { background: #e2e8f0; color: #334155; }
    .btn--secondary:hover { background: #cbd5e1; }
    .notice { background: #d1fae5; color: #065f46; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; }
    .card { background: #fff; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .card--empty .section-body { color: #94a3b8; }
    .section-title { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 0 0 0.75rem 0; }
    .section-body { font-size: 0.95rem; }
    .section-hint { font-size: 0.8rem; color: #94a3b8; margin: 0.5rem 0 0 0; }
    table { width: 100%; border-collapse: collapse; }
    .row-label { color: #64748b; font-size: 0.9rem; padding: 0.35rem 0; width: 40%; }
    td { padding: 0.35rem 0; border-bottom: 1px solid #f1f5f9; }
    .muted { color: #94a3b8; }
    .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .tag { padding: 0.25rem 0.5rem; background: #f1f5f9; border-radius: 6px; font-size: 0.8rem; }
    .tag--done { background: #d1fae5; color: #065f46; }
    .tag--missing { background: #fee2e2; color: #991b1b; }
    .tag--progress { background: #fef3c7; color: #92400e; }
    .pain-item { padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
    .pain-item:last-child { border-bottom: none; }
    .progress-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 0.5rem; }
    .progress-fill { height: 100%; background: #0f766e; border-radius: 3px; transition: width 0.2s; }
    .grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
  </style>
</head>
<body>
  <div class="container">
    ${queued ? '<div class="notice">Enrichment queued. The pipeline runs in the background (cron every 15 min). Refresh to see progress.</div>' : ''}

    <header class="header">
      <h1>${escapeHtml(name)}</h1>
      <div class="domain"><a href="${escapeHtml(canonicalUrl)}" target="_blank" rel="noopener">${escapeHtml(accountDomain || domain)}</a></div>
      <div class="badges">
        ${score != null ? `<span class="badge badge--${score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'}">Profile: ${score}%</span>` : '<span class="badge badge--neutral">Profile: —</span>'}
        ${aiScore != null ? `<span class="badge badge--${aiScore >= 70 ? 'high' : aiScore >= 40 ? 'mid' : 'low'}">AI Readiness: ${aiScore}</span>` : '<span class="badge badge--neutral">AI Readiness: —</span>'}
        ${perfScore != null ? `<span class="badge badge--${perfScore >= 70 ? 'high' : perfScore >= 40 ? 'mid' : 'low'}">Performance: ${perfScore}</span>` : '<span class="badge badge--neutral">Performance: —</span>'}
        ${account.opportunityScore != null ? `<span class="badge badge--${account.opportunityScore >= 70 ? 'high' : 'mid'}">Opportunity: ${account.opportunityScore}</span>` : '<span class="badge badge--neutral">Opportunity: —</span>'}
      </div>
      <div class="actions">
        <a href="${escapeHtml(basePath)}?action=queue-enrichment" class="btn btn--primary">Queue missing enrichment</a>
        <a href="/scan?url=${encodeURIComponent(canonicalUrl)}" class="btn btn--secondary">Run scan</a>
      </div>
    </header>

    ${section(
      'Enrichment progress',
      jobStatus
        ? `<p><strong>Status:</strong> ${escapeHtml(jobStatus)}</p>
           ${currentStage ? `<p><strong>Current stage:</strong> ${escapeHtml(currentStage)}</p>` : ''}
           <div class="progress-bar"><div class="progress-fill" style="width: ${Math.round((completedStages.length / 7) * 100)}%"></div></div>
           <p class="section-hint">Completed: ${(completedStages as string[]).length ? (completedStages as string[]).join(', ') : 'none yet'}</p>`
        : '<p class="muted">No enrichment job yet. Use "Queue missing enrichment" above to start the pipeline.</p>',
      !!enrichmentJob,
    )}

    ${section(
      'Overview',
      `<table>
        ${row('Industry', account.industry)}
        ${row('Segment', account.classification?.segment)}
        ${row('Company name', account.companyName || account.name)}
        ${row('Last scanned', account.lastScannedAt ? new Date(account.lastScannedAt).toLocaleDateString() : null)}
        ${row('Last enriched', account.lastEnrichedAt ? new Date(account.lastEnrichedAt).toLocaleDateString() : null)}
      </table>`,
      !!(account.industry || account.classification?.segment),
      'classification',
    )}

    ${section(
      'Benchmarks',
      `<table>
        ${row('Employees', account.benchmarks?.estimatedEmployees)}
        ${row('Revenue', account.benchmarks?.estimatedRevenue)}
        ${row('Headquarters', account.benchmarks?.headquarters)}
        ${row('Traffic', account.benchmarks?.estimatedTraffic)}
        ${row('Funding stage', account.benchmarks?.fundingStage)}
        ${row('Year founded', account.benchmarks?.yearFounded)}
        ${row('Public/Private', account.benchmarks?.publicOrPrivate)}
      </table>`,
      !!(account.benchmarks && Object.values(account.benchmarks || {}).some((v: any) => v != null && v !== '')),
      'benchmarks',
    )}

    ${section(
      'Technology stack',
      techFlat.length
        ? `<div class="tags">${techFlat.map((t: string) => `<span class="tag">${escapeHtml(String(t))}</span>`).join('')}</div>`
        : '<p class="muted">No technologies linked yet.</p>',
      techFlat.length > 0,
      'technologies',
    )}

    ${section(
      'Pipeline stages',
      (() => {
        const stages = [
          'scan',
          'discovery',
          'crawl',
          'extraction',
          'linkedin',
          'brief',
          'verification',
        ];
        const payload = accountPack?.payload || {};
        const researchSet = payload.researchSet || {};
        const hasScan = !!payload.scan;
        const hasDiscovery = !!payload.discovery || !!researchSet.discovery;
        const hasCrawl = !!payload.crawl || !!researchSet.crawl;
        const hasExtraction = !!payload.evidence || !!researchSet.evidence;
        const hasLinkedin = !!payload.linkedin || !!researchSet.linkedin;
        const hasBrief = !!payload.brief || !!researchSet.brief;
        const hasVerification = !!payload.verification || !!researchSet.verification;
        const present = { scan: hasScan, discovery: hasDiscovery, crawl: hasCrawl, extraction: hasExtraction, linkedin: hasLinkedin, brief: hasBrief, verification: hasVerification };
        return stages
          .map(
            (s) =>
              `<span class="tag tag--${present[s as keyof typeof present] ? 'done' : completedStages.includes(s) ? 'progress' : 'missing'}">${DIMENSION_LABELS[s] || s}: ${present[s as keyof typeof present] ? 'Done' : completedStages.includes(s) ? 'In progress' : 'Missing'}</span>`,
          )
          .join('');
      })(),
      true,
    )}

    ${section(
      'Competitors & classification',
      `<table>
        ${row('Competitors researched', account.competitorResearch?.count != null ? String(account.competitorResearch.count) : null)}
        ${row('Industry (classification)', account.classification?.industry)}
        ${row('Tags', Array.isArray(account.classification?.tags) ? account.classification.tags.join(', ') : null)}
        ${row('Opportunity tier', account.classification?.opportunityTier)}
        ${row('AI readiness tier', account.classification?.aiReadinessTier)}
      </table>`,
      !!(account.competitorResearch || account.classification),
      'competitors',
    )}

    ${section(
      'Leadership',
      leadership.length
        ? leadership
            .map(
              (p: any) =>
                `<div class="pain-item">${escapeHtml(p?.name || '—')}${p?.headline ? ` · ${escapeHtml(p.headline)}` : ''}</div>`,
            )
            .join('')
        : '<p class="muted">No leadership contacts yet.</p>',
      leadership.length > 0,
      'leadership',
    )}

    ${section(
      'Pain points',
      painPoints.length
        ? painPoints
            .map(
              (p: any) =>
                `<div class="pain-item"><strong>${escapeHtml(p.category || 'General')}</strong>${p.severity ? ` · ${escapeHtml(p.severity)}` : ''}${p.description ? `<div style="margin-top:4px;color:#64748b">${escapeHtml(p.description)}</div>` : ''}</div>`,
            )
            .join('')
        : '<p class="muted">No pain points yet.</p>',
      painPoints.length > 0,
      'painPoints',
    )}

    ${section(
      'Profile gaps',
      gaps.length
        ? `<p>Missing: ${gaps.map((g: string) => DIMENSION_LABELS[g] || g).join(', ')}</p><p><a href="${escapeHtml(basePath)}?action=queue-enrichment" class="btn btn--primary">Queue missing enrichment</a></p>`
        : '<p class="muted">No gaps — profile is complete.</p>',
      false,
    )}
  </div>
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
