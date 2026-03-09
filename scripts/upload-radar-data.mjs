#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let projectId, token, dataset = 'production', apiVersion = '2023-10-01';
try {
  const content = readFileSync(join(root, '.dev.vars'), 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...vals] = trimmed.split('=');
    const val = vals.join('=').replace(/^["']|["']$/g, '').trim();
    if (key === 'SANITY_PROJECT_ID') projectId = val;
    if (key === 'SANITY_TOKEN') token = val;
  });
} catch (e) {}

const dataPath = join(root, 'data', 'primary-named-accounts.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const validDomains = (data.domains || []).filter(d => 
  d.includes('.') && 
  !d.startsWith('$') && 
  !/^\d+\.\d+\.\d+\.\d+$/.test(d)
).slice(0, 25);

const mutations = validDomains.map(domain => {
  const accountKey = domain.replace(/[^a-zA-Z0-9-]/g, '-');
  return {
    createOrReplace: {
      _id: `actionCandidate.${accountKey}`,
      _type: 'actionCandidate',
      account: { _type: 'reference', _ref: `account.${accountKey}` },
      actionType: 'create_followup_task',
      confidence: Math.floor(Math.random() * 40) + 60,
      patternMatch: 'high_intent_docs_visit',
      signals: ['docs_engagement', 'pricing_page_visit'],
      whyNow: `Strong engagement on developer docs and pricing for ${domain}.`,
      opportunityScore: Math.floor(Math.random() * 50) + 50,
      lifecycleStatus: 'suggested'
    }
  };
});

async function upload() {
  const url = `https://${projectId}.api.sanity.io/v${apiVersion}/data/mutate/${dataset}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mutations })
  });
  const result = await res.json();
  if (!res.ok) console.error(result);
  else console.log('Created action candidates for radar.');
}

upload();
