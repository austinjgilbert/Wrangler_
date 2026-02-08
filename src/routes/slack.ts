/**
 * Slack events + commands handlers (DM-first).
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { verifySlackSignature } from '../lib/slack.ts';
import { handleMoltRun } from '../handlers/moltbot.js';
import { handleMoltApprove } from '../handlers/moltbot.js';
import { handleMoltLog } from './molt.ts';

function parseSlackCommand(text: string) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { intent: 'log', payload: '' };

  const [first, ...rest] = trimmed.split(/\s+/);
  const body = rest.join(' ').trim();

  if (first.toLowerCase() === 'run') return { intent: 'run', payload: body };
  if (first.toLowerCase() === 'approve') return { intent: 'approve', payload: body };
  if (first.toLowerCase() === 'reject') return { intent: 'reject', payload: body };
  if (first.toLowerCase() === 'log') return { intent: 'log', payload: body };
  return { intent: 'log', payload: trimmed };
}

async function routeSlackIntent(intent: string, payload: string, requestId: string, env: any) {
  if (intent === 'run') {
    const req = new Request('http://internal/molt/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestText: payload, mode: 'auto' }),
    });
    return await handleMoltRun(req, requestId, env);
  }

  if (intent === 'approve' || intent === 'reject') {
    const req = new Request('http://internal/molt/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: payload, decision: intent === 'approve' ? 'approve' : 'reject' }),
    });
    return await handleMoltApprove(req, requestId, env);
  }

  const req = new Request('http://internal/molt/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: payload || 'Logged from Slack', channel: 'slack' }),
  });
  return await handleMoltLog(req, requestId, env);
}

export async function handleSlackEvents(request: Request, requestId: string, env: any) {
  const rawBody = await request.text();
  const verified = await verifySlackSignature(request, rawBody, env);
  if (!verified) {
    return createErrorResponse('UNAUTHORIZED', 'Invalid Slack signature', {}, 401, requestId);
  }

  let body: any = {};
  try {
    body = JSON.parse(rawBody);
  } catch (_error) {
    return createErrorResponse('VALIDATION_ERROR', 'Invalid JSON', {}, 400, requestId);
  }

  if (body.type === 'url_verification') {
    return new Response(body.challenge, { status: 200 });
  }

  if (body.type === 'event_callback') {
    const event = body.event || {};
    if (event.type === 'message' && !event.subtype && event.channel_type === 'im') {
      const { intent, payload } = parseSlackCommand(event.text || '');
      return await routeSlackIntent(intent, payload, requestId, env);
    }
  }

  return createSuccessResponse({ ok: true }, requestId);
}

export async function handleSlackCommand(request: Request, requestId: string, env: any) {
  const rawBody = await request.text();
  const verified = await verifySlackSignature(request, rawBody, env);
  if (!verified) {
    return createErrorResponse('UNAUTHORIZED', 'Invalid Slack signature', {}, 401, requestId);
  }

  const params = new URLSearchParams(rawBody);
  const text = params.get('text') || '';
  const { intent, payload } = parseSlackCommand(text);
  const result = await routeSlackIntent(intent, payload, requestId, env);
  const data = (await result.json().catch(() => ({}))) as { data?: unknown };
  return new Response(`OK: ${JSON.stringify(data.data || {})}`, { status: 200 });
}
