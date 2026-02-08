/**
 * Extract structured facts from sanitized snapshots.
 * Assumptions: simple regex extraction for demo.
 */

export function extractAccountFacts(snippets: string[]) {
  const facts: any = {};
  const combined = snippets.join(' ');
  const industryMatch = combined.match(/industry[:\s]+([a-zA-Z\s]+)/i);
  if (industryMatch) facts.industry = industryMatch[1].trim();
  return facts;
}

export function extractTechSignals(snippets: string[]) {
  const techs: string[] = [];
  const combined = snippets.join(' ').toLowerCase();
  if (combined.includes('react')) techs.push('React');
  if (combined.includes('wordpress')) techs.push('WordPress');
  if (combined.includes('shopify')) techs.push('Shopify');
  if (combined.includes('cloudflare')) techs.push('Cloudflare');
  return Array.from(new Set(techs));
}

export function extractPersonFacts(snippets: string[]) {
  const facts: any = {};
  const combined = snippets.join(' ');
  const titleMatch = combined.match(/title[:\s]+([a-zA-Z\s]+)/i);
  if (titleMatch) facts.title = titleMatch[1].trim();
  return facts;
}
