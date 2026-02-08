/**
 * robots.txt helper
 * Assumption: simple Allow/Disallow parsing by path prefix.
 */

function parseRobots(text: string) {
  const lines = text.split('\n').map((l) => l.trim());
  const rules: { allow: string[]; disallow: string[] } = { allow: [], disallow: [] };
  let userAgentStar = false;
  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) {
      userAgentStar = line.toLowerCase().includes('*');
    } else if (userAgentStar && line.toLowerCase().startsWith('allow:')) {
      rules.allow.push(line.split(':')[1]?.trim() || '/');
    } else if (userAgentStar && line.toLowerCase().startsWith('disallow:')) {
      rules.disallow.push(line.split(':')[1]?.trim() || '/');
    }
  }
  return rules;
}

export async function canFetchUrl(url: string, env: any) {
  const allowlist = (env.CRAWL_ALLOWLIST || '')
    .split(',')
    .map((d: string) => d.trim())
    .filter(Boolean);
  const host = new URL(url).hostname;
  if (allowlist.length > 0 && !allowlist.includes(host)) return false;

  try {
    const robotsUrl = `${new URL(url).origin}/robots.txt`;
    const res = await fetch(robotsUrl);
    if (!res.ok) return false;
    const text = await res.text();
    const rules = parseRobots(text);
    const path = new URL(url).pathname;
    if (rules.allow.some((p) => path.startsWith(p))) return true;
    if (rules.disallow.some((p) => p === '/' || path.startsWith(p))) return false;
    return true;
  } catch (_error) {
    return false;
  }
}
