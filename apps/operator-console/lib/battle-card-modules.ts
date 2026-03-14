/**
 * Research modules: short titles, one-line purpose, result keys for display.
 */

export interface BattleCardModule {
  id: string;
  title: string;
  purpose: string;
  looksFor: string;
  outputHelps: string;
  resultKeys: string[];
}

export const BATTLE_CARD_MODULES: BattleCardModule[] = [
  {
    id: 'technology-stack',
    title: 'Tech Stack',
    purpose: 'Detects frameworks, CMS, hosting, and dev tooling from the site.',
    looksFor: 'Frameworks, CMS, hosting, analytics.',
    outputHelps: 'Stack overview for technical conversations.',
    resultKeys: ['scan', 'evidence', 'technologyStack', 'cms', 'frameworks'],
  },
  {
    id: 'cms-detection',
    title: 'CMS',
    purpose: 'Identifies the content management system powering the site.',
    looksFor: 'CMS platform and publishing stack.',
    outputHelps: 'Legacy vs modern stack and migration fit.',
    resultKeys: ['scan', 'evidence', 'cms'],
  },
  {
    id: 'market-intelligence',
    title: 'Market',
    purpose: 'Surfaces industry, segment, and positioning from public data.',
    looksFor: 'Industry, segment, company description.',
    outputHelps: 'How to position and which use cases matter.',
    resultKeys: ['brief', 'evidence', 'classification', 'industry'],
  },
  {
    id: 'competitor-analysis',
    title: 'Competitors',
    purpose: 'Finds named competitors and competitive context.',
    looksFor: 'Competitor names and differentiators.',
    outputHelps: 'Who you’re up against and how to differentiate.',
    resultKeys: ['brief', 'evidence', 'competitors', 'competitorResearch'],
  },
  {
    id: 'hiring-signals',
    title: 'Hiring',
    purpose: 'Surfaces hiring and org growth from jobs and leadership.',
    looksFor: 'Open roles, departments, leadership changes.',
    outputHelps: 'Expansion signals to time outreach.',
    resultKeys: ['linkedin', 'brief', 'leadership', 'signals'],
  },
  {
    id: 'developer-tooling',
    title: 'Dev Tools',
    purpose: 'Identifies dev experience, CI/CD, APIs from technical signals.',
    looksFor: 'Dev tools, APIs, engineering practices.',
    outputHelps: 'Technical fit and integration opportunities.',
    resultKeys: ['scan', 'evidence', 'technologies', 'frameworks'],
  },
];

export const ENRICHMENT_STAGE_LABELS: Record<string, string> = {
  initial_scan: 'Scanning site',
  discovery: 'Discovering pages',
  crawl: 'Crawling content',
  extraction: 'Extracting evidence',
  linkedin: 'LinkedIn',
  brief: 'Research brief',
  verification: 'Verifying',
};
