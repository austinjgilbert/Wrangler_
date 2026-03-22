/**
 * Tests for PATCH /person/pin-contact handler
 *
 * Tests the handlePinContact function directly — no HTTP server needed.
 * Mocks groqQuery and patchDocument to isolate handler logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock helpers ────────────────────────────────────────────────────────────

function mockRequest(body: any): Request {
  return new Request('http://localhost/person/pin-contact', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function createSuccessResponse(data: any, requestId: string) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createErrorResponse(code: string, message: string, details: any, status: number, requestId: string) {
  return new Response(JSON.stringify({ ok: false, error: { code, message, details } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function safeParseJson(request: Request, requestId: string) {
  try {
    const data = await request.json();
    return { data, error: null };
  } catch {
    return {
      data: null,
      error: createErrorResponse('PARSE_ERROR', 'Invalid JSON', {}, 400, requestId),
    };
  }
}

// ── Test fixtures ───────────────────────────────────────────────────────────

const PERSON_WITH_CONTACTS = {
  _id: 'person.jane-doe',
  email: 'jane@bigco.com',
  phone: '+14155551234',
  contactEmails: [
    {
      _key: 'e1',
      value: 'jane@bigco.com',
      source: 'salesforce',
      firstSeenAt: '2026-01-01T00:00:00Z',
      lastSeenAt: '2026-03-01T00:00:00Z',
      confidence: 0.85,
      isPrimary: true,
    },
    {
      _key: 'e2',
      value: 'jane.doe@gmail.com',
      source: 'linkedin',
      firstSeenAt: '2026-02-01T00:00:00Z',
      lastSeenAt: '2026-02-15T00:00:00Z',
      confidence: 0.65,
      isPrimary: false,
    },
  ],
  contactPhones: [
    {
      _key: 'p1',
      value: '+14155551234',
      source: 'salesforce',
      firstSeenAt: '2026-01-01T00:00:00Z',
      lastSeenAt: '2026-03-01T00:00:00Z',
      confidence: 0.85,
      isPrimary: true,
    },
  ],
};

const PERSON_LEGACY_ONLY = {
  _id: 'person.legacy-bob',
  email: 'bob@oldco.com',
  phone: null,
  contactEmails: [],
  contactPhones: [],
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('handlePinContact', () => {
  let handlePinContact: any;
  let mockGroqQuery: any;
  let mockPatchDocument: any;
  let mockAssertSanityConfigured: any;
  const mockClient = { projectId: 'test', dataset: 'test' };

  beforeEach(async () => {
    const mod = await import('../../src/handlers/person-pin.js');
    handlePinContact = mod.handlePinContact;
    mockGroqQuery = vi.fn();
    mockPatchDocument = vi.fn().mockResolvedValue(undefined);
    mockAssertSanityConfigured = vi.fn().mockReturnValue(mockClient);
  });

  // ── Validation ──────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('rejects missing personId', async () => {
      const req = mockRequest({ field: 'contactEmails', value: 'test@test.com' });
      const res = await handlePinContact(
        req, 'req-1', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('personId');
    });

    it('rejects invalid field name', async () => {
      const req = mockRequest({ personId: 'person.x', field: 'emails', value: 'test@test.com' });
      const res = await handlePinContact(
        req, 'req-2', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.message).toContain('contactEmails');
    });

    it('rejects missing value', async () => {
      const req = mockRequest({ personId: 'person.x', field: 'contactEmails' });
      const res = await handlePinContact(
        req, 'req-3', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error.message).toContain('value');
    });

    it('rejects invalid JSON body', async () => {
      const req = new Request('http://localhost/person/pin-contact', {
        method: 'PATCH',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await handlePinContact(
        req, 'req-4', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();
      expect(res.status).toBe(400);
    });
  });

  // ── Person not found ────────────────────────────────────────────────────

  describe('person lookup', () => {
    it('returns 404 when person does not exist', async () => {
      mockGroqQuery.mockResolvedValue(null);
      const req = mockRequest({ personId: 'person.ghost', field: 'contactEmails', value: 'x@y.com' });
      const res = await handlePinContact(
        req, 'req-5', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when contact value not found in array', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_WITH_CONTACTS);
      const req = mockRequest({ personId: 'person.jane-doe', field: 'contactEmails', value: 'nobody@nowhere.com' });
      const res = await handlePinContact(
        req, 'req-6', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error.message).toContain('No matching entry');
    });
  });

  // ── Pin email ───────────────────────────────────────────────────────────

  describe('pin email', () => {
    it('pins a non-primary email and recomputes consensus', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_WITH_CONTACTS);
      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactEmails',
        value: 'jane.doe@gmail.com',
      });
      const res = await handlePinContact(
        req, 'req-7', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.pinned).toBe(true);

      // The pinned email should now be primary
      expect(body.data.primaryEmail).toBe('jane.doe@gmail.com');

      // Verify patchDocument was called with correct structure
      expect(mockPatchDocument).toHaveBeenCalledOnce();
      const [client, docId, ops] = mockPatchDocument.mock.calls[0];
      expect(docId).toBe('person.jane-doe');
      expect(ops.set.email).toBe('jane.doe@gmail.com'); // Legacy field synced

      // The pinned entry should have userPinned: true and isPrimary: true
      const pinnedEntry = ops.set.contactEmails.find((e: any) => e.value === 'jane.doe@gmail.com');
      expect(pinnedEntry.userPinned).toBe(true);
      expect(pinnedEntry.isPrimary).toBe(true);

      // The other entry should NOT have userPinned
      const otherEntry = ops.set.contactEmails.find((e: any) => e.value === 'jane@bigco.com');
      expect(otherEntry.userPinned).toBeUndefined();
      expect(otherEntry.isPrimary).toBe(false);
    });

    it('handles case-insensitive email matching', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_WITH_CONTACTS);
      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactEmails',
        value: 'JANE.DOE@GMAIL.COM', // uppercase
      });
      const res = await handlePinContact(
        req, 'req-8', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.pinned).toBe(true);
      expect(body.data.primaryEmail).toBe('jane.doe@gmail.com');
    });
  });

  // ── Pin phone ───────────────────────────────────────────────────────────

  describe('pin phone', () => {
    it('pins a phone number with format normalization', async () => {
      mockGroqQuery.mockResolvedValue({
        ...PERSON_WITH_CONTACTS,
        contactPhones: [
          {
            _key: 'p1',
            value: '+14155551234',
            source: 'salesforce',
            firstSeenAt: '2026-01-01T00:00:00Z',
            lastSeenAt: '2026-03-01T00:00:00Z',
            confidence: 0.85,
            isPrimary: true,
          },
          {
            _key: 'p2',
            value: '+14155559999',
            source: 'linkedin',
            firstSeenAt: '2026-02-01T00:00:00Z',
            lastSeenAt: '2026-02-15T00:00:00Z',
            confidence: 0.65,
            isPrimary: false,
          },
        ],
      });

      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactPhones',
        value: '+1 (415) 555-9999', // formatted differently but same number
      });
      const res = await handlePinContact(
        req, 'req-9', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.pinned).toBe(true);
      expect(body.data.primaryPhone).toBe('+14155559999');
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles person with empty contact arrays', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_LEGACY_ONLY);
      const req = mockRequest({
        personId: 'person.legacy-bob',
        field: 'contactEmails',
        value: 'bob@oldco.com',
      });
      const res = await handlePinContact(
        req, 'req-10', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      // Empty array — value not found
      expect(res.status).toBe(404);
      expect(body.error.message).toContain('No matching entry');
    });

    it('handles Sanity write failure gracefully', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_WITH_CONTACTS);
      mockPatchDocument.mockRejectedValue(new Error('Sanity quota exceeded'));

      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactEmails',
        value: 'jane@bigco.com',
      });
      const res = await handlePinContact(
        req, 'req-11', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error.code).toBe('SANITY_ERROR');
    });

    it('handles Sanity config failure', async () => {
      mockAssertSanityConfigured.mockImplementation(() => { throw new Error('Not configured'); });
      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactEmails',
        value: 'jane@bigco.com',
      });
      const res = await handlePinContact(
        req, 'req-12', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error.code).toBe('CONFIG_ERROR');
    });

    it('re-pinning the already-primary entry is a no-op on primary but sets userPinned', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_WITH_CONTACTS);
      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactEmails',
        value: 'jane@bigco.com', // already primary
      });
      const res = await handlePinContact(
        req, 'req-13', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.primaryEmail).toBe('jane@bigco.com');

      // Should still write — userPinned is now set
      const [, , ops] = mockPatchDocument.mock.calls[0];
      const pinnedEntry = ops.set.contactEmails.find((e: any) => e.value === 'jane@bigco.com');
      expect(pinnedEntry.userPinned).toBe(true);
    });

    it('returns updated arrays in response for UI refresh', async () => {
      mockGroqQuery.mockResolvedValue(PERSON_WITH_CONTACTS);
      const req = mockRequest({
        personId: 'person.jane-doe',
        field: 'contactEmails',
        value: 'jane.doe@gmail.com',
      });
      const res = await handlePinContact(
        req, 'req-14', {}, mockGroqQuery, mockPatchDocument,
        mockAssertSanityConfigured, createSuccessResponse, createErrorResponse, safeParseJson,
      );
      const body = await res.json();

      // Response includes both arrays for UI refresh
      expect(body.data.contactEmails).toBeDefined();
      expect(body.data.contactPhones).toBeDefined();
      expect(Array.isArray(body.data.contactEmails)).toBe(true);
      expect(Array.isArray(body.data.contactPhones)).toBe(true);
    });
  });
});
