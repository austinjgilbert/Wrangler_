#!/usr/bin/env node
/**
 * One-command setup for website-scanner-worker.
 * Installs dependencies, creates .dev.vars from .dev.vars.example (or .env.example) if missing,
 * and runs dependency check. Safe to run multiple times.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootDir = path.resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`\n\x1b[36m▶\x1b[0m ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: opts.cwd || rootDir });
  } catch (e) {
    if (opts.ignore) return;
    process.exit(1);
  }
}

console.log('\x1b[1mWebsite Scanner Worker — Setup\x1b[0m\n');

// 1. Root npm install
run('npm install');

// 2. Sanity
const sanityDir = path.join(rootDir, 'sanity');
if (fs.existsSync(sanityDir) && fs.existsSync(path.join(sanityDir, 'package.json'))) {
  run('npm install', { cwd: sanityDir });
}

// 3. .dev.vars from .dev.vars.example (or .env.example) if missing
const devVars = path.join(rootDir, '.dev.vars');
const devVarsExample = path.join(rootDir, '.dev.vars.example');
const envExample = path.join(rootDir, '.env.example');
if (!fs.existsSync(devVars)) {
  if (fs.existsSync(devVarsExample)) {
    fs.copyFileSync(devVarsExample, devVars);
    console.log('\x1b[32m✓\x1b[0m Created .dev.vars from .dev.vars.example — set SANITY_PROJECT_ID and SANITY_TOKEN for local dev.');
  } else if (fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, devVars);
    console.log('\x1b[32m✓\x1b[0m Created .dev.vars from .env.example — set SANITY_PROJECT_ID and SANITY_TOKEN for local dev.');
  } else {
    console.log('\x1b[33m⚠\x1b[0m No .dev.vars.example or .env.example found; create .dev.vars manually with required vars.');
  }
} else {
  console.log('\x1b[32m✓\x1b[0m .dev.vars already exists.');
}

// 4. Sanity .env from example if missing
const sanityEnv = path.join(sanityDir, '.env');
const sanityEnvExample = path.join(sanityDir, '.env.example');
if (fs.existsSync(sanityDir) && !fs.existsSync(sanityEnv) && fs.existsSync(sanityEnvExample)) {
  fs.copyFileSync(sanityEnvExample, sanityEnv);
  console.log('\x1b[32m✓\x1b[0m Created sanity/.env from sanity/.env.example.');
}

// 5. Dependency check
console.log('\n\x1b[1mDependency check\x1b[0m');
try {
  execSync('node scripts/check-deps.js', { stdio: 'inherit', cwd: rootDir });
} catch {
  console.log('\n\x1b[33mFix the issues above, then run: npm run dev\x1b[0m');
  process.exit(1);
}

console.log('\n\x1b[1mNext steps\x1b[0m');
console.log('  1. Edit .dev.vars with SANITY_PROJECT_ID, SANITY_TOKEN (and optional ADMIN_TOKEN, MOLT_API_KEY).');
console.log('  2. Log in to Cloudflare: npx wrangler login');
console.log('  3. Run locally: npm run dev');
console.log('  4. Deploy: npm run deploy (set production secrets with wrangler secret put ... --env=production)');
console.log('');
