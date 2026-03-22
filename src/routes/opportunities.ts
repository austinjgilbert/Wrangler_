/**
 * Opportunity Engine routes
 * - POST /opportunities/daily
 */

import { createErrorResponse, createSuccessResponse, safeParseJson, sanitizeErrorMessage } from '../utils/response.js';
import { ToolRegistry } from '../lib/toolRegistry.ts';
import { ToolClient } from '../lib/toolClient.ts';
import { clusterByTopics } from '../lib/cluster.ts';
import { generateOpportunities } from '../lib/opportunityGen.ts';
import { buildStrategyBrief } from '../lib/briefing.ts';
import { notify } from '../lib/notify.ts';
import { buildEventDoc } from '../lib/events.ts';
import {
  createOpportunityBrief,
  createOpportunity,
  createDraftAction,
  fetchCommunityPostSanitizedSince,
  createStrategyBrief,
  createMoltEvent,
} from '../lib/sanity.ts';

export async function handleOpportunitiesDaily(request: Request, requestId: string, env: any) {
  try {
    const { data: body, error: parseError } = await safeParseJson(request, requestId);
    if (parseError) return parseError;
    const dateIso = body.date || new Date().toISOString();
    const sinceIso = new Date(new Date(dateIso).getTime() - 24 * 60 * 60 * 1000).toISOString();

    const sanitizedPosts = await fetchCommunityPostSanitizedSince(env, sinceIso);

    const toolRegistry = new ToolRegistry(env);
    await toolRegistry.loadConfig();
    const toolClient = new ToolClient(toolRegistry);

    const clusters = clusterByTopics(
      (sanitizedPosts || []).map((post) => ({
        sanitizedSummary: post.sanitizedSummary,
        extractedTopics: post.extractedTopics || [],
        extractedLinks: post.extractedLinks || [],
      }))
    );

    const opportunities: any[] = [];
    for (const cluster of clusters) {
      const theme = cluster.topics.slice(0, 3).join(', ') || 'general';
      const ops = await generateOpportunities({
        toolClient,
        traceId: requestId,
        theme,
        posts: cluster.posts,
      });
      for (const op of ops) {
        const oppDoc = {
          _type: 'opportunity',
          _id: `opportunity.${theme}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
          briefRef: { _type: 'reference', _ref: `opportunityBrief.${dateIso.slice(0, 10)}` },
          type: op.type || 'automation',
          title: op.title,
          description: op.description,
          whyNow: op.whyNow,
          confidence: op.confidence || 50,
          evidenceLinks: op.evidenceLinks || [],
        };
        await createOpportunity(env, oppDoc);
        opportunities.push({ ...oppDoc, howToAct: op.howToAct, nextStep: op.nextStep });
      }
    }

    const themes = clusters.map((c) => c.topics.slice(0, 3).join(', ') || 'general');
    const markdown = [
      '# Opportunity Brief',
      `Date: ${dateIso}`,
      '',
      ...themes.slice(0, 3).map((theme, idx) => {
        const themeOps = opportunities.filter((o) => (o.title || '').toLowerCase().includes(theme.split(',')[0] || ''));
        return [
          `## Theme ${idx + 1}: ${theme}`,
          ...themeOps.slice(0, 5).map((o) => [
            `- **${o.title}** (${o.type}, confidence ${o.confidence})`,
            `  - Why now: ${o.whyNow}`,
            `  - How Austin could act: ${o.howToAct || 'Draft a short plan.'}`,
            `  - Next step: ${o.nextStep || 'Share for feedback.'}`,
          ].join('\n')),
          '',
        ].join('\n');
      }),
    ].join('\n');

    const briefDoc = {
      _type: 'opportunityBrief',
      _id: `opportunityBrief.${dateIso.slice(0, 10)}`,
      date: dateIso,
      title: `Daily Opportunity Brief - ${dateIso.slice(0, 10)}`,
      markdown,
      sources: sanitizedPosts.map((p) => ({ _type: 'reference', _ref: p._id })),
      topThemes: themes.slice(0, 5),
      recommendedActions: opportunities.slice(0, 10).map((o) => o.title),
    };
    await createOpportunityBrief(env, briefDoc);

    // Draft-only actions (never execute).
    await createDraftAction(env, {
      _type: 'draftAction',
      _id: `draftAction.${dateIso.slice(0, 10)}`,
      title: 'Review opportunity brief',
      payload: { briefId: briefDoc._id },
      status: 'draft',
    });

    const strategy = buildStrategyBrief({
      dateIso,
      topAccounts: opportunities.slice(0, 3).map((o) => o.title),
      topPeople: opportunities.slice(0, 3).map((o) => o.title),
      topMessages: opportunities.slice(0, 3).map((o) => o.description || o.title),
      skillFocus: 'Improve objection handling and concise CTAs.',
    });
    const strategyDoc = {
      _type: 'molt.strategyBrief',
      _id: `molt.strategyBrief.${dateIso.slice(0, 10)}`,
      date: dateIso,
      cadence: 'weekly',
      markdown: strategy.markdown,
      doubleDown: strategy.doubleDown,
      stopDoing: strategy.stopDoing,
      nextSkillFocus: strategy.nextSkillFocus,
      generatedAt: new Date().toISOString(),
    };
    await createStrategyBrief(env, strategyDoc);
    const eventDoc = buildEventDoc({
      type: 'brief.daily',
      text: `Strategy brief ${strategyDoc._id}`,
      channel: 'system',
      actor: 'moltbot',
      entities: [],
      tags: ['briefing', 'strategy'],
      traceId: requestId,
      idempotencyKey: `brief.strategy.${strategyDoc._id}`,
    });
    await createMoltEvent(env, eventDoc);
    await notify('briefing', 'Strategy brief ready', { briefId: strategyDoc._id }, env);

    return createSuccessResponse(
      {
        briefId: briefDoc._id,
        opportunityCount: opportunities.length,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('OPPORTUNITIES_DAILY_ERROR', sanitizeErrorMessage(error, 'opportunities/daily'), {}, 500, requestId);
  }
}
