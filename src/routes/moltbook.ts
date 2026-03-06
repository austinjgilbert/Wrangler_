/**
 * Moltbook Scout routes
 * - GET  /moltbook/api/activity — list recent network activity (for Telegram bot / adapter)
 * - POST /moltbook/api/activity — append activity (bots post here; optional MOLTBOOK_API_KEY)
 * - POST /moltbook/fetch
 * - GET  /moltbook/crawl — cron: fetch from network and store in Sanity (learn from network)
 * - POST /moltbook/sanitize
 */

const MOLTBOOK_KV_KEY = 'moltbook:activity';
const MOLTBOOK_ACTIVITY_MAX = 100;

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { fetchMoltbookActivity, fetchMoltbookPosts } from '../lib/moltbookAdapter.ts';
import { sanitizePost } from '../lib/sanitize.ts';
import {
  createCommunityPostRaw,
  createCommunityPostSanitized,
  fetchCommunityPostRawSince,
  createCommunitySource,
} from '../lib/sanity.ts';

export async function handleMoltbookFetch(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const topics = Array.isArray(body.topics) ? body.topics : ['network'];
    const limit = body.limit || 10;

    const posts = await fetchMoltbookPosts({ topics, limit, env });
    const storedIds: string[] = [];
    await createCommunitySource(env, {
      _type: 'communitySource',
      _id: 'communitySource.moltbook',
      name: 'Moltbook',
      type: 'moltbook',
      baseUrl: 'https://moltbook.local',
      topics,
    });
    for (const post of posts) {
      const rawDoc = {
        _type: 'communityPostRaw',
        _id: `communityPostRaw.${post.externalId}`,
        sourceRef: { _type: 'reference', _ref: 'communitySource.moltbook' },
        externalId: post.externalId,
        url: post.url,
        author: post.author,
        createdAt: post.createdAt,
        rawText: post.rawText,
        rawJson: post.rawJson,
        fetchedAt: new Date().toISOString(),
      };
      await createCommunityPostRaw(env, rawDoc);
      storedIds.push(rawDoc._id);
    }

    return createSuccessResponse({ fetchedCount: posts.length, storedIds }, requestId);
  } catch (error: any) {
    return createErrorResponse('MOLTBOOK_FETCH_ERROR', error.message, {}, 500, requestId);
  }
}

/** GET /moltbook/crawl — Fetch from Moltbook (KV or MOLTBOOK_BASE_URL), store in Sanity. Call from cron to gather data and learn from the network. */
export async function handleMoltbookCrawl(request: Request, requestId: string, env: any) {
  try {
    const baseUrl = (env?.MOLTBOOK_BASE_URL || '').toString().replace(/\/$/, '');
    await createCommunitySource(env, {
      _type: 'communitySource',
      _id: 'communitySource.moltbook',
      name: 'Moltbook',
      type: 'moltbook',
      baseUrl: baseUrl || 'https://moltbook.local',
      topics: ['network'],
    });
    const live = await fetchMoltbookActivity(env);
    let stored = 0;
    for (const post of live.slice(0, 50)) {
      try {
        await createCommunityPostRaw(env, {
          _type: 'communityPostRaw',
          _id: `communityPostRaw.${post.externalId}`,
          sourceRef: { _type: 'reference', _ref: 'communitySource.moltbook' },
          externalId: post.externalId,
          url: post.url,
          author: post.author,
          createdAt: post.createdAt,
          rawText: post.rawText,
          rawJson: post.rawJson || {},
          fetchedAt: new Date().toISOString(),
        });
        stored += 1;
      } catch (_) {
        // duplicate or storage error
      }
    }
    return createSuccessResponse({ crawled: live.length, stored }, requestId);
  } catch (error: any) {
    return createErrorResponse('MOLTBOOK_CRAWL_ERROR', (error as Error).message, {}, 500, requestId);
  }
}

export async function handleMoltbookSanitize(request: Request, requestId: string, env: any) {
  try {
    const body = (await request.json()) as Record<string, any>;
    const sinceHours = body.sinceHours || 24;
    const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

    const rawPosts = await fetchCommunityPostRawSince(env, sinceIso);
    const storedIds: string[] = [];
    for (const raw of rawPosts) {
      const sanitized = sanitizePost(raw.rawText || '');
      const sanitizedDoc = {
        _type: 'communityPostSanitized',
        _id: `communityPostSanitized.${raw._id}`,
        rawRef: { _type: 'reference', _ref: raw._id },
        sanitizedSummary: sanitized.sanitizedSummary,
        extractedTopics: sanitized.extractedTopics,
        extractedLinks: sanitized.extractedLinks,
        riskLevel: sanitized.riskLevel,
        riskReasons: sanitized.riskReasons,
      };
      await createCommunityPostSanitized(env, sanitizedDoc);
      // Store back-reference for strict separation in later steps.
      raw.sanitized = sanitizedDoc;
      storedIds.push(sanitizedDoc._id);
    }

    return createSuccessResponse({ sanitizedCount: storedIds.length, storedIds }, requestId);
  } catch (error: any) {
    return createErrorResponse('MOLTBOOK_SANITIZE_ERROR', error.message, {}, 500, requestId);
  }
}

/** Normalize an activity item to the shape the adapter expects */
function normalizeActivityItem(item: any, idx: number): Record<string, unknown> {
  const id = item.id ?? item._id ?? `moltbook-${idx}-${Date.now()}`;
  const text = item.text ?? item.summary ?? item.rawText ?? item.content ?? '';
  const author = item.author ?? item.agent ?? item.bot ?? 'bot';
  const createdAt = item.createdAt ?? item.created ?? item.date ?? new Date().toISOString();
  const url = item.url ?? item.link ?? '';
  return {
    id: String(id),
    _id: String(id),
    author: String(author),
    text: String(text).slice(0, 2000),
    summary: String(text).slice(0, 500),
    rawText: String(text).slice(0, 2000),
    content: String(text).slice(0, 2000),
    createdAt: typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
    created: typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
    date: typeof createdAt === 'string' ? createdAt : new Date(createdAt).toISOString(),
    url: String(url),
    link: String(url),
    ...item,
  };
}

/** GET /moltbook/api/activity — returns recent activity (JSON array) for the adapter */
export async function handleMoltbookApiActivityGet(request: Request, requestId: string, env: any) {
  try {
    const kv = env.MOLTBOOK_ACTIVITY_KV;
    if (!kv) {
      return new Response(
        JSON.stringify({ ok: true, items: [], _message: 'MOLTBOOK_ACTIVITY_KV not bound' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    const raw = await kv.get(MOLTBOOK_KV_KEY);
    const list = raw ? (JSON.parse(raw) as any[]) : [];
    const items = Array.isArray(list) ? list.slice(0, 50) : [];
    return new Response(JSON.stringify(items), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' },
    });
  } catch (error: any) {
    return createErrorResponse('MOLTBOOK_API_ERROR', (error as Error).message, {}, 500, requestId);
  }
}

/** POST /moltbook/api/activity — append activity. Body: { items: [...] } or single object. Optional: Authorization Bearer or X-API-Key */
export async function handleMoltbookApiActivityPost(request: Request, requestId: string, env: any) {
  try {
    const kv = env.MOLTBOOK_ACTIVITY_KV;
    if (!kv) {
      return createErrorResponse('MOLTBOOK_API_ERROR', 'MOLTBOOK_ACTIVITY_KV not bound', {}, 503, requestId);
    }
    const apiKey = env.MOLTBOOK_API_KEY;
    if (apiKey) {
      const auth = request.headers.get('Authorization') || request.headers.get('X-API-Key') || '';
      const token = auth.replace(/^Bearer\s+/i, '').trim() || (request.headers.get('X-API-Key') || '').trim();
      if (token !== apiKey) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    }
    const body = (await request.json()) as Record<string, any>;
    const rawItems = Array.isArray(body?.items) ? body.items : body ? [body] : [];
    if (rawItems.length === 0) {
      return createSuccessResponse({ appended: 0, total: 0 }, requestId);
    }
    const normalized = rawItems.map((item: any, i: number) => normalizeActivityItem(item, i));
    const existingRaw = await kv.get(MOLTBOOK_KV_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as any[]) : [];
    const combined = [...normalized, ...(Array.isArray(existing) ? existing : [])].slice(0, MOLTBOOK_ACTIVITY_MAX);
    await kv.put(MOLTBOOK_KV_KEY, JSON.stringify(combined));
    return createSuccessResponse({ appended: normalized.length, total: combined.length }, requestId);
  } catch (error: any) {
    return createErrorResponse('MOLTBOOK_API_ERROR', (error as Error).message, {}, 500, requestId);
  }
}
