import { addCorsHeaders, createErrorResponse, createSuccessResponse } from '../utils/response.js';
import { buildComposeUrl, getDraftRecord, saveDraftRecord, sendGmailMessage } from '../services/gmail-workflow.ts';

export async function handleGmailReviewPage(request: Request, requestId: string, env: any) {
  const url = new URL(request.url);
  const draftId = String(url.searchParams.get('draftId') || '').trim();
  if (!draftId) {
    return new Response('<!DOCTYPE html><html><body><h1>Missing draftId</h1></body></html>', {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...Object.fromEntries(addCorsHeaders().headers.entries()) },
    });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gmail Review</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #020617; color: #e2e8f0; margin: 0; padding: 24px; }
    .shell { max-width: 960px; margin: 0 auto; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
    h1 { margin: 0 0 10px; font-size: 28px; }
    h2 { margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: #93c5fd; }
    label { display: block; font-size: 12px; color: #cbd5e1; margin-bottom: 6px; }
    input, textarea { width: 100%; box-sizing: border-box; background: #020617; color: #f8fafc; border: 1px solid #334155; border-radius: 12px; padding: 12px; font: inherit; }
    textarea { min-height: 260px; resize: vertical; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .row { margin-bottom: 12px; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    button, a.button { background: #f8fafc; color: #020617; border: none; border-radius: 12px; padding: 12px 16px; font-weight: 700; cursor: pointer; text-decoration: none; }
    a.button.secondary, button.secondary { background: #111827; color: #e2e8f0; border: 1px solid #334155; }
    .status { min-height: 24px; color: #93c5fd; }
    .meta { color: #94a3b8; font-size: 14px; line-height: 1.5; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <h1>Review Outreach Draft</h1>
      <div class="meta">Edit the draft, then either open Gmail compose for a final click or send through the Gmail API if it is configured.</div>
    </div>
    <div class="card">
      <h2>Draft</h2>
      <div class="grid">
        <div class="row"><label for="to">To</label><input id="to" /></div>
        <div class="row"><label for="accountName">Account</label><input id="accountName" /></div>
      </div>
      <div class="row"><label for="subject">Subject</label><input id="subject" /></div>
      <div class="row"><label for="body">Body</label><textarea id="body"></textarea></div>
      <div class="actions">
        <button id="saveBtn">Save Draft</button>
        <a id="composeBtn" class="button secondary" target="_blank" rel="noreferrer">Open Gmail Compose</a>
        <button id="sendBtn" class="secondary">Send via Gmail API</button>
      </div>
      <div id="status" class="status"></div>
    </div>
  </div>
  <script>
    const BASE = window.location.origin;
    const draftId = ${JSON.stringify(draftId)};
    const statusEl = document.getElementById('status');
    const toEl = document.getElementById('to');
    const accountNameEl = document.getElementById('accountName');
    const subjectEl = document.getElementById('subject');
    const bodyEl = document.getElementById('body');
    const composeBtn = document.getElementById('composeBtn');

    function setStatus(msg) { statusEl.textContent = msg || ''; }
    function esc(v) { const d = document.createElement('div'); d.textContent = v || ''; return d.innerHTML; }

    async function loadDraft() {
      const res = await fetch(BASE + '/gmail/draft/' + encodeURIComponent(draftId));
      const data = await res.json();
      if (!data.ok || !data.data?.draft) {
        setStatus(data.error?.message || 'Unable to load draft.');
        return;
      }
      const d = data.data.draft;
      toEl.value = Array.isArray(d.to) ? d.to.join(', ') : '';
      accountNameEl.value = d.accountName || d.recipientCompany || '';
      subjectEl.value = d.subject || '';
      bodyEl.value = d.body || '';
      composeBtn.href = d.composeUrl || '#';
      setStatus(d.status === 'sent' ? 'This draft was already sent.' : 'Draft loaded.');
    }

    async function saveDraft() {
      setStatus('Saving draft...');
      const res = await fetch(BASE + '/gmail/draft/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId,
          to: toEl.value.split(',').map(v => v.trim()).filter(Boolean),
          accountName: accountNameEl.value.trim(),
          subject: subjectEl.value.trim(),
          body: bodyEl.value,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error?.message || 'Save failed.');
        return;
      }
      composeBtn.href = data.data.composeUrl || composeBtn.href;
      setStatus('Draft saved.');
    }

    async function sendDraft() {
      setStatus('Sending...');
      const res = await fetch(BASE + '/gmail/draft/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus(data.error?.message || 'Send failed.');
        return;
      }
      setStatus('Email sent.');
    }

    document.getElementById('saveBtn').addEventListener('click', saveDraft);
    document.getElementById('sendBtn').addEventListener('click', sendDraft);
    loadDraft().catch((err) => setStatus(err.message));
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...Object.fromEntries(addCorsHeaders().headers.entries()) },
  });
}

export async function handleGmailDraftGet(_request: Request, requestId: string, env: any, draftId: string) {
  const draft = await getDraftRecord(env, draftId);
  if (!draft) return createErrorResponse('NOT_FOUND', 'Draft not found', {}, 404, requestId);
  return createSuccessResponse({ draft }, requestId);
}

export async function handleGmailDraftSave(request: Request, requestId: string, env: any) {
  try {
    const body: any = await request.json().catch(() => ({}));
    if (!body?.draftId) return createErrorResponse('VALIDATION_ERROR', 'draftId is required', {}, 400, requestId);
    const to = Array.isArray(body.to) ? body.to : [];
    const subject = String(body.subject || '').trim();
    const draft = await saveDraftRecord(env, {
      draftId: String(body.draftId),
      to,
      accountName: String(body.accountName || '').trim(),
      subject,
      body: String(body.body || ''),
      status: 'draft',
      composeUrl: buildComposeUrl({ to, subject, body: String(body.body || '') }),
    });
    return createSuccessResponse({
      draftId: draft.draftId,
      composeUrl: draft.doc.composeUrl,
      status: draft.doc.status,
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('GMAIL_DRAFT_SAVE_ERROR', error.message, {}, 500, requestId);
  }
}

export async function handleGmailDraftSend(request: Request, requestId: string, env: any) {
  try {
    const body: any = await request.json().catch(() => ({}));
    if (!body?.draftId) return createErrorResponse('VALIDATION_ERROR', 'draftId is required', {}, 400, requestId);
    const existing: any = await getDraftRecord(env, String(body.draftId));
    if (!existing) return createErrorResponse('NOT_FOUND', 'Draft not found', {}, 404, requestId);

    const result = await sendGmailMessage(env, {
      to: existing.to || [],
      cc: existing.cc || [],
      bcc: existing.bcc || [],
      subject: existing.subject || '',
      body: existing.body || '',
      accountName: existing.accountName || '',
      recipientName: existing.recipientName || '',
      recipientCompany: existing.recipientCompany || '',
    });

    await saveDraftRecord(env, {
      draftId: String(body.draftId),
      to: existing.to || [],
      cc: existing.cc || [],
      bcc: existing.bcc || [],
      subject: existing.subject || '',
      body: existing.body || '',
      accountName: existing.accountName || '',
      recipientName: existing.recipientName || '',
      recipientTitle: existing.recipientTitle || '',
      recipientCompany: existing.recipientCompany || '',
      context: existing.context?.value || '',
      status: 'sent',
      gmailDraftId: existing.gmailDraftId || null,
      gmailMessageId: result.gmailMessageId || null,
      sentAt: new Date().toISOString(),
    });

    return createSuccessResponse({
      draftId: body.draftId,
      messageId: result.gmailMessageId,
      threadId: result.threadId,
      status: 'sent',
    }, requestId);
  } catch (error: any) {
    return createErrorResponse('GMAIL_DRAFT_SEND_ERROR', error.message, {}, 500, requestId);
  }
}
