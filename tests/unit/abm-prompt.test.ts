/**
 * Tests for ABM prompt builder and response parser.
 */
import { describe, it, expect } from 'vitest';
import { buildAbmPromptMessages, parseAbmResponse } from '../../src/lib/abm-prompt.ts';

describe('buildAbmPromptMessages', () => {
  it('returns system + user messages with account name and raw input', () => {
    const msgs = buildAbmPromptMessages({
      accountName: 'Acme Corp',
      rawInput: 'Acme Corp is a 500-person company using Salesforce and React.',
    });

    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('Acme Corp');
    expect(msgs[1].content).toContain('Salesforce and React');
  });

  it('includes extracted screenshot text when provided', () => {
    const msgs = buildAbmPromptMessages({
      accountName: 'Test Co',
      rawInput: 'Some notes',
      extractedScreenshotText: 'CEO: John Smith, CTO: Jane Doe',
    });

    expect(msgs[1].content).toContain('[EXTRACTED FROM SCREENSHOTS]');
    expect(msgs[1].content).toContain('CEO: John Smith');
  });

  it('includes captured sources block', () => {
    const msgs = buildAbmPromptMessages({
      accountName: 'Test Co',
      rawInput: 'Some notes',
      capturedSources: [
        { type: 'url', value: 'https://linkedin.com/company/test', title: 'LinkedIn' },
        { type: 'selected_text', value: 'Revenue: $50M ARR' },
      ],
    });

    expect(msgs[1].content).toContain('CAPTURED SOURCES:');
    expect(msgs[1].content).toContain('[URL (LinkedIn)]');
    expect(msgs[1].content).toContain('[Selected Text]');
    expect(msgs[1].content).toContain('Revenue: $50M ARR');
  });

  it('handles empty inputs gracefully', () => {
    const msgs = buildAbmPromptMessages({
      accountName: '',
      rawInput: '',
    });

    expect(msgs[1].content).toContain('Unknown Account');
    expect(msgs[1].content).toContain('No research text provided.');
  });
});

describe('parseAbmResponse', () => {
  it('parses valid JSON with all four keys', () => {
    const raw = JSON.stringify({
      salesNavigator: 'Company overview here.',
      intentSignals: 'Signals found.',
      stakeholders: 'CEO: John Smith',
      additionalContext: 'Competitive landscape.',
    });

    const result = parseAbmResponse(raw);
    expect(result.salesNavigator).toBe('Company overview here.');
    expect(result.intentSignals).toBe('Signals found.');
    expect(result.stakeholders).toBe('CEO: John Smith');
    expect(result.additionalContext).toBe('Competitive landscape.');
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const raw = '```json\n{"salesNavigator":"A","intentSignals":"B","stakeholders":"C","additionalContext":"D"}\n```';

    const result = parseAbmResponse(raw);
    expect(result.salesNavigator).toBe('A');
    expect(result.additionalContext).toBe('D');
  });

  it('returns defaults for invalid JSON', () => {
    const result = parseAbmResponse('This is not JSON at all');
    expect(result.salesNavigator).toContain('Generation failed');
    expect(result.intentSignals).toContain('Generation failed');
  });

  it('returns defaults for empty string', () => {
    const result = parseAbmResponse('');
    expect(result.salesNavigator).toContain('Generation failed');
  });

  it('handles partial JSON (missing keys)', () => {
    const raw = '{"salesNavigator":"Yes","intentSignals":"OK"}';
    const result = parseAbmResponse(raw);
    expect(result.salesNavigator).toBe('Yes');
    expect(result.intentSignals).toBe('OK');
    expect(result.stakeholders).toContain('Generation failed');
    expect(result.additionalContext).toContain('Generation failed');
  });
});
