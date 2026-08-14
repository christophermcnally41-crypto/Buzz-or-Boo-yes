import { describe, it, expect } from 'vitest';
import { buildDescriptionPreview } from './admin-preview';

// ---------------------------------------------------------------------------
// MULTI_CHOICE
// ---------------------------------------------------------------------------

describe('buildDescriptionPreview — MULTI_CHOICE', () => {
  const twoContenders = [
    { key: 'A', name: 'Flour Bakery', venue: 'South End' },
    { key: 'B', name: 'Clear Flour',  venue: '' },
  ];

  it('returns null when no contenders have names', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', [
      { key: 'A', name: '' },
      { key: 'B', name: '  ' },
    ], '', '', false);
    expect(result).toBeNull();
  });

  it('includes only contenders with non-empty names', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', [
      { key: 'A', name: 'Flour Bakery', venue: 'South End' },
      { key: 'B', name: '' },
    ], '', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed.contenders).toHaveLength(1);
    expect(parsed.contenders[0].key).toBe('A');
  });

  it('omits the venue field when venue is blank', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', '', false);
    const parsed = JSON.parse(result!);
    const b = parsed.contenders.find((c: any) => c.key === 'B');
    expect(b).not.toHaveProperty('venue');
  });

  it('includes the venue field when venue is non-blank', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', '', false);
    const parsed = JSON.parse(result!);
    const a = parsed.contenders.find((c: any) => c.key === 'A');
    expect(a.venue).toBe('South End');
  });

  it('omits metric / period when they are empty strings', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty('metric');
    expect(parsed).not.toHaveProperty('period');
  });

  it('includes metric when provided', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, 'Google review count', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed.metric).toBe('Google review count');
  });

  it('includes period when provided', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', 'September 2026', false);
    const parsed = JSON.parse(result!);
    expect(parsed.period).toBe('September 2026');
  });

  it('omits recurring when false', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty('recurring');
  });

  it('includes recurring: true when set', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', '', true);
    const parsed = JSON.parse(result!);
    expect(parsed.recurring).toBe(true);
  });

  it('trims whitespace from names and venues', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', [
      { key: 'A', name: '  Flour Bakery  ', venue: '  South End  ' },
    ], '', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed.contenders[0].name).toBe('Flour Bakery');
    expect(parsed.contenders[0].venue).toBe('South End');
  });

  it('returns valid pretty-printed JSON (2-space indent)', () => {
    const result = buildDescriptionPreview('MULTI_CHOICE', twoContenders, '', '', false);
    // Round-trip parse must succeed and re-serialisation matches
    expect(() => JSON.parse(result!)).not.toThrow();
    expect(result).toContain('\n  ');
  });

  // Accessibility gate: the copied text is exactly what will be stored on save.
  it('produces the same JSON shape as the save payload for a two-contender market', () => {
    const result = buildDescriptionPreview(
      'MULTI_CHOICE',
      [
        { key: 'A', name: 'Flour Bakery', venue: 'South End' },
        { key: 'B', name: 'Clear Flour',  venue: '' },
      ],
      'Google review count',
      'September 2026',
      true,
    );
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({
      contenders: [
        { key: 'A', name: 'Flour Bakery', venue: 'South End' },
        { key: 'B', name: 'Clear Flour' },
      ],
      metric: 'Google review count',
      period: 'September 2026',
      recurring: true,
    });
  });
});

// ---------------------------------------------------------------------------
// THE_CALL
// ---------------------------------------------------------------------------

describe('buildDescriptionPreview — THE_CALL', () => {
  const twoOptions = [
    { key: 'A', name: 'Yes, definitely' },
    { key: 'B', name: 'No way' },
  ];

  it('returns null when no options have names', () => {
    const result = buildDescriptionPreview('THE_CALL', [
      { key: 'A', name: '' },
      { key: 'B', name: '  ' },
    ], '', '', false);
    expect(result).toBeNull();
  });

  it('maps contender name to label in the options array', () => {
    const result = buildDescriptionPreview('THE_CALL', twoOptions, '', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed.options).toEqual([
      { key: 'A', label: 'Yes, definitely' },
      { key: 'B', label: 'No way' },
    ]);
  });

  it('omits context when metric is empty', () => {
    const result = buildDescriptionPreview('THE_CALL', twoOptions, '', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty('context');
  });

  it('includes context when metric is provided', () => {
    const result = buildDescriptionPreview('THE_CALL', twoOptions, 'Best for weekly grocery run', '', false);
    const parsed = JSON.parse(result!);
    expect(parsed.context).toBe('Best for weekly grocery run');
  });

  it('does not include period or recurring fields (not used by THE_CALL)', () => {
    const result = buildDescriptionPreview('THE_CALL', twoOptions, '', 'Q1 2027', true);
    const parsed = JSON.parse(result!);
    expect(parsed).not.toHaveProperty('period');
    expect(parsed).not.toHaveProperty('recurring');
  });

  it('produces the same JSON shape as the save payload', () => {
    const result = buildDescriptionPreview(
      'THE_CALL',
      [
        { key: 'A', name: 'Yes, definitely' },
        { key: 'B', name: 'No way' },
        { key: 'C', name: 'Too soon to tell' },
      ],
      'Best for weekly grocery run',
      '',
      false,
    );
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({
      options: [
        { key: 'A', label: 'Yes, definitely' },
        { key: 'B', label: 'No way' },
        { key: 'C', label: 'Too soon to tell' },
      ],
      context: 'Best for weekly grocery run',
    });
  });
});

// ---------------------------------------------------------------------------
// Unsupported formats
// ---------------------------------------------------------------------------

describe('buildDescriptionPreview — other formats', () => {
  const contenders = [{ key: 'A', name: 'Option A' }];

  it('returns null for STANDARD format', () => {
    expect(buildDescriptionPreview('STANDARD', contenders, '', '', false)).toBeNull();
  });

  it('returns null for HOT_OR_NOT format', () => {
    expect(buildDescriptionPreview('HOT_OR_NOT', contenders, '', '', false)).toBeNull();
  });

  it('returns null for BUZZ_OR_BOO format', () => {
    expect(buildDescriptionPreview('BUZZ_OR_BOO', contenders, '', '', false)).toBeNull();
  });

  it('returns null for HEAD_TO_HEAD format', () => {
    expect(buildDescriptionPreview('HEAD_TO_HEAD', contenders, '', '', false)).toBeNull();
  });
});
