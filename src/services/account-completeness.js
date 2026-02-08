/**
 * Account Completeness & Gap Analysis Service
 *
 * Tracks what data exists for an account and determines what research
 * stages still need to run to build a complete profile.
 *
 * A "complete" account (Content OS) has:
 *   - scan (tech stack, performance, AI readiness)
 *   - discovery (page map of the site)
 *   - crawl (content from key pages)
 *   - extraction (evidence, entities, signals)
 *   - linkedin (company + key people profiles)
 *   - brief (executive research brief)
 *   - verification (claims verified against sources)
 *   - competitors (competitive landscape)
 *   - classification (industry, segment, ICP fit, tags)
 *   - technologies (structured tech docs linked to account)
 *   - leadership (person docs for key decision-makers)
 *   - painPoints (structured pain point objects)
 *   - benchmarks (company size, revenue, traffic estimates)
 */

// ─── Completeness Dimensions ────────────────────────────────────────────

const DIMENSIONS = {
  // Pipeline stages (run by research-pipeline.js)
  scan:           { weight: 15, label: 'Website Scan',           stage: 'initial_scan' },
  discovery:      { weight:  6, label: 'Page Discovery',         stage: 'discovery' },
  crawl:          { weight:  6, label: 'Content Crawl',          stage: 'crawl' },
  extraction:     { weight:  6, label: 'Evidence Extraction',    stage: 'extraction' },
  linkedin:       { weight: 10, label: 'LinkedIn Intelligence',  stage: 'linkedin' },
  brief:          { weight: 10, label: 'Research Brief',         stage: 'brief' },
  verification:   { weight:  4, label: 'Claim Verification',     stage: 'verification' },
  // Derived stages (run by gap-fill + content-os-enrichment)
  competitors:    { weight:  8, label: 'Competitive Intel',      stage: null },
  classification: { weight:  5, label: 'Account Classification', stage: null },
  // Content OS dimensions (run by content-os-enrichment.js)
  technologies:   { weight: 10, label: 'Technology Linking',     stage: null },
  leadership:     { weight:  8, label: 'Leadership Team',        stage: null },
  painPoints:     { weight:  7, label: 'Pain Point Analysis',    stage: null },
  benchmarks:     { weight:  5, label: 'Company Benchmarks',     stage: null },
};

/**
 * Analyse an account + accountPack and return a completeness profile.
 *
 * @param {object} account      – account document (or null)
 * @param {object} accountPack  – accountPack document (or null)
 * @param {object} enrichmentJob – latest enrichmentJob document (or null)
 * @returns {{ score: number, dimensions: object, gaps: string[], nextStages: string[] }}
 */
export function analyseCompleteness(account, accountPack, enrichmentJob) {
  const payload = accountPack?.payload || {};

  const filled = {
    // Pipeline stages
    scan:           !!payload.scan,
    discovery:      !!payload.discovery || !!payload.researchSet?.discovery,
    crawl:          !!payload.crawl || !!payload.researchSet?.crawl,
    extraction:     !!payload.evidence || !!payload.researchSet?.evidence,
    linkedin:       !!payload.linkedin || !!payload.researchSet?.linkedin,
    brief:          !!payload.brief || !!payload.researchSet?.brief,
    verification:   !!payload.verification || !!payload.researchSet?.verification,
    // Derived stages
    competitors:    !!payload.competitors || !!account?.competitorResearch,
    classification: !!account?.classification,
    // Content OS dimensions
    technologies:   !!(account?.technologies && account.technologies.length > 0),
    leadership:     !!(account?.leadership && account.leadership.length > 0),
    painPoints:     !!(account?.painPoints && account.painPoints.length > 0),
    benchmarks:     !!(account?.benchmarks && Object.values(account.benchmarks || {}).some(v => v != null && v !== '')),
  };

  let score = 0;
  const dimensions = {};
  const gaps = [];
  const nextStages = [];

  for (const [key, cfg] of Object.entries(DIMENSIONS)) {
    const present = filled[key];
    dimensions[key] = { present, weight: cfg.weight, label: cfg.label };
    if (present) {
      score += cfg.weight;
    } else {
      gaps.push(key);
      if (cfg.stage) nextStages.push(cfg.stage);
    }
  }

  // Classification and competitors are derived — they trigger after enrichment
  if (!filled.competitors && filled.scan) {
    nextStages.push('competitors');
  }
  if (!filled.classification && filled.scan) {
    nextStages.push('classification');
  }

  return { score, dimensions, gaps, nextStages };
}

/**
 * Build a completeness summary suitable for storing on the account document.
 */
export function buildCompletenessSummary(account, accountPack, enrichmentJob) {
  const { score, gaps, nextStages, dimensions } = analyseCompleteness(
    account,
    accountPack,
    enrichmentJob,
  );

  return {
    score,
    gaps,
    nextStages,
    dimensionFlags: Object.fromEntries(
      Object.entries(dimensions).map(([k, v]) => [k, v.present]),
    ),
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Determine whether an account needs background work.
 *
 * Returns { needed: boolean, reason: string, priority: string, stages: string[] }
 */
export function needsBackgroundWork(account, accountPack, enrichmentJob) {
  const { score, gaps, nextStages } = analyseCompleteness(
    account,
    accountPack,
    enrichmentJob,
  );

  // Already complete
  if (score >= 100) {
    return { needed: false, reason: 'Profile complete', priority: 'none', stages: [] };
  }

  // Enrichment already running
  if (enrichmentJob && ['pending', 'in_progress'].includes(enrichmentJob.status)) {
    return {
      needed: false,
      reason: 'Enrichment already in progress',
      priority: 'none',
      stages: [],
      jobId: enrichmentJob.jobId || enrichmentJob._id,
    };
  }

  // Determine priority
  let priority = 'normal';
  if (score < 30)  priority = 'high';
  if (score === 0) priority = 'urgent';
  if (account?.opportunityScore >= 70 && score < 70) priority = 'high';

  return {
    needed: true,
    reason: `Profile ${score}% complete — missing ${gaps.join(', ')}`,
    priority,
    stages: nextStages,
    currentScore: score,
  };
}

/**
 * Given a list of pipeline stages that have already completed,
 * return the *next* stage the pipeline should execute.
 *
 * Respects dependency ordering:
 *   scan → discovery → crawl → extraction → brief → verification → linkedin
 *
 * (LinkedIn can run in parallel with crawl/extraction but we sequence for simplicity.)
 */
export function nextPipelineStage(completedStages = []) {
  const ordered = [
    'initial_scan',
    'discovery',
    'crawl',
    'extraction',
    'linkedin',
    'brief',
    'verification',
  ];

  for (const stage of ordered) {
    if (!completedStages.includes(stage)) {
      return stage;
    }
  }

  return null; // all stages done
}
