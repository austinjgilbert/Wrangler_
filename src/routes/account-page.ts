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
      summary: string,
      fullContent: string,
      isPresent: boolean,
      gapKey?: string,
    ) => {
      const gap = gapKey ? gaps.includes(gapKey) : false;
      const sectionId = (gapKey || title.replace(/\s+/g, '-').toLowerCase()).replace(/[^a-z0-9-]/g, '-');
      return `
      <section class="card card--clickable ${isPresent ? '' : 'card--empty'}" data-section="${escapeHtml(sectionId)}">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        <div class="section-summary" data-section-title="${escapeHtml(title)}">${summary}</div>
        <div class="section-full-details" data-section-id="${escapeHtml(sectionId)}" style="display:none">${fullContent}</div>
        ${gap ? `<p class="section-hint">Missing — queue enrichment to fill.</p>` : ''}
        <div class="section-actions">
          <button type="button" class="btn btn--secondary btn--details">View full details</button>
          <button type="button" class="btn btn--primary btn--enrich" data-section="${escapeHtml(sectionId)}" data-label="${escapeHtml(title)}">Queue enrichment</button>
        </div>
      </section>`;
    };

    const row = (label: string, value: string | number | null | undefined) =>
      `<tr><td class="row-label">${escapeHtml(label)}</td><td>${value != null && value !== '' ? escapeHtml(String(value)) : '<span class="muted">—</span>'}</td></tr>`;

    const techStackCategories: [string, string][] = [
      ['cms', 'Primary CMS'],
      ['frameworks', 'Frameworks'],
      ['legacySystems', 'Legacy systems'],
      ['pimSystems', 'PIM systems'],
      ['damSystems', 'DAM systems'],
      ['lmsSystems', 'LMS systems'],
      ['analytics', 'Analytics'],
      ['ecommerce', 'E‑commerce'],
      ['hosting', 'Hosting'],
      ['marketing', 'Marketing'],
      ['payments', 'Payments'],
      ['chat', 'Chat'],
      ['monitoring', 'Monitoring'],
      ['authProviders', 'Auth providers'],
      ['searchTech', 'Search'],
      ['cssFrameworks', 'CSS frameworks'],
      ['cdnMedia', 'CDN / media'],
    ];
    const techStackFullHtml = (() => {
      const ts = account.technologyStack || {};
      const parts: string[] = [];
      for (const [key, label] of techStackCategories) {
        const arr = ts[key];
        if (Array.isArray(arr) && arr.length > 0) {
          parts.push(`<div class="detail-block"><strong>${escapeHtml(label)}</strong><div class="tags">${arr.map((t: string) => `<span class="tag">${escapeHtml(String(t))}</span>`).join('')}</div></div>`);
        }
      }
      const linked = (account.technologies || []).map((t: any) => t?.name ?? t).filter(Boolean);
      if (linked.length > 0) {
        parts.push(`<div class="detail-block"><strong>Linked technologies</strong><div class="tags">${linked.map((t: string) => `<span class="tag">${escapeHtml(String(t))}</span>`).join('')}</div></div>`);
      }
      return parts.length ? parts.join('') : '<p class="muted">No technology data yet.</p>';
    })();

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
    .section-actions { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #f1f5f9; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
    .btn--enrich { font-size: 0.8rem; padding: 0.35rem 0.75rem; }
    .btn--details { font-size: 0.8rem; padding: 0.35rem 0.75rem; }
    .btn:disabled { opacity: 0.7; cursor: not-allowed; }
    .section-summary { font-size: 0.95rem; color: #334155; }
    .card--clickable .section-summary { cursor: pointer; }
    .detail-block { margin-bottom: 1rem; }
    .detail-block strong { display: block; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.35rem; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; align-items: center; justify-content: center; padding: 1rem; }
    .modal-overlay.is-open { display: flex; }
    .modal-content { background: #fff; border-radius: 12px; max-width: 560px; width: 100%; max-height: 85vh; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #e2e8f0; }
    .modal-title { margin: 0; font-size: 1rem; font-weight: 600; color: #1e293b; }
    .modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: #64748b; cursor: pointer; padding: 0.25rem; }
    .modal-close:hover { color: #1e293b; }
    .modal-body { padding: 1.25rem; overflow: auto; font-size: 0.95rem; }
  </style>
</head>
<body>
  <div class="container" data-account-key="${escapeHtml(accountKey || '')}" data-canonical-url="${escapeHtml(canonicalUrl)}" data-enrichment-active="${jobStatus === 'pending' || jobStatus === 'in_progress' ? '1' : ''}">
    ${queued ? '<div class="notice" id="queued-notice">Enrichment queued. Progress will update below.</div>' : ''}

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

    <section class="card card--clickable" id="enrichment-progress-card">
      <h2 class="section-title">Enrichment progress</h2>
      <div class="section-summary" data-section-title="Enrichment progress">${jobStatus ? `${jobStatus} · ${Math.round((completedStages.length / 7) * 100)}% · ${currentStage || '—'}` : 'No job yet'}</div>
      <div class="section-body" id="enrichment-progress-content">
        ${jobStatus
          ? `<p><strong>Status:</strong> ${escapeHtml(jobStatus)}</p>
             ${currentStage ? `<p><strong>Current stage:</strong> ${escapeHtml(currentStage)}</p>` : ''}
             <div class="progress-bar"><div class="progress-fill" style="width: ${Math.round((completedStages.length / 7) * 100)}%"></div></div>
             <p class="section-hint">Completed: ${(completedStages as string[]).length ? (completedStages as string[]).join(', ') : 'none yet'}</p>`
          : '<p class="muted">No enrichment job yet. Use "Queue enrichment" on any section below to start.</p>'}
      </div>
      <div class="section-full-details" data-section-id="enrichment-progress" style="display:none"><div id="enrichment-progress-full-content"></div></div>
      <div class="section-actions">
        <button type="button" class="btn btn--secondary btn--details">View full details</button>
        <button type="button" class="btn btn--primary btn--enrich" data-section="enrichment-progress" data-label="Enrichment progress">Queue enrichment</button>
      </div>
    </section>

    ${section(
      'Overview',
      [account.industry, account.classification?.segment, account.lastScannedAt ? new Date(account.lastScannedAt).toLocaleDateString() : null].filter(Boolean).join(' · ') || '—',
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
      (() => {
        const b = account.benchmarks || {};
        const parts = [b.estimatedEmployees, b.estimatedRevenue, b.headquarters].filter((v: any) => v != null && v !== '');
        return parts.length ? parts.join(' · ') : '—';
      })(),
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
      techFlat.length ? `${techFlat.length} technologies${techStack.cms?.length ? ` · CMS: ${(techStack.cms as string[]).slice(0, 3).join(', ')}${(techStack.cms as string[]).length > 3 ? '…' : ''}` : ''}` : 'No technologies yet',
      techStackFullHtml,
      techFlat.length > 0,
      'technologies',
    )}

    ${section(
      'Pipeline stages',
      (() => {
        const payload = accountPack?.payload || {};
        const researchSet = payload.researchSet || {};
        const done = [!!payload.scan, !!payload.discovery || !!researchSet.discovery, !!payload.crawl || !!researchSet.crawl, !!payload.evidence || !!researchSet.evidence, !!payload.linkedin || !!researchSet.linkedin, !!payload.brief || !!researchSet.brief, !!payload.verification || !!researchSet.verification].filter(Boolean).length;
        return `${done}/7 stages complete${currentStage ? ` · Current: ${currentStage}` : ''}`;
      })(),
      (() => {
        const stages = ['scan', 'discovery', 'crawl', 'extraction', 'linkedin', 'brief', 'verification'];
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
        return stages.map((s) => `<span class="tag tag--${present[s as keyof typeof present] ? 'done' : completedStages.includes(s) ? 'progress' : 'missing'}">${DIMENSION_LABELS[s] || s}: ${present[s as keyof typeof present] ? 'Done' : completedStages.includes(s) ? 'In progress' : 'Missing'}</span>`).join('');
      })(),
      true,
    )}

    ${section(
      'Competitors & classification',
      [account.competitorResearch?.count != null ? `${account.competitorResearch.count} competitors` : null, account.classification?.industry].filter(Boolean).join(' · ') || '—',
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
      leadership.length ? `${leadership.length} person(s)` : 'No leadership yet',
      leadership.length
        ? leadership.map((p: any) => `<div class="pain-item">${escapeHtml(p?.name || '—')}${p?.headline ? ` · ${escapeHtml(p.headline)}` : ''}</div>`).join('')
        : '<p class="muted">No leadership contacts yet.</p>',
      leadership.length > 0,
      'leadership',
    )}

    ${section(
      'Pain points',
      painPoints.length ? `${painPoints.length} pain point(s)` : 'No pain points yet',
      painPoints.length
        ? painPoints.map((p: any) => `<div class="pain-item"><strong>${escapeHtml(p.category || 'General')}</strong>${p.severity ? ` · ${escapeHtml(p.severity)}` : ''}${p.description ? `<div style="margin-top:4px;color:#64748b">${escapeHtml(p.description)}</div>` : ''}</div>`).join('')
        : '<p class="muted">No pain points yet.</p>',
      painPoints.length > 0,
      'painPoints',
    )}

    ${section(
      'Profile gaps',
      gaps.length ? `Missing: ${gaps.length} area(s)` : 'Profile complete',
      gaps.length
        ? `<p>Missing: ${gaps.map((g: string) => DIMENSION_LABELS[g] || g).join(', ')}</p>`
        : '<p class="muted">No gaps — profile is complete.</p>',
      false,
    )}
  </div>

  <div class="modal-overlay" id="details-modal" aria-hidden="true">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title" id="modal-title">Details</h3>
        <button type="button" class="modal-close" id="modal-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  </div>

  <script>
  (function() {
    var container = document.querySelector('.container');
    if (!container) return;
    var accountKey = container.getAttribute('data-account-key');
    var canonicalUrl = container.getAttribute('data-canonical-url');
    var progressEl = document.getElementById('enrichment-progress-content');
    var pollTimer = null;

    function renderProgress(data) {
      if (!progressEl) return;
      if (data.status === 'in_progress') {
        var pct = (data.progress != null ? data.progress : 0);
        var stage = data.currentStage || 'running';
        progressEl.innerHTML = '<p><strong>Status:</strong> in progress</p>' +
          '<p><strong>Current stage:</strong> ' + stage + '</p>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
          '<p class="section-hint">Enrichment is running. This page will update automatically.</p>';
      } else if (data.status === 'complete') {
        progressEl.innerHTML = '<p><strong>Status:</strong> complete</p>' +
          '<div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>' +
          '<p class="section-hint">Done. <a href="' + (window.location.pathname + window.location.search).replace(/[?&]queued=1/, '') + '">Refresh page</a> to see updated data.</p>';
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        document.querySelectorAll('.btn--enrich').forEach(function(b) { b.disabled = false; });
        return;
      } else {
        progressEl.innerHTML = '<p class="muted">No active job. Use "Queue enrichment" on any section to start.</p>';
      }
    }

    function poll() {
      if (!accountKey) return;
      fetch(window.location.origin + '/enrich/status?accountKey=' + encodeURIComponent(accountKey))
        .then(function(r) { return r.json(); })
        .then(function(res) {
          var data = (res && res.data && res.data.status && typeof res.data.status === 'object') ? res.data.status : (res.data || res);
          renderProgress(data);
          if (data.status === 'in_progress' && progressEl)
            pollTimer = setTimeout(poll, 4000);
        })
        .catch(function() {
          if (progressEl) progressEl.innerHTML = '<p class="muted">Could not load status.</p>';
          if (pollTimer) pollTimer = setTimeout(poll, 5000);
        });
    }

    function queueThenPoll() {
      if (!accountKey || !canonicalUrl) return;
      document.querySelectorAll('.btn--enrich').forEach(function(b) { b.disabled = true; });
      if (progressEl) progressEl.innerHTML = '<p class="muted">Queuing enrichment...</p>';
      fetch(window.location.origin + '/enrich/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountKey: accountKey, canonicalUrl: canonicalUrl })
      })
        .then(function(r) { return r.json(); })
        .then(function(res) {
          var ok = res && (res.ok === true || (res.data && res.data.queued));
          if (progressEl)
            progressEl.innerHTML = ok ? '<p class="muted">Queued. Checking progress...</p>' : '<p class="muted">' + (res.data && res.data.message || 'Queue failed.') + '</p>';
          if (ok) setTimeout(poll, 1500);
          else document.querySelectorAll('.btn--enrich').forEach(function(b) { b.disabled = false; });
        })
        .catch(function() {
          if (progressEl) progressEl.innerHTML = '<p class="muted">Request failed. Try again.</p>';
          document.querySelectorAll('.btn--enrich').forEach(function(b) { b.disabled = false; });
        });
    }

    document.querySelectorAll('.btn--enrich').forEach(function(btn) {
      btn.addEventListener('click', queueThenPoll);
    });

    var modal = document.getElementById('details-modal');
    var modalTitle = document.getElementById('modal-title');
    var modalBody = document.getElementById('modal-body');
    var modalClose = document.getElementById('modal-close');

    function openModal(title, content) {
      if (!modal || !modalTitle || !modalBody) return;
      modalTitle.textContent = title;
      modalBody.innerHTML = content || '';
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }

    function openDetailsForSection(sectionEl) {
      if (!sectionEl) return;
      var titleEl = sectionEl.querySelector('.section-summary');
      var fullEl = sectionEl.querySelector('.section-full-details');
      var title = (titleEl && titleEl.getAttribute('data-section-title')) || sectionEl.querySelector('.section-title')?.textContent || 'Details';
      var sectionId = fullEl && fullEl.getAttribute('data-section-id');
      var content;
      if (sectionId === 'enrichment-progress') {
        var progressContent = document.getElementById('enrichment-progress-content');
        content = progressContent ? progressContent.innerHTML : '';
      } else {
        content = fullEl ? fullEl.innerHTML : '';
      }
      openModal(title, content);
    }

    document.querySelectorAll('.btn--details').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var card = btn.closest('.card');
        if (card) openDetailsForSection(card);
      });
    });

    document.querySelectorAll('.card--clickable .section-summary').forEach(function(summary) {
      summary.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        var card = summary.closest('.card');
        if (card) openDetailsForSection(card);
      });
    });

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });

    if (container.getAttribute('data-enrichment-active') === '1' || (window.location.search || '').indexOf('queued=1') !== -1) {
      poll();
    }
  })();
  <\/script>
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
