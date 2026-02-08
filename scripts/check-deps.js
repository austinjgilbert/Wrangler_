#!/usr/bin/env node
/**
 * Dependency check for website-scanner-worker.
 * Verifies Node, npm, wrangler, and optional Sanity so the project is runnable.
 * Exit code: 0 = all required deps OK, 1 = missing or invalid.
 */

const MIN_NODE_MAJOR = 18;
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rootDir = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

function ok(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg, fix) {
  console.log(`\x1b[31m✗\x1b[0m ${msg}`);
  if (fix) console.log(`  \x1b[33m→\x1b[0m ${fix}`);
  errors++;
}

function warn(msg, fix) {
  console.log(`\x1b[33m⚠\x1b[0m ${msg}`);
  if (fix) console.log(`  \x1b[33m→\x1b[0m ${fix}`);
  warnings++;
}

// Node version
const nodeVersion = process.version;
const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeMajor >= MIN_NODE_MAJOR) {
  ok(`Node.js ${nodeVersion} (>= ${MIN_NODE_MAJOR} required)`);
} else {
  fail(
    `Node.js ${nodeVersion} (need >= ${MIN_NODE_MAJOR})`,
    `Install Node 18+ from https://nodejs.org or use nvm: nvm install 18`
  );
}

// npm
let npmVersion = null;
try {
  npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  ok(`npm ${npmVersion}`);
} catch {
  fail('npm not found', 'Install Node.js (includes npm) from https://nodejs.org');
}

// wrangler (prefer local from node_modules, then npx)
let wranglerOk = false;
const localWrangler = path.join(rootDir, 'node_modules', '.bin', 'wrangler');
if (fs.existsSync(localWrangler)) {
  try {
    const out = execSync(`"${localWrangler}" --version`, { encoding: 'utf8', cwd: rootDir });
    ok(`wrangler (local) ${out.trim()}`);
    wranglerOk = true;
  } catch (e) {
    fail('wrangler (local) failed to run', 'Run: npm install');
  }
}
if (!wranglerOk) {
  try {
    const out = execSync('npx wrangler --version', { encoding: 'utf8', cwd: rootDir });
    ok(`wrangler (npx) ${out.trim()}`);
    wranglerOk = true;
  } catch {
    fail(
      'wrangler not available',
      'Run: npm install (wrangler is a devDependency), or: npx wrangler --version'
    );
  }
}

// package.json and node_modules
if (!fs.existsSync(path.join(rootDir, 'package.json'))) {
  fail('package.json not found', 'Run this script from the project root.');
} else {
  ok('package.json present');
}
if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
  fail('node_modules missing', 'Run: npm install');
} else {
  ok('node_modules present');
}

// Sanity (optional)
const sanityDir = path.join(rootDir, 'sanity');
if (fs.existsSync(sanityDir) && fs.existsSync(path.join(sanityDir, 'package.json'))) {
  if (fs.existsSync(path.join(sanityDir, 'node_modules'))) {
    ok('Sanity Studio dependencies installed');
  } else {
    warn('Sanity Studio node_modules missing', 'Run: npm run setup or cd sanity && npm install');
  }
}

// .dev.vars (optional for run, required for local dev)
const devVars = path.join(rootDir, '.dev.vars');
if (!fs.existsSync(devVars)) {
  warn(
    '.dev.vars not found (needed for local dev)',
    'Run: cp .env.example .dev.vars and add SANITY_PROJECT_ID, SANITY_TOKEN'
  );
} else {
  ok('.dev.vars exists');
}

console.log('');
if (errors > 0) {
  console.log('\x1b[31m✗ Dependency check failed\x1b[0m — fix the items above and run again.');
  process.exit(1);
}
if (warnings > 0) {
  console.log('\x1b[33m⚠ Some optional items need attention.\x1b[0m');
}
console.log('\x1b[32m✓ Ready to run and deploy.\x1b[0m');
process.exit(0);
