/**
 * Seed a default moltbot.config into Sanity.
 * Usage: SANITY_PROJECT_ID=... SANITY_TOKEN=... node --loader ts-node/esm scripts/seed-molt-config.ts
 */

import { getDefaultToolRegistryConfig } from '../src/lib/toolRegistry.ts';

const projectId = process.env.SANITY_PROJECT_ID;
const dataset = process.env.SANITY_DATASET || 'production';
const token = process.env.SANITY_TOKEN || process.env.SANITY_API_TOKEN;
const apiVersion = process.env.SANITY_API_VERSION || '2023-10-01';

if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_TOKEN');
  process.exit(1);
}

const baseUrl = `https://${projectId}.api.sanity.io/v${apiVersion}`;
const queryUrl = `${baseUrl}/data/query/${dataset}`;
const mutateUrl = `${baseUrl}/data/mutate/${dataset}`;

async function sanityFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Sanity error ${response.status}: ${text}`);
  }
  return response.json();
}

async function run() {
  const existing = await sanityFetch(`${queryUrl}?query=*[_type == "moltbot.config"][0]`);
  if (existing?.result?._id) {
    console.log('moltbot.config already exists:', existing.result._id);
    return;
  }

  const config = getDefaultToolRegistryConfig({
    MOLT_TOOL_BASE_URL: process.env.MOLT_TOOL_BASE_URL || '',
    MOLT_RESEARCH_TOOL_URL: process.env.MOLT_RESEARCH_TOOL_URL || '',
    MOLT_GMAIL_TOOL_URL: process.env.MOLT_GMAIL_TOOL_URL || '',
    MOLT_CALENDAR_TOOL_URL: process.env.MOLT_CALENDAR_TOOL_URL || '',
    MOLT_SLACK_TOOL_URL: process.env.MOLT_SLACK_TOOL_URL || '',
    MOLT_WEB_SEARCH_TOOL_URL: process.env.MOLT_WEB_SEARCH_TOOL_URL || '',
    MOLT_SUMMARIZE_TOOL_URL: process.env.MOLT_SUMMARIZE_TOOL_URL || '',
    MOLT_MEMORY_SEARCH_TOOL_URL: process.env.MOLT_MEMORY_SEARCH_TOOL_URL || '',
    MOLT_WHISPER_TOOL_URL: process.env.MOLT_WHISPER_TOOL_URL || '',
    MOLT_WRANGLER_TOOL_URL: process.env.MOLT_WRANGLER_TOOL_URL || '',
    MOLT_GITHUB_TOOL_URL: process.env.MOLT_GITHUB_TOOL_URL || '',
    MOLT_SF_BASE_URL: process.env.MOLT_SF_BASE_URL || '',
    MOLT_OUTREACH_BASE_URL: process.env.MOLT_OUTREACH_BASE_URL || '',
  });

  config._id = `moltbot.config.default`;

  await sanityFetch(mutateUrl, {
    method: 'POST',
    body: JSON.stringify({
      mutations: [{ createIfNotExists: config }],
    }),
  });

  console.log('Seeded moltbot.config.default');
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
