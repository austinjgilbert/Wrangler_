import { callLlm } from '../lib/llm.ts';

export type DraftInput = {
  accountName?: string;
  recipientName?: string;
  recipientTitle?: string;
  recipientCompany?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  context?: string;
  objective?: string;
  tone?: string;
  draftPolicyVersion?: string;
  strategyVersion?: string;
  confidenceBreakdown?: {
    dataConfidence?: number;
    entityConfidence?: number;
    patternConfidence?: number;
    actionConfidence?: number;
    draftConfidence?: number;
    updatedAt?: string;
  };
};

export async function generateOutreachDraft(env: any, input: DraftInput) {
  const messages = [
    {
      role: 'system' as const,
      content:
        'You write high-quality B2B outreach emails. Return valid JSON only with keys "subject" and "body". ' +
        'Keep the subject concise. Keep the body human, specific, and useful. Avoid hype and spammy phrasing. ' +
        'Use only the provided context. If context is sparse, still write a credible short outreach email.',
    },
    {
      role: 'user' as const,
      content: [
        `Account: ${input.accountName || 'Unknown'}`,
        `Recipient name: ${input.recipientName || 'Unknown'}`,
        `Recipient title: ${input.recipientTitle || 'Unknown'}`,
        `Recipient company: ${input.recipientCompany || input.accountName || 'Unknown'}`,
        `Objective: ${input.objective || 'Start a relevant conversation and ask for a short reply or meeting.'}`,
        `Tone: ${input.tone || 'Concise, confident, helpful, specific.'}`,
        '',
        'Context:',
        input.context || 'No additional context provided.',
        '',
        'Return JSON only.',
      ].join('\n'),
    },
  ];

  const result = await callLlm(env, messages, {
    temperature: 0.35,
    maxTokens: 1200,
    json: true,
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(result.content);
  } catch {
    parsed = {};
  }

  return {
    subject: String(parsed.subject || input.subject || buildFallbackSubject(input)).trim(),
    body: String(parsed.body || input.body || buildFallbackBody(input)).trim(),
    model: result.model,
    usage: result.usage,
  };
}

export function buildComposeUrl(input: DraftInput) {
  const url = new URL('https://mail.google.com/mail/');
  url.searchParams.set('view', 'cm');
  url.searchParams.set('fs', '1');
  url.searchParams.set('tf', '1');
  if (input.to?.length) url.searchParams.set('to', input.to.join(','));
  if (input.cc?.length) url.searchParams.set('cc', input.cc.join(','));
  if (input.bcc?.length) url.searchParams.set('bcc', input.bcc.join(','));
  if (input.subject) url.searchParams.set('su', input.subject);
  if (input.body) url.searchParams.set('body', input.body);
  return url.toString();
}

export function gmailIsConfigured(env: any) {
  return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
}

export async function saveDraftRecord(env: any, input: DraftInput & {
  draftId?: string;
  actionCandidateId?: string;
  status?: string;
  composeUrl?: string;
  gmailDraftId?: string | null;
  gmailMessageId?: string | null;
  sentAt?: string | null;
}) {
  const { recordOutcomeEvent } = await import('../lib/outcomeLinkingService.ts');
  const { initSanityClient, upsertDocument } = await import('../sanity-client.js');
  const client = initSanityClient(env);
  const now = new Date().toISOString();
  const draftId = input.draftId || `gmail-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const doc = {
    _id: draftId,
    _type: 'gmailDraft',
    draftId,
    actionCandidateId: input.actionCandidateId || null,
    draftPolicyVersion: input.draftPolicyVersion || null,
    strategyVersion: input.strategyVersion || null,
    confidenceBreakdown: input.confidenceBreakdown || null,
    status: input.status || 'draft',
    accountName: input.accountName || '',
    recipientName: input.recipientName || '',
    recipientTitle: input.recipientTitle || '',
    recipientCompany: input.recipientCompany || input.accountName || '',
    to: input.to || [],
    cc: input.cc || [],
    bcc: input.bcc || [],
    subject: input.subject || '',
    body: input.body || '',
    composeUrl: input.composeUrl || buildComposeUrl(input),
    gmailDraftId: input.gmailDraftId || null,
    gmailMessageId: input.gmailMessageId || null,
    context: { value: input.context || '' },
    createdAt: now,
    updatedAt: now,
    sentAt: input.sentAt || null,
    observedAt: now,
    lastValidatedAt: now,
    staleAfter: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
    refreshPriority: 60,
    uncertaintyState: input.confidenceBreakdown?.draftConfidence != null && input.confidenceBreakdown.draftConfidence < 0.5 ? 'needs_validation' : 'likely',
  };

  if (!client) {
    if (input.actionCandidateId) {
      await recordOutcomeEvent(env, {
        actionCandidateId: input.actionCandidateId,
        gmailDraftId: draftId,
        eventType: input.sentAt ? 'sent' : 'drafted',
        actor: 'system',
        observedAt: input.sentAt || now,
        outcomeLabel: input.status || 'draft',
      }).catch(() => null);
    }
    return { draftId, doc, saved: false };
  }

  const { getDocument } = await import('../sanity-client.js');
  const existing = await getDocument(client, draftId).catch(() => null) as any;
  if (existing?.createdAt) doc.createdAt = existing.createdAt;
  if (!doc.sentAt && existing?.sentAt) doc.sentAt = existing.sentAt;
  if (!doc.actionCandidateId && existing?.actionCandidateId) doc.actionCandidateId = existing.actionCandidateId;
  if (!doc.draftPolicyVersion && existing?.draftPolicyVersion) doc.draftPolicyVersion = existing.draftPolicyVersion;
  if (!doc.strategyVersion && existing?.strategyVersion) doc.strategyVersion = existing.strategyVersion;
  if (!doc.confidenceBreakdown && existing?.confidenceBreakdown) doc.confidenceBreakdown = existing.confidenceBreakdown;
  await upsertDocument(client, doc);
  if (input.actionCandidateId) {
    await recordOutcomeEvent(env, {
      actionCandidateId: input.actionCandidateId,
      gmailDraftId: draftId,
      eventType: input.sentAt ? 'sent' : 'drafted',
      actor: 'system',
      observedAt: input.sentAt || now,
      outcomeLabel: input.status || 'draft',
    }).catch(() => null);
  }
  return { draftId, doc, saved: true };
}

export async function getDraftRecord(env: any, draftId: string) {
  const { initSanityClient, getDocument } = await import('../sanity-client.js');
  const client = initSanityClient(env);
  if (!client) return null;
  return await getDocument(client, draftId).catch(() => null);
}

export async function gmailRead(env: any, input: { query?: string; maxResults?: number }) {
  const accessToken = await getGmailAccessToken(env);
  const query = String(input.query || '').trim();
  const maxResults = Math.max(1, Math.min(20, Number(input.maxResults || 10)));
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  if (query) listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(maxResults));

  const listRes = await gmailFetch(listUrl.toString(), accessToken);
  const listData: any = await listRes.json();
  const ids = Array.isArray(listData.messages) ? listData.messages.map((item: any) => item.id).slice(0, maxResults) : [];

  const messages = [];
  for (const id of ids) {
    const res = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`, accessToken);
    const data: any = await res.json();
    const headers = Object.fromEntries((data.payload?.headers || []).map((h: any) => [String(h.name).toLowerCase(), h.value]));
    messages.push({
      id: data.id,
      threadId: data.threadId,
      snippet: data.snippet || '',
      from: headers.from || '',
      to: headers.to || '',
      subject: headers.subject || '',
      date: headers.date || '',
    });
  }

  return { messages, query };
}

export async function createGmailApiDraft(env: any, input: DraftInput) {
  const accessToken = await getGmailAccessToken(env);
  const signature = (env.GMAIL_SIGNATURE ?? '').trim();
  const fromName = (env.GMAIL_FROM_NAME ?? '').trim();
  const fromEmail = (env.GMAIL_FROM_EMAIL ?? '').trim();
  const raw = encodeBase64Url(buildMimeMessage(input, { signature, fromName, fromEmail }));
  const res = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  const data: any = await res.json();
  return {
    gmailDraftId: data.id || null,
    gmailMessageId: data.message?.id || null,
  };
}

export async function sendGmailMessage(env: any, input: DraftInput) {
  const accessToken = await getGmailAccessToken(env);
  const signature = (env.GMAIL_SIGNATURE ?? '').trim();
  const fromName = (env.GMAIL_FROM_NAME ?? '').trim();
  const fromEmail = (env.GMAIL_FROM_EMAIL ?? '').trim();
  const trackingId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `t${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const baseUrl = String(env.BASE_URL || '').replace(/\/$/, '');
  let trackingPixelUrl = '';
  if (baseUrl) {
    trackingPixelUrl = `${baseUrl}/track/pixel?id=${encodeURIComponent(trackingId)}&to=${encodeURIComponent((input.to || []).join(','))}&subject=${encodeURIComponent(input.subject || '')}`;
    const kv = env.MOLTBOOK_ACTIVITY_KV;
    if (kv) {
      try {
        await kv.put(`email_track:${trackingId}`, JSON.stringify({
          to: input.to || [],
          subject: input.subject || '',
          sentAt: new Date().toISOString(),
        }));
      } catch (_) {
        // ignore
      }
    }
  }
  const raw = encodeBase64Url(buildMimeMessage(input, { signature, fromName, fromEmail, trackingPixelUrl }));
  const res = await gmailFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  const data: any = await res.json();
  return {
    gmailMessageId: data.id || null,
    threadId: data.threadId || null,
    trackingId: baseUrl ? trackingId : undefined,
  };
}

async function getGmailAccessToken(env: any) {
  if (!gmailIsConfigured(env)) {
    throw new Error('Gmail API is not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.');
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: String(env.GMAIL_CLIENT_ID),
      client_secret: String(env.GMAIL_CLIENT_SECRET),
      refresh_token: String(env.GMAIL_REFRESH_TOKEN),
      grant_type: 'refresh_token',
    }),
  });
  const tokenData: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(`Failed to get Gmail access token: ${JSON.stringify(tokenData).slice(0, 300)}`);
  }
  return String(tokenData.access_token);
}

async function gmailFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail API error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

function buildMimeMessage(input: DraftInput, opts?: { signature?: string; fromName?: string; fromEmail?: string; trackingPixelUrl?: string }) {
  let body = String(input.body ?? '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  const sig = (opts?.signature ?? '').trim().replace(/\\n/g, '\n');
  if (sig) {
    const sigCrlf = sig.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    body = body ? body + '\r\n\r\n' + sigCrlf : sigCrlf;
  }
  const fromLine = formatFromHeader(opts?.fromName, opts?.fromEmail);
  const hasPixel = !!(opts?.trackingPixelUrl && opts.trackingPixelUrl.trim());
  if (!hasPixel) {
    const headerLines: string[] = [
      `To: ${(input.to || []).join(', ')}`,
      input.cc?.length ? `Cc: ${input.cc.join(', ')}` : '',
      input.bcc?.length ? `Bcc: ${input.bcc.join(', ')}` : '',
      `Subject: ${sanitizeHeader(input.subject || '')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
    ].filter(Boolean);
    if (fromLine) headerLines.unshift(fromLine);
    return headerLines.join('\r\n') + '\r\n\r\n' + body + '\r\n';
  }
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const htmlBody = escapeHtml(body).replace(/\n/g, '<br>\n') + `<br><img src="${opts!.trackingPixelUrl!.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;" />`;
  const headerLines: string[] = [
    `To: ${(input.to || []).join(', ')}`,
    input.cc?.length ? `Cc: ${input.cc.join(', ')}` : '',
    input.bcc?.length ? `Bcc: ${input.bcc.join(', ')}` : '',
    `Subject: ${sanitizeHeader(input.subject || '')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  if (fromLine) headerLines.unshift(fromLine);
  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${body}\r\n`,
    `--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${htmlBody}\r\n`,
    `--${boundary}--\r\n`,
  ];
  return headerLines.join('\r\n') + '\r\n\r\n' + parts.join('');
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeHeader(value: string) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

/** Format From header: "Display Name" <email> when both set; otherwise From: email or empty. */
function formatFromHeader(name: string | undefined, email: string | undefined) {
  const n = (name ?? '').trim();
  const e = (email ?? '').trim();
  if (!e) return '';
  if (!n) return `From: ${e}`;
  const quoted = `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return `From: ${quoted} <${e}>`;
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildFallbackSubject(input: DraftInput) {
  const account = input.accountName || input.recipientCompany || 'your team';
  return `Idea for ${account}`;
}

function buildFallbackBody(input: DraftInput) {
  const greeting = input.recipientName ? `Hi ${input.recipientName},` : 'Hi,';
  const account = input.accountName || input.recipientCompany || 'your team';
  const objective = input.objective || 'start a useful conversation';
  const context = input.context ? `\n\nI noticed ${input.context.trim()}\n` : '\n\n';
  return `${greeting}\n\nI wanted to reach out with a quick idea for ${account}.${context}\nWould it be worth a short conversation if I shared a focused recommendation?\n\nBest,\nAustin`;
}
