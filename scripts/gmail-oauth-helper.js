#!/usr/bin/env node
/**
 * One-time OAuth helper: get Gmail refresh token for the worker.
 * Reads GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from .dev.vars or env.
 * Opens browser to Google sign-in; after consent, prints GMAIL_REFRESH_TOKEN.
 *
 * Prerequisites:
 * - Google Cloud project with Gmail API enabled.
 * - OAuth client (Web application) with redirect URI: http://localhost:3456/callback
 * - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .dev.vars (or env).
 *
 * Usage: node scripts/gmail-oauth-helper.js
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const REDIRECT_PORT = 3456;
const REDIRECT_PATH = '/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

function loadDevVars() {
  const path = join(rootDir, '.dev.vars');
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

const env = { ...process.env, ...loadDevVars() };
const clientId = (env.GMAIL_CLIENT_ID || '').trim();
const clientSecret = (env.GMAIL_CLIENT_SECRET || '').trim();

if (!clientId || !clientSecret) {
  console.error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .dev.vars (or env), then run again.');
  process.exit(1);
}

const redirectUri = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '', `http://localhost:${REDIRECT_PORT}`);
  if (url.pathname !== REDIRECT_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<p>Authorization failed: ${error}</p><p>You can close this tab.</p>`
    );
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing code');
    return;
  }

  let refreshToken = null;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const data = await tokenRes.json();
    if (data.refresh_token) refreshToken = data.refresh_token;
  } catch (e) {
    console.error('Token exchange error:', e.message);
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (refreshToken) {
    res.end(
      '<p>Success. You can close this tab and check the terminal for the refresh token.</p>'
    );
  } else {
    res.end(
      '<p>Could not get refresh token. Check the terminal for errors.</p>'
    );
  }

  server.close();

  if (refreshToken) {
    console.log('\nAdd this to .dev.vars (or set as wrangler secret for production):\n');
    console.log('GMAIL_REFRESH_TOKEN=' + refreshToken);
    console.log('');
  } else {
    console.error('No refresh_token in response. Try again and ensure you accept all requested permissions.');
    process.exit(1);
  }
});

server.listen(REDIRECT_PORT, '127.0.0.1', () => {
  console.log('Opening browser for Google sign-in…');
  console.log('If it does not open, visit:', authUrl.toString());
  console.log('');
  try {
    const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${open} "${authUrl.toString()}"`, { stdio: 'inherit' });
  } catch {
    // ignore
  }
});
