/**
 * Network Conversation Engine v0
 * Routes:
 * - POST /network/importConnections
 * - POST /network/dailyRun
 */

import { createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { ToolRegistry } from '../lib/toolRegistry.ts';
import { ToolClient } from '../lib/toolClient.ts';
import {
  upsertNetworkPerson,
  fetchCompanies,
  fetchNetworkPeople,
  createConversationStarter,
  createDailyBriefing,
  fetchRecentStarters,
  findPersonByLinkedinUrl,
  findPersonByName,
  upsertPersonPlaceholder,
  createEnrichJob,
} from '../lib/sanity.ts';
import { matchSignalsToPeople } from '../lib/matching.ts';
import { computeRelevanceScore } from '../lib/scoring.ts';
import { generateConversationOptions } from '../lib/generation.ts';
import { notify } from '../lib/notify.ts';
import { buildEventDoc } from '../lib/events.ts';
import { createMoltEvent } from '../lib/sanity.ts';
import { attachSignalToEntity, normalizeSignal, storeSignal } from '../lib/signalIngestion.ts';

function parseCsv(text: string): Array<Record<string, string>> {
  // Minimal CSV parser with quoted field handling; assumes header row exists.
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      current.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (field.length > 0 || current.length > 0) {
        current.push(field);
        rows.push(current);
        current = [];
        field = '';
      }
      continue;
    }
    field += char;
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cols[idx] || '').trim();
    });
    return row;
  });
}

function normalizeName(row: Record<string, string>) {
  const first = row['First Name'] || row['FirstName'] || row['first_name'] || '';
  const last = row['Last Name'] || row['LastName'] || row['last_name'] || '';
  return `${first} ${last}`.trim() || row['Name'] || '';
}

function generatePersonId(linkedinUrl: string, name: string, company: string) {
  const seed = `${linkedinUrl || ''}|${name || ''}|${company || ''}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return `networkPerson.${Math.abs(hash).toString(16)}`;
}

function extractKeywords(summary: string): string[] {
  const words = (summary || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

export async function handleImportConnections(request: Request, requestId: string, env: any) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let csvText = '';

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, any>;
      csvText = body.csvText || body.text || '';
    } else {
      csvText = await request.text();
    }

    if (!csvText) {
      return createErrorResponse('VALIDATION_ERROR', 'CSV text is required', {}, 400, requestId);
    }

    const rows = parseCsv(csvText);
    let count = 0;
    for (const row of rows) {
      const name = normalizeName(row);
      const company = row['Company'] || row['Organization'] || row['Company Name'] || '';
      const title = row['Position'] || row['Title'] || '';
      const linkedinUrl = row['URL'] || row['LinkedIn URL'] || row['Linkedin URL'] || '';

      let person = null;
      if (linkedinUrl) person = await findPersonByLinkedinUrl(env, linkedinUrl);
      if (!person && name) person = await findPersonByName(env, name);
      if (!person) {
        person = await upsertPersonPlaceholder(env, { name, linkedinUrl });
        await createEnrichJob(env, {
          _type: 'enrich.job',
          _id: `enrich.job.person.${person._id}.${Date.now()}`,
          findingRef: null,
          entityType: 'person',
          entityId: person._id,
          goal: 'Enrich person from network import',
          scope: { maxDepth: 1, maxPages: 3 },
          priority: 70,
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          nextAttemptAt: new Date().toISOString(),
          leaseExpiresAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      const personDoc = {
        _type: 'networkPerson',
        _id: generatePersonId(linkedinUrl, name, company),
        name,
        company,
        title,
        linkedinUrl,
        personRef: { _type: 'reference', _ref: person._id },
        tier: row['Tier'] || 'C',
        tags: [],
        relationshipStrength: 50,
        lastTouchedAt: null,
        notes: '',
      };
      await upsertNetworkPerson(env, personDoc);
      count += 1;
    }

    return createSuccessResponse({ imported: count }, requestId);
  } catch (error: any) {
    return createErrorResponse('NETWORK_IMPORT_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleDailyRun(request: Request, requestId: string, env: any) {
  try {
    const now = new Date().toISOString();
    // Safety: no LinkedIn scraping or auto-messaging; only public signals + drafts.
    const companies = await fetchCompanies(env);
    const people = await fetchNetworkPeople(env);

    const toolRegistry = new ToolRegistry(env);
    await toolRegistry.loadConfig();
    const toolClient = new ToolClient(toolRegistry);

    const signals: any[] = [];
    for (const company of companies) {
      const sources = [
        ...(company.newsroomRssUrls || []),
        ...(company.careersUrls || []),
      ].filter(Boolean);

      if (sources.length === 0) continue;

      const prompt = [
        `Summarize notable changes for ${company.name} in the last 24h.`,
        `Sources: ${sources.join(', ')}`,
        'Return a short summary and cite sources.',
      ].join('\n');

      const result = await toolClient.callTool({
        traceId: requestId,
        tool: 'research',
        action: 'research',
        input: { query: prompt, outputFormat: 'markdown' },
      });

      const summary = result?.output || '';
      if (!summary) continue;

      const citations = Array.isArray(result?.citations) ? result.citations : [];
      const signalDoc = normalizeSignal({
        source: 'website_scan',
        signalType: 'website_scan',
        account: company?._id ? { _type: 'reference', _ref: company._id } : null,
        timestamp: now,
        metadata: {
          sourceUrl: citations[0]?.url || sources[0],
          summary,
          keywords: extractKeywords(summary),
          citations,
        },
      });
      await storeSignal(env, signalDoc);
      await attachSignalToEntity(env, signalDoc);
      signals.push({
        ...signalDoc,
        summary,
        date: now,
      });
    }

    const matches = matchSignalsToPeople({ signals, people, companies });
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentStarters = await fetchRecentStarters(env, sinceIso);
    const recentCountByPerson: Record<string, number> = {};
    for (const starter of recentStarters) {
      const ref = starter.personRef?._ref || starter.personRef;
      if (ref) recentCountByPerson[ref] = (recentCountByPerson[ref] || 0) + 1;
    }

    const starters: any[] = [];
    for (const match of matches) {
      const person = match.person;
      const signal = match.signal;
      const recentCount = recentCountByPerson[person._id] || 0;
      const score = computeRelevanceScore({
        signalDate: signal.date,
        tier: person.tier,
        relationshipStrength: person.relationshipStrength,
        signalStrength: match.signalStrength,
        lastTouchedAt: person.lastTouchedAt,
        lastSuggestedAt: null,
        recentStarterCount: recentCount,
      });

      if (score < 55) continue; // enforce rotation/quality threshold

      const messageOptions = await generateConversationOptions({
        toolClient,
        traceId: requestId,
        person,
        signal,
      });

      const starterDoc = {
        _type: 'conversationStarter',
        _id: `conversationStarter.${person._id}.${Date.now()}`,
        personRef: { _type: 'reference', _ref: person._id },
        whyNow: signal.summary.slice(0, 200),
        messageOptions,
        suggestedAction: 'Send a short LinkedIn note (human-in-the-loop)',
        confidenceScore: score,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        relatedSignals: [{ _type: 'reference', _ref: signal._id }],
      };
      await createConversationStarter(env, starterDoc);
      starters.push({ ...starterDoc, score });
    }

    const topStarters = starters.sort((a, b) => b.score - a.score).slice(0, 20);
    const briefingMarkdown = [
      '# Daily Network Briefing',
      `Date: ${now}`,
      '',
      ...topStarters.slice(0, 5).map((starter, idx) => {
        const person = people.find((p) => p._id === starter.personRef._ref);
        return [
          `${idx + 1}. ${person?.name || 'Unknown'} (${person?.title || ''} @ ${person?.company || ''})`,
          `   - Why now: ${starter.whyNow}`,
          `   - Suggested: ${starter.messageOptions?.[0] || ''}`,
          `   - Score: ${starter.score}`,
        ].join('\n');
      }),
    ].join('\n');

    const briefingDoc = {
      _type: 'networkDailyBriefing',
      _id: `networkDailyBriefing.${now.slice(0, 10)}`,
      date: now,
      summaryJson: {
        totalSignals: signals.length,
        totalStarters: starters.length,
        topStarters: topStarters.slice(0, 5).map((s) => ({
          personRef: s.personRef,
          confidenceScore: s.score,
          suggested: s.messageOptions?.[0] || '',
        })),
      },
      summaryMarkdown: briefingMarkdown,
      starterRefs: topStarters.map((s) => ({ _type: 'reference', _ref: s._id })),
    };
    await createDailyBriefing(env, briefingDoc);
    const eventDoc = buildEventDoc({
      type: 'brief.daily',
      text: `Network daily briefing ${briefingDoc._id}`,
      channel: 'system',
      actor: 'moltbot',
      entities: [],
      tags: ['briefing'],
      traceId: requestId,
      idempotencyKey: `brief.daily.${briefingDoc._id}`,
    });
    await createMoltEvent(env, eventDoc);
    await notify('briefing', 'Network daily briefing ready', {
      briefingId: briefingDoc._id,
      topCount: topStarters.length,
    }, env);

    return createSuccessResponse(
      {
        signalsCreated: signals.length,
        startersCreated: starters.length,
        briefingId: briefingDoc._id,
      },
      requestId
    );
  } catch (error: any) {
    return createErrorResponse('NETWORK_DAILY_ERROR', error.message, {}, 500, requestId);
  }
}
