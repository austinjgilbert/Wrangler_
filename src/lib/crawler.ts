/**
 * Bounded crawler with robots.txt compliance and snapshot storage.
 */

import { canFetchUrl } from './robots.ts';

function extractLinks(html: string, baseUrl: string): string[] {
  const links = Array.from(html.matchAll(/href=["']([^"']+)["']/g)).map((m) => m[1]);
  const resolved = links
    .map((href) => {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean) as string[];
  return Array.from(new Set(resolved));
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

export async function crawlSite({
  seedUrl,
  env,
  maxDepth = 1,
  maxPages = 5,
}: {
  seedUrl: string;
  env: any;
  maxDepth?: number;
  maxPages?: number;
}) {
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: seedUrl, depth: 0 }];
  const snapshots: Array<{ url: string; status: number; snippet: string; fetchedAt: string; robotsAllowed: boolean }> = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);

    const allowed = await canFetchUrl(url, env);
    if (!allowed) {
      snapshots.push({
        url,
        status: 0,
        snippet: '',
        fetchedAt: new Date().toISOString(),
        robotsAllowed: false,
      });
      continue;
    }

    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    const snippet = sanitizeHtml(html);
    snapshots.push({
      url,
      status: res.status,
      snippet,
      fetchedAt: new Date().toISOString(),
      robotsAllowed: true,
    });

    if (depth < maxDepth) {
      const links = extractLinks(html, url)
        .filter((link) => link.startsWith(new URL(seedUrl).origin));
      for (const link of links) {
        if (!visited.has(link) && queue.length < maxPages) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }
  }

  return snapshots;
}
