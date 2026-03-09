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

async function deleteMocks() {
  const query = encodeURIComponent(`*[_type == "actionCandidate"]`);
  const url = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${query}`;
  
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  
  if (!data.result || data.result.length === 0) {
    console.log('No action candidates found.');
    return;
  }

  const mutations = data.result.map(doc => ({
    delete: { id: doc._id }
  }));

  const mutateUrl = `https://${projectId}.api.sanity.io/v${apiVersion}/data/mutate/${dataset}`;
  await fetch(mutateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ mutations })
  });
  console.log(`Deleted ${mutations.length} mock action candidates.`);
}

deleteMocks();
