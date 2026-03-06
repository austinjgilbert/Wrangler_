/**
 * Gmail tool route.
 *
 * Review-first workflow:
 * - `read` uses Gmail API when configured
 * - `draft` generates or stores outreach drafts, persists them to Sanity,
 *   and returns both a Gmail compose URL and a review page URL
 * - `send` sends a reviewed draft via Gmail API
 */

import { createErrorResponse } from '../../utils/response.js';
import { parseToolRequest, buildToolSuccess } from './_shared.ts';
import {
  buildComposeUrl,
  createGmailApiDraft,
  generateOutreachDraft,
  getDraftRecord,
  gmailIsConfigured,
  gmailRead,
  saveDraftRecord,
  sendGmailMessage,
} from '../../services/gmail-workflow.ts';

export async function handleGmailTool(request: Request, requestId: string, env: any) {
  const { body, errorResponse } = await parseToolRequest(request, requestId, 'gmail');
  if (errorResponse) return errorResponse;

  const action = body.action;
  const input = body.input || {};

  if (action === 'read') {
    try {
      const output = await gmailRead(env, {
        query: input.query || '',
        maxResults: input.maxResults || 10,
      });
      return buildToolSuccess(requestId, body, output, {
        gmailConfigured: gmailIsConfigured(env),
      });
    } catch (error: any) {
      return createErrorResponse('GMAIL_READ_ERROR', error.message, {}, 500, requestId);
    }
  }

  if (action === 'draft') {
    try {
      const generated = (!input.subject || !input.body)
        ? await generateOutreachDraft(env, {
          accountName: input.accountName,
          recipientName: input.recipientName,
          recipientTitle: input.recipientTitle,
          recipientCompany: input.recipientCompany,
          context: input.context,
          objective: input.objective,
          tone: input.tone,
        })
        : { subject: String(input.subject || ''), body: String(input.body || ''), model: null, usage: null };

      const payload = {
        accountName: input.accountName || input.recipientCompany || '',
        recipientName: input.recipientName || '',
        recipientTitle: input.recipientTitle || '',
        recipientCompany: input.recipientCompany || input.accountName || '',
        to: Array.isArray(input.to) ? input.to : [],
        cc: Array.isArray(input.cc) ? input.cc : [],
        bcc: Array.isArray(input.bcc) ? input.bcc : [],
        subject: generated.subject,
        body: generated.body,
        context: String(input.context || ''),
      };

      const composeUrl = buildComposeUrl(payload);
      let gmailDraftId: string | null = null;
      let gmailMessageId: string | null = null;
      if (input.createGmailDraft === true && gmailIsConfigured(env)) {
        const gmailDraft = await createGmailApiDraft(env, payload);
        gmailDraftId = gmailDraft.gmailDraftId;
        gmailMessageId = gmailDraft.gmailMessageId;
      }

      const saved = await saveDraftRecord(env, {
        ...payload,
        status: 'draft',
        composeUrl,
        gmailDraftId,
        gmailMessageId,
      });
      const reviewUrl = `${new URL(request.url).origin}/gmail/review?draftId=${encodeURIComponent(saved.draftId)}`;

      return buildToolSuccess(requestId, body, {
        draftId: saved.draftId,
        status: 'draft',
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        body: payload.body,
        composeUrl,
        reviewUrl,
        gmailDraftId,
      }, {
        gmailConfigured: gmailIsConfigured(env),
        generatedByModel: generated.model,
        usage: generated.usage,
      });
    } catch (error: any) {
      return createErrorResponse('GMAIL_DRAFT_ERROR', error.message, {}, 500, requestId);
    }
  }

  if (action === 'send') {
    try {
      let draftRecord: any = null;
      if (input.draftId) {
        draftRecord = await getDraftRecord(env, String(input.draftId));
        if (!draftRecord) {
          return createErrorResponse('NOT_FOUND', 'Draft not found', {}, 404, requestId);
        }
      }

      const payload = {
        accountName: draftRecord?.accountName || input.accountName || input.recipientCompany || '',
        recipientName: draftRecord?.recipientName || input.recipientName || '',
        recipientTitle: draftRecord?.recipientTitle || input.recipientTitle || '',
        recipientCompany: draftRecord?.recipientCompany || input.recipientCompany || input.accountName || '',
        to: draftRecord?.to || input.to || [],
        cc: draftRecord?.cc || input.cc || [],
        bcc: draftRecord?.bcc || input.bcc || [],
        subject: draftRecord?.subject || input.subject || '',
        body: draftRecord?.body || input.body || '',
        context: draftRecord?.context?.value || input.context || '',
      };

      const sent = await sendGmailMessage(env, payload);

      if (input.draftId) {
        await saveDraftRecord(env, {
          draftId: String(input.draftId),
          ...payload,
          status: 'sent',
          gmailDraftId: draftRecord?.gmailDraftId || null,
          gmailMessageId: sent.gmailMessageId || null,
          sentAt: new Date().toISOString(),
        });
      }

      return buildToolSuccess(requestId, body, {
        messageId: sent.gmailMessageId,
        threadId: sent.threadId,
        status: 'sent',
        to: payload.to,
        subject: payload.subject,
      }, {
        gmailConfigured: gmailIsConfigured(env),
      });
    } catch (error: any) {
      return createErrorResponse('GMAIL_SEND_ERROR', error.message, {}, 500, requestId);
    }
  }

  if (action === 'composeLink') {
    const composeUrl = buildComposeUrl({
      to: Array.isArray(input.to) ? input.to : [],
      cc: Array.isArray(input.cc) ? input.cc : [],
      bcc: Array.isArray(input.bcc) ? input.bcc : [],
      subject: input.subject || '',
      body: input.body || '',
    });
    return buildToolSuccess(requestId, body, {
      status: 'ready',
      composeUrl,
      to: input.to || [],
      subject: input.subject || '',
      body: input.body || '',
    });
  }

  return createErrorResponse(
    'VALIDATION_ERROR',
    'Unsupported gmail action',
    { action },
    400,
    requestId
  );
}
