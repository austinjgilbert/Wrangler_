/**
 * Tests for POST /extension/feedback handler.
 *
 * Verifies: validation, sanitization, activity event emission,
 * interaction patching, and error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────

const mockEmitActivityEvent = vi.fn().mockResolvedValue('molt.event.test-123');
const mockInitSanityClient = vi.fn().mockReturnValue({ projectId: 'test' });
const mockPatchDocument = vi.fn().mockResolvedValue(undefined);
const mockGetDocument = vi.fn().mockResolvedValue(null);

vi.mock('../../src/lib/sanity.ts', () => ({
  emitActivityEvent: (...args: any[]) => mockEmitActivityEvent(...args),
}));

vi.mock('../../src/sanity-client.js', () => ({
  initSanityClient: (...args: any[]) => mockInitSanityClient(...args),
  patchDocument: (...args: any[]) => mockPatchDocument(...args),
  getDocument: (...args: any[]) => mockGetDocument(...args),
}));

// Use real sanitize functions
vi.mock('../../src/utils/extension-sanitize.js', async () => {
  return {
    isBodyWithinSizeLimit: (req: any) => {
      const cl = req.headers?.get?.('content-length');
      return !cl || parseInt(cl, 10) <= 50_000;
    },
    stripHtmlTags: (v: string) => String(v || '').replace(/<[^>]*>/g, ''),
  };
});

vi.mock('../../src/utils/response.js', () => ({
  createSuccessResponse: (data: any, requestId: string) => {
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  createErrorResponse: (code: string, message: string, details: any, status: number, requestId: string) => {
    return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  sanitizeErrorMessage: (error: any, context: string) => {
    console.error(`[${context}] Error:`, error?.message);
    return 'An internal error occurred';
  },
}));

import { handleExtensionFeedback } from '../../src/routes/extension.ts';

// ── Helpers ──────────────────────────────────────────────────────────

function makeRequest(body: any, options: { oversized?: boolean } = {}): Request {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.oversized) {
    headers['content-length'] = '60000';
  }
  return new Request('https://test.workers.dev/extension/feedback', {
    method: 'POST',
    headers,
    body: json,
  });
}

async function parseResponse(response: Response) {
  return response.json() as Promise<any>;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('POST /extension/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmitActivityEvent.mockResolvedValue('molt.event.test-123');
    mockInitSanityClient.mockReturnValue({ projectId: 'test' });
    mockGetDocument.mockResolvedValue(null);
  });

  const env = { SANITY_PROJECT_ID: 'test', SANITY_TOKEN: 'tok' };

  // ── Validation ──────────────────────────────────────────────────

  it('rejects oversized payloads (413)', async () => {
    const res = await handleExtensionFeedback(makeRequest({}, { oversized: true }), 'req-1', env);
    expect(res.status).toBe(413);
    const body = await parseResponse(res);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects missing promptId (400)', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({ feedback: 'good answer' }),
      'req-2',
      env,
    );
    expect(res.status).toBe(400);
    const body = await parseResponse(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('promptId');
  });

  it('rejects missing feedback AND rating (400)', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({ promptId: 'prompt-123' }),
      'req-3',
      env,
    );
    expect(res.status).toBe(400);
    const body = await parseResponse(res);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('feedback or rating');
  });

  it('rejects empty string promptId (400)', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({ promptId: '  ', feedback: 'test' }),
      'req-4',
      env,
    );
    expect(res.status).toBe(400);
  });

  it('accepts rating-only (no feedback text) — thumbs-up flow', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({ promptId: 'prompt-thumbsup', rating: 'positive' }),
      'req-5a',
      env,
    );
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.stored).toBe(true);
    expect(body.data.rating).toBe('positive');

    const [, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.data.feedback).toBe('');
    expect(emitInput.data.rating).toBe('positive');
    expect(emitInput.message).toBe('Feedback on prompt: positive');
  });

  it('rejects empty feedback with invalid rating (400)', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({ promptId: 'p-1', rating: 'five-stars' }),
      'req-5b',
      env,
    );
    // Invalid rating → null, no feedback text → neither present → 400
    expect(res.status).toBe(400);
  });

  // ── Happy path ──────────────────────────────────────────────────

  it('stores feedback with rating and returns eventId', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-abc',
        feedback: 'This was really helpful',
        rating: 'positive',
      }),
      'req-6',
      env,
    );
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.ok).toBe(true);
    expect(body.data.stored).toBe(true);
    expect(body.data.eventId).toBe('molt.event.test-123');
    expect(body.data.promptId).toBe('prompt-abc');
    expect(body.data.rating).toBe('positive');

    // Verify activity event was emitted
    expect(mockEmitActivityEvent).toHaveBeenCalledOnce();
    const [emitEnv, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.eventType).toBe('prompt');
    expect(emitInput.source).toBe('extension');
    expect(emitInput.category).toBe('interaction');
    expect(emitInput.data.promptId).toBe('prompt-abc');
    expect(emitInput.data.feedback).toBe('This was really helpful');
    expect(emitInput.data.rating).toBe('positive');
  });

  it('stores feedback without rating (comment only)', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-def',
        feedback: 'Could be more specific about the account',
      }),
      'req-7',
      env,
    );
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.rating).toBeNull();

    const [, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.message).toBe('Feedback on prompt: comment');
  });

  it('stores feedback with negative rating', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-ghi',
        feedback: 'Wrong account matched',
        rating: 'negative',
      }),
      'req-8',
      env,
    );
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.rating).toBe('negative');
  });

  // ── Rating validation ───────────────────────────────────────────

  it('ignores invalid rating values (treats as null)', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-jkl',
        feedback: 'test',
        rating: 'five-stars',
      }),
      'req-9',
      env,
    );
    expect(res.status).toBe(200);
    const body = await parseResponse(res);
    expect(body.data.rating).toBeNull();
  });

  // ── Context handling ────────────────────────────────────────────

  it('extracts accountKey and domain from context', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-mno',
        feedback: 'Great insight',
        rating: 'positive',
        context: {
          accountKey: 'acme-corp',
          domain: 'acme.com',
          pageUrl: 'https://acme.com/about',
        },
      }),
      'req-10',
      env,
    );
    expect(res.status).toBe(200);

    const [, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.accountKey).toBe('acme-corp');
    expect(emitInput.data.domain).toBe('acme.com');
    expect(emitInput.data.context.pageUrl).toBe('https://acme.com/about');
  });

  it('handles missing context gracefully', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-pqr',
        feedback: 'test',
      }),
      'req-11',
      env,
    );
    expect(res.status).toBe(200);

    const [, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.accountKey).toBeNull();
    expect(emitInput.data.domain).toBeNull();
  });

  // ── Sanitization ────────────────────────────────────────────────

  it('strips HTML from feedback text', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-stu',
        feedback: '<script>alert("xss")</script>Good answer',
      }),
      'req-12',
      env,
    );
    expect(res.status).toBe(200);

    const [, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.data.feedback).toBe('alert("xss")Good answer');
    expect(emitInput.data.feedback).not.toContain('<script>');
  });

  it('truncates feedback to 2000 chars', async () => {
    const longFeedback = 'x'.repeat(3000);
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-vwx',
        feedback: longFeedback,
      }),
      'req-13',
      env,
    );
    expect(res.status).toBe(200);

    const [, emitInput] = mockEmitActivityEvent.mock.calls[0];
    expect(emitInput.data.feedback.length).toBe(2000);
  });

  // ── Interaction patching ────────────────────────────────────────

  it('patches interaction when promptId starts with interaction.', async () => {
    mockGetDocument.mockResolvedValue({ _id: 'interaction.session-123', _type: 'interaction' });

    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'interaction.session-123',
        feedback: 'Helpful',
        rating: 'positive',
      }),
      'req-14',
      env,
    );
    expect(res.status).toBe(200);

    // Give fire-and-forget promise time to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(mockGetDocument).toHaveBeenCalledWith(
      expect.anything(),
      'interaction.session-123',
    );
    expect(mockPatchDocument).toHaveBeenCalledWith(
      expect.anything(),
      'interaction.session-123',
      {
        set: expect.objectContaining({
          feedback: 'positive',
        }),
      },
    );
  });

  it('does NOT attempt interaction patch for non-interaction promptIds', async () => {
    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-abc',
        feedback: 'test',
      }),
      'req-15',
      env,
    );
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns 500 with sanitized error on emitActivityEvent failure', async () => {
    mockEmitActivityEvent.mockRejectedValue(new Error('Sanity connection failed: project nlqb7zmk'));

    const res = await handleExtensionFeedback(
      makeRequest({
        promptId: 'prompt-err',
        feedback: 'test',
      }),
      'req-16',
      env,
    );
    expect(res.status).toBe(500);
    const body = await parseResponse(res);
    expect(body.error.code).toBe('EXTENSION_FEEDBACK_ERROR');
    // Must NOT leak the Sanity project ID
    expect(body.error.message).not.toContain('nlqb7zmk');
    expect(body.error.message).toBe('An internal error occurred');
  });

  it('handles malformed JSON body gracefully', async () => {
    const req = new Request('https://test.workers.dev/extension/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await handleExtensionFeedback(req, 'req-17', env);
    // Should hit validation (empty body → no promptId)
    expect(res.status).toBe(400);
  });
});
