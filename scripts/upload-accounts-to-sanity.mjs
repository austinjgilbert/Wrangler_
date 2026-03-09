#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load environment variables for Sanity from .dev.vars
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
} catch (e) {
  console.log('Could not read .dev.vars. Trying process.env.');
  projectId = process.env.SANITY_PROJECT_ID;
  token = process.env.SANITY_TOKEN;
}

if (!projectId || !token) {
  console.error('Missing SANITY_PROJECT_ID or SANITY_TOKEN in .dev.vars');
  process.exit(1);
}

const dataPath = join(root, 'data', 'primary-named-accounts.json');
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

// Filter out obvious junk
const validDomains = (data.domains || []).filter(d => 
  d.includes('.') && 
  !d.startsWith('$') && 
  !/^\d+\.\d+\.\d+\.\d+$/.test(d)
);

console.log(`Uploading all ${validDomains.length} domains to Sanity...`);

const mutations = validDomains.map(domain => {
  const accountKey = domain.replace(/[^a-zA-Z0-9-]/g, '-');
  return {
    createOrReplace: {
      _id: `account.${accountKey}`,
      _type: 'account',
      accountKey: accountKey,
      domain: domain,
      rootDomain: domain,
      name: domain.split('.')[0],
      companyName: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
      profileCompleteness: {
        score: 0,
        gaps: ['scan', 'discovery', 'crawl'],
        nextStages: ['initial_scan']
      },
      tags: ['named-account', 'uploaded']
    }
  };
});

// Upload in batches
async function uploadBatches() {
  const url = `https://${projectId}.api.sanity.io/v${apiVersion}/data/mutate/${dataset}`;
  
  for (let i = 0; i < mutations.length; i += 50) {
    const batch = mutations.slice(i, i + 50);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ mutations: batch })
    });
    const result = await res.json();
    if (!res.ok) {
      console.error('Error uploading batch:', result);
    } else {
      console.log(`Uploaded batch ${Math.floor(i/50) + 1} of ${Math.ceil(mutations.length/50)}`);
    }
  }
}

uploadBatches().then(() => {
  console.log('Done! All real accounts uploaded.');
});
