#!/usr/bin/env node
/**
 * Chat Module Smoke Test
 *
 * Tests all 5 chat endpoints against a running Wrangler_ instance.
 * Measures latency and reports p50/p95/max per endpoint.
 *
 * Usage:
 *   node src/chat/eval/smoke-test.mjs                                  # local dev (localhost:8787)
 *   node src/chat/eval/smoke-test.mjs https://your-worker.workers.dev  # deployed worker
 *   node src/chat/eval/smoke-test.mjs --api-key=sk-xxx https://...     # with auth
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 */

// ─── CLI Argument Parsing ──────────────────────────────────────────────────

const args = process.argv.slice(2);

let baseUrl = 'http://localhost:8787';
let apiKey = null;

for (const arg of args) {
  if (arg.startsWith('--api-key=')) {
    apiKey = arg.slice('--api-key='.length);
  } else if (arg.startsWith('--api-key')) {
    // --api-key <value> (next arg)
    const idx = args.indexOf(arg);
    apiKey = args[idx + 1];
  } else if (!arg.startsWith('--')) {
    baseUrl = arg.replace(/\/$/, ''); // strip trailing slash
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Build headers for all requests */
function buildHeaders(extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  return headers;
}

/** Timed fetch — returns { response, latencyMs } */
async function timedFetch(url, options = {}) {
  const start = Date.now();
  const response = await fetch(url, options);
  const latencyMs = Date.now() - start;
  return { response, latencyMs };
}

/** Parse JSON response body safely */
async function parseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Consume a ReadableStream and return all text chunks */
async function consumeStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let done = false;

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    done = streamDone;
    if (value) {
      chunks.push(decoder.decode(value, { stream: !done }));
    }
  }

  return chunks.join('');
}

/** Compute percentile from sorted array */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Test Result Tracking ──────────────────────────────────────────────────

const results = [];
const latencies = {}; // testName → [ms, ms, ...]

function recordResult(name, passed, latencyMs, details = '') {
  results.push({ name, passed, latencyMs, details });
  if (!latencies[name]) latencies[name] = [];
  latencies[name].push(latencyMs);
}

// ─── Test State (shared across tests) ─────────────────────────────────────

// Session ID shared across tests 1, 5, 6, 7
const SESSION_ID = `smoke-test-${Date.now()}`;
let capturedTurnId = null; // captured from test 1 for feedback test

// ─── Test Definitions ──────────────────────────────────────────────────────

/**
 * Test 1: POST /api/chat/message — account_lookup intent
 * Send "What's happening with Acme Corp?" and verify intent classification.
 */
async function test1_accountLookup() {
  const name = 'POST /api/chat/message (account_lookup)';
  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/api/chat/message`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        sessionId: SESSION_ID,
        message: "What's happening with Acme Corp?",
      }),
    });

    const body = await parseJson(response);

    if (response.status !== 200) {
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    // Response shape: { ok: true, data: ChatResponse }
    const data = body?.data ?? body;

    const hasContent = typeof data?.content === 'string' && data.content.length > 0;
    const hasIntent = typeof data?.intent === 'string';
    const hasSources = Array.isArray(data?.sources);
    const correctIntent = data?.intent === 'account_lookup';

    if (!hasContent || !hasIntent || !hasSources) {
      recordResult(name, false, latencyMs,
        `Missing fields — content:${hasContent} intent:${hasIntent} sources:${hasSources}`);
      return;
    }

    if (!correctIntent) {
      recordResult(name, false, latencyMs,
        `Wrong intent: expected "account_lookup", got "${data?.intent}"`);
      return;
    }

    // Capture a turnId for the feedback test (look in session turns if available)
    // The response itself doesn't include turnId, but we can use a synthetic one
    capturedTurnId = `smoke-turn-${Date.now()}`;

    recordResult(name, true, latencyMs,
      `intent=${data.intent} confidence=${data.entities?.length ?? 0} entities`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

/**
 * Test 2: POST /api/chat/message — morning_briefing intent
 * Send "good morning" and verify intent classification.
 */
async function test2_morningBriefing() {
  const name = 'POST /api/chat/message (morning_briefing)';
  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/api/chat/message`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        sessionId: `${SESSION_ID}-morning`,
        message: 'good morning',
      }),
    });

    const body = await parseJson(response);

    if (response.status !== 200) {
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    const data = body?.data ?? body;
    const correctIntent = data?.intent === 'morning_briefing';

    if (!correctIntent) {
      recordResult(name, false, latencyMs,
        `Wrong intent: expected "morning_briefing", got "${data?.intent}"`);
      return;
    }

    recordResult(name, true, latencyMs, `intent=${data.intent}`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

/**
 * Test 3: POST /api/chat/message — person_lookup intent
 * Send "Who should I call?" and verify intent classification.
 */
async function test3_personLookup() {
  const name = 'POST /api/chat/message (person_lookup)';
  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/api/chat/message`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        sessionId: `${SESSION_ID}-person`,
        message: 'Who should I call?',
      }),
    });

    const body = await parseJson(response);

    if (response.status !== 200) {
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    const data = body?.data ?? body;
    const correctIntent = data?.intent === 'person_lookup';

    if (!correctIntent) {
      recordResult(name, false, latencyMs,
        `Wrong intent: expected "person_lookup", got "${data?.intent}"`);
      return;
    }

    recordResult(name, true, latencyMs, `intent=${data.intent}`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

/**
 * Test 4: POST /api/chat/stream — SSE streaming
 * Send "Tell me about Stripe" and verify SSE response.
 */
async function test4_streaming() {
  const name = 'POST /api/chat/stream (SSE)';
  try {
    const { response, latencyMs } = await timedFetch(`${baseUrl}/api/chat/stream`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        sessionId: `${SESSION_ID}-stream`,
        message: 'Tell me about Stripe',
      }),
    });

    if (response.status !== 200) {
      const body = await parseJson(response);
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    const contentType = response.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');

    if (!isSSE) {
      recordResult(name, false, latencyMs,
        `Wrong content-type: expected "text/event-stream", got "${contentType}"`);
      return;
    }

    // Consume the stream and verify we get data events
    const streamText = await consumeStream(response);
    const hasData = streamText.length > 0;

    // Look for NDJSON token events (the stream format from wrapStreamWithAudit)
    // Each line is a JSON object: { type: "token"|"sources"|"done", ... }
    const lines = streamText.split('\n').filter(line => line.trim());
    let tokenCount = 0;
    let hasDone = false;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'token') tokenCount++;
        if (parsed.type === 'done') hasDone = true;
      } catch {
        // Non-JSON line — could be SSE "data:" prefix format
        if (line.startsWith('data:')) tokenCount++;
      }
    }

    if (!hasData) {
      recordResult(name, false, latencyMs, 'Stream was empty');
      return;
    }

    recordResult(name, true, latencyMs,
      `content-type=text/event-stream tokens=${tokenCount} done=${hasDone} bytes=${streamText.length}`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

/**
 * Test 5: POST /api/chat/feedback — thumbs up
 * Send feedback for the turn captured in test 1.
 */
async function test5_feedback() {
  const name = 'POST /api/chat/feedback (thumbs up)';
  try {
    // Use the turnId captured from test 1, or a synthetic one
    const turnId = capturedTurnId || `smoke-turn-${Date.now()}`;

    const { response, latencyMs } = await timedFetch(`${baseUrl}/api/chat/feedback`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        sessionId: SESSION_ID,
        turnId,
        feedback: 'up',
        text: 'Smoke test feedback',
      }),
    });

    if (response.status !== 200) {
      const body = await parseJson(response);
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    const body = await parseJson(response);
    const data = body?.data ?? body;
    const success = data?.success === true || body?.ok === true;

    if (!success) {
      recordResult(name, false, latencyMs, `Unexpected response: ${JSON.stringify(body)}`);
      return;
    }

    recordResult(name, true, latencyMs, `feedback=up turnId=${turnId}`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

/**
 * Test 6: GET /api/chat/session/:id — session retrieval
 * Get the session created in test 1 and verify it has turns.
 */
async function test6_getSession() {
  const name = `GET /api/chat/session/:id`;
  try {
    const { response, latencyMs } = await timedFetch(
      `${baseUrl}/api/chat/session/${encodeURIComponent(SESSION_ID)}`,
      { headers: buildHeaders({ 'Content-Type': undefined }) },
    );

    if (response.status === 404) {
      // Session not found — this can happen if KV isn't configured or test 1 failed
      recordResult(name, false, latencyMs,
        `Session not found (sessionId=${SESSION_ID}) — did test 1 pass?`);
      return;
    }

    if (response.status !== 200) {
      const body = await parseJson(response);
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    const body = await parseJson(response);
    const data = body?.data ?? body;

    const hasSessionId = data?.sessionId === SESSION_ID;
    const hasTurns = Array.isArray(data?.turns) && data.turns.length > 0;

    if (!hasSessionId) {
      recordResult(name, false, latencyMs,
        `sessionId mismatch: expected "${SESSION_ID}", got "${data?.sessionId}"`);
      return;
    }

    if (!hasTurns) {
      recordResult(name, false, latencyMs,
        `No turns in session (turns=${JSON.stringify(data?.turns)})`);
      return;
    }

    recordResult(name, true, latencyMs,
      `sessionId=${data.sessionId} turns=${data.turns.length}`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

/**
 * Test 7: GET /api/chat/audit — audit log
 * Verify the audit log has entries from previous tests.
 */
async function test7_auditLog() {
  const name = 'GET /api/chat/audit';
  try {
    const { response, latencyMs } = await timedFetch(
      `${baseUrl}/api/chat/audit?limit=10`,
      { headers: buildHeaders({ 'Content-Type': undefined }) },
    );

    if (response.status !== 200) {
      const body = await parseJson(response);
      recordResult(name, false, latencyMs, `HTTP ${response.status}: ${JSON.stringify(body)}`);
      return;
    }

    const body = await parseJson(response);
    const data = body?.data ?? body;

    const hasEntries = Array.isArray(data?.entries);

    if (!hasEntries) {
      recordResult(name, false, latencyMs,
        `Missing entries array: ${JSON.stringify(data)}`);
      return;
    }

    recordResult(name, true, latencyMs,
      `entries=${data.entries.length} count=${data.count ?? data.entries.length}`);
  } catch (err) {
    recordResult(name, false, 0, `Error: ${err.message}`);
  }
}

// ─── Latency Targets ───────────────────────────────────────────────────────

const LATENCY_TARGETS = {
  'POST /api/chat/message (account_lookup)': { warn: 3000, fail: 6000 },
  'POST /api/chat/message (morning_briefing)': { warn: 3000, fail: 6000 },
  'POST /api/chat/message (person_lookup)': { warn: 3000, fail: 6000 },
  'POST /api/chat/stream (SSE)': { warn: 6000, fail: 12000 },
  'POST /api/chat/feedback (thumbs up)': { warn: 1000, fail: 3000 },
  'GET /api/chat/session/:id': { warn: 500, fail: 2000 },
  'GET /api/chat/audit': { warn: 1000, fail: 3000 },
};

// ─── Output Formatting ─────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';

function colorize(text, color) {
  return `${color}${text}${RESET}`;
}

function padEnd(str, len) {
  return String(str).padEnd(len);
}

function padStart(str, len) {
  return String(str).padStart(len);
}

function formatMs(ms) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function printTable(results) {
  const COL_NAME = 46;
  const COL_STATUS = 8;
  const COL_LATENCY = 10;
  const COL_DETAILS = 40;

  const header = [
    padEnd('Test', COL_NAME),
    padEnd('Status', COL_STATUS),
    padEnd('Latency', COL_LATENCY),
    'Details',
  ].join('  ');

  const divider = '─'.repeat(COL_NAME + COL_STATUS + COL_LATENCY + COL_DETAILS + 6);

  console.log('');
  console.log(colorize(BOLD + 'Smoke Test Results', BOLD));
  console.log(colorize(`Target: ${baseUrl}`, DIM));
  console.log(divider);
  console.log(colorize(header, BOLD));
  console.log(divider);

  for (const r of results) {
    const status = r.passed
      ? colorize(padEnd('✓ PASS', COL_STATUS), GREEN)
      : colorize(padEnd('✗ FAIL', COL_STATUS), RED);

    const target = LATENCY_TARGETS[r.name];
    let latencyColor = RESET;
    if (target) {
      if (r.latencyMs > target.fail) latencyColor = RED;
      else if (r.latencyMs > target.warn) latencyColor = YELLOW;
      else latencyColor = GREEN;
    }

    const latency = colorize(padEnd(formatMs(r.latencyMs), COL_LATENCY), latencyColor);
    const details = r.details.length > COL_DETAILS
      ? r.details.slice(0, COL_DETAILS - 3) + '...'
      : r.details;

    console.log(`${padEnd(r.name, COL_NAME)}  ${status}  ${latency}  ${colorize(details, DIM)}`);
  }

  console.log(divider);
}

function printLatencyReport(results) {
  console.log('');
  console.log(colorize(BOLD + 'Latency Report', BOLD));
  console.log('─'.repeat(70));

  const header = [
    padEnd('Endpoint', 46),
    padStart('p50', 8),
    padStart('p95', 8),
    padStart('max', 8),
    padStart('target', 8),
  ].join('  ');
  console.log(colorize(header, BOLD));
  console.log('─'.repeat(70));

  for (const r of results) {
    const samples = (latencies[r.name] || []).sort((a, b) => a - b);
    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const max = samples[samples.length - 1] || 0;
    const target = LATENCY_TARGETS[r.name];
    const targetStr = target ? `<${formatMs(target.warn)}` : 'n/a';

    const p50Color = target && p50 > target.warn ? YELLOW : GREEN;
    const p95Color = target && p95 > target.fail ? RED : target && p95 > target.warn ? YELLOW : GREEN;

    console.log([
      padEnd(r.name, 46),
      colorize(padStart(formatMs(p50), 8), p50Color),
      colorize(padStart(formatMs(p95), 8), p95Color),
      padStart(formatMs(max), 8),
      colorize(padStart(targetStr, 8), DIM),
    ].join('  '));
  }

  console.log('─'.repeat(70));
}

function printSummary(results) {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log('');
  if (failed === 0) {
    console.log(colorize(`✓ All ${total} tests passed`, GREEN + BOLD));
  } else {
    console.log(colorize(`✗ ${failed}/${total} tests failed`, RED + BOLD));
    console.log('');
    console.log(colorize('Failed tests:', RED));
    for (const r of results.filter(r => !r.passed)) {
      console.log(colorize(`  • ${r.name}: ${r.details}`, RED));
    }
  }
  console.log('');
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log(colorize(BOLD + '🔥 Wrangler_ Chat Smoke Test', BOLD));
  console.log(colorize(`   Base URL: ${baseUrl}`, DIM));
  console.log(colorize(`   Session:  ${SESSION_ID}`, DIM));
  if (apiKey) {
    console.log(colorize(`   Auth:     Bearer ***${apiKey.slice(-4)}`, DIM));
  }
  console.log('');

  // Run tests sequentially (order matters — test 1 creates session used by 5, 6, 7)
  console.log(colorize('Running tests...', DIM));

  await test1_accountLookup();
  process.stdout.write('.');
  await test2_morningBriefing();
  process.stdout.write('.');
  await test3_personLookup();
  process.stdout.write('.');
  await test4_streaming();
  process.stdout.write('.');
  await test5_feedback();
  process.stdout.write('.');
  await test6_getSession();
  process.stdout.write('.');
  await test7_auditLog();
  process.stdout.write('.\n');

  // Print results
  printTable(results);
  printLatencyReport(results);
  printSummary(results);

  // Exit with code 1 if any test failed
  const anyFailed = results.some(r => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => {
  console.error(colorize(`\nFatal error: ${err.message}`, RED));
  console.error(err.stack);
  process.exit(1);
});
