/**
 * Moltbook Scout routes
 * - POST /moltbook/fetch
 * - POST /moltbook/sanitize
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { fetchMoltbookPosts } from '../lib/moltbookAdapter.ts';
import { sanitizePost } from '../lib/sanitize.ts';
import {
  createCommunityPostRaw,
  createCommunityPostSanitized,
  fetchCommunityPostRawSince,
  createCommunitySource,
} from '../lib/sanity.ts';

export async function handleMoltbookFetch(request: Request, requestId: string, env: any) {
  try {
    const body = await request.json();
    const topics = Array.isArray(body.topics) ? body.topics : [];
    const limit = body.limit || 10;

    const posts = await fetchMoltbookPosts({ topics, limit });
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

export async function handleMoltbookSanitize(request: Request, requestId: string, env: any) {
  try {
    const body = await request.json();
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
