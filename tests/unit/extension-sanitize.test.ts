import { describe, it, expect } from 'vitest';
import {
  sanitizeExtensionPayload,
  stripHtmlTags,
  isBodyWithinSizeLimit,
  MAX_BODY_BYTES,
} from '../../src/utils/extension-sanitize.js';

describe('stripHtmlTags', () => {
  it('removes simple HTML tags', () => {
    expect(stripHtmlTags('<b>bold</b>')).toBe('bold');
    expect(stripHtmlTags('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it('removes nested tags', () => {
    expect(stripHtmlTags('<div><p>hello</p></div>')).toBe('hello');
  });

  it('handles self-closing tags', () => {
    expect(stripHtmlTags('line1<br/>line2')).toBe('line1line2');
    expect(stripHtmlTags('text<img src="x.png"/>more')).toBe('textmore');
  });

  it('handles tags with attributes', () => {
    expect(stripHtmlTags('<a href="http://evil.com" onclick="steal()">click</a>')).toBe('click');
  });

  it('returns empty string for null/undefined', () => {
    expect(stripHtmlTags(null as any)).toBe('');
    expect(stripHtmlTags(undefined as any)).toBe('');
  });

  it('passes through plain text unchanged', () => {
    expect(stripHtmlTags('just plain text')).toBe('just plain text');
    expect(stripHtmlTags('math: 3 < 5 > 2')).toBe('math: 3  2');
  });
});

describe('sanitizeExtensionPayload', () => {
  it('returns empty object for null/undefined input', () => {
    expect(sanitizeExtensionPayload(null)).toEqual({});
    expect(sanitizeExtensionPayload(undefined)).toEqual({});
  });

  it('truncates prompt to 500 chars', () => {
    const longPrompt = 'a'.repeat(600);
    const result = sanitizeExtensionPayload({ prompt: longPrompt });
    expect(result.prompt.length).toBe(501); // 500 + '…'
    expect(result.prompt.endsWith('…')).toBe(true);
  });

  it('strips HTML from prompt', () => {
    const result = sanitizeExtensionPayload({ prompt: '<script>alert("xss")</script>Tell me about this company' });
    expect(result.prompt).toBe('alert("xss")Tell me about this company');
    expect(result.prompt).not.toContain('<script>');
  });

  it('truncates rawText to 10240 chars', () => {
    const longText = 'x'.repeat(11000);
    const result = sanitizeExtensionPayload({ rawText: longText });
    expect(result.rawText.length).toBe(10241); // 10240 + '…'
  });

  it('strips HTML from rawText', () => {
    const result = sanitizeExtensionPayload({ rawText: '<div>content</div>' });
    expect(result.rawText).toBe('content');
  });

  it('slices arrays to their limits', () => {
    const result = sanitizeExtensionPayload({
      headings: Array(100).fill('heading'),
      links: Array(100).fill({ text: 'link', href: 'http://example.com' }),
      people: Array(100).fill({ name: 'person' }),
      accounts: Array(50).fill({ name: 'account' }),
      emails: Array(50).fill('test@example.com'),
      phones: Array(50).fill('+1234567890'),
      technologies: Array(100).fill('React'),
    });

    expect(result.headings).toHaveLength(50);
    expect(result.links).toHaveLength(50);
    expect(result.people).toHaveLength(50);
    expect(result.accounts).toHaveLength(20);
    expect(result.emails).toHaveLength(30);
    expect(result.phones).toHaveLength(30);
    expect(result.technologies).toHaveLength(50);
  });

  it('does not mutate the original object', () => {
    const original = { prompt: '<b>test</b>', headings: Array(100).fill('h') };
    const result = sanitizeExtensionPayload(original);
    expect(original.prompt).toBe('<b>test</b>');
    expect(original.headings).toHaveLength(100);
    expect(result.prompt).toBe('test');
    expect(result.headings).toHaveLength(50);
  });

  it('passes through fields within limits unchanged', () => {
    const body = {
      prompt: 'short prompt',
      rawText: 'short text',
      headings: ['h1', 'h2'],
      url: 'https://example.com',
      source: 'linkedin',
    };
    const result = sanitizeExtensionPayload(body);
    expect(result.prompt).toBe('short prompt');
    expect(result.rawText).toBe('short text');
    expect(result.headings).toEqual(['h1', 'h2']);
    expect(result.url).toBe('https://example.com');
    expect(result.source).toBe('linkedin');
  });

  it('handles missing optional fields gracefully', () => {
    const result = sanitizeExtensionPayload({ prompt: 'hello' });
    expect(result.prompt).toBe('hello');
    expect(result.headings).toBeUndefined();
    expect(result.rawText).toBeUndefined();
  });
});

describe('isBodyWithinSizeLimit', () => {
  function mockRequest(contentLength: string | null): Request {
    const headers = new Headers();
    if (contentLength !== null) {
      headers.set('content-length', contentLength);
    }
    return { headers } as unknown as Request;
  }

  it('allows requests within the limit', () => {
    expect(isBodyWithinSizeLimit(mockRequest('1024'))).toBe(true);
    expect(isBodyWithinSizeLimit(mockRequest(String(MAX_BODY_BYTES)))).toBe(true);
  });

  it('rejects requests over the limit', () => {
    expect(isBodyWithinSizeLimit(mockRequest(String(MAX_BODY_BYTES + 1)))).toBe(false);
    expect(isBodyWithinSizeLimit(mockRequest('100000'))).toBe(false);
  });

  it('allows requests with no content-length header', () => {
    expect(isBodyWithinSizeLimit(mockRequest(null))).toBe(true);
    expect(isBodyWithinSizeLimit(mockRequest('0'))).toBe(true);
  });
});
