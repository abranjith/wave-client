import { describe, it, expect } from 'vitest';
import {
  formatTimestamp,
  formatDuration,
  sanitizeFilename,
  buildReportFilename,
} from '../../../utils/reporting/format';

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('formats a known UTC epoch to local-time components', () => {
    // 2026-05-05T14:30:22.000Z
    const epoch = new Date('2026-05-05T14:30:22.000Z').getTime();
    const result = formatTimestamp(epoch);
    // The formatted string must match YYYY-MM-DD HH:MM:SS pattern
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('includes seconds in the output', () => {
    const d = new Date();
    d.setSeconds(7);
    const result = formatTimestamp(d.getTime());
    expect(result).toMatch(/:07$/);
  });

  it('pads single-digit month and day', () => {
    // January 5 — month 01, day 05
    const d = new Date(2026, 0, 5, 0, 0, 0); // local time
    const result = formatTimestamp(d.getTime());
    expect(result.slice(0, 10)).toBe('2026-01-05');
  });

  it('pads single-digit hours, minutes, seconds', () => {
    const d = new Date(2026, 0, 1, 1, 2, 3); // 01:02:03 local
    const result = formatTimestamp(d.getTime());
    expect(result.slice(11)).toBe('01:02:03');
  });

  it('returns "—" for NaN', () => {
    expect(formatTimestamp(NaN)).toBe('—');
  });

  it('returns "—" for Infinity', () => {
    expect(formatTimestamp(Infinity)).toBe('—');
  });

  it('returns "—" for -Infinity', () => {
    expect(formatTimestamp(-Infinity)).toBe('—');
  });

  it('handles epoch 0 (Unix epoch) gracefully', () => {
    const result = formatTimestamp(0);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it('returns "0ms" for zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('returns "0ms" for negative values', () => {
    expect(formatDuration(-100)).toBe('0ms');
  });

  it('formats 1 ms as "1ms"', () => {
    expect(formatDuration(1)).toBe('1ms');
  });

  it('formats 999 ms as "999ms"', () => {
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats 1000 ms as "1.00s"', () => {
    expect(formatDuration(1_000)).toBe('1.00s');
  });

  it('formats 1230 ms as "1.23s"', () => {
    expect(formatDuration(1_230)).toBe('1.23s');
  });

  it('formats 59999 ms as seconds', () => {
    expect(formatDuration(59_999)).toMatch(/^\d+\.\d{2}s$/);
  });

  it('formats 60000 ms as "1m 0s"', () => {
    expect(formatDuration(60_000)).toBe('1m 0s');
  });

  it('formats 134000 ms as "2m 14s"', () => {
    expect(formatDuration(134_000)).toBe('2m 14s');
  });

  it('formats 3661000 ms (> 1h) using minutes', () => {
    expect(formatDuration(3_661_000)).toBe('61m 1s');
  });

  it('returns "—" for NaN', () => {
    expect(formatDuration(NaN)).toBe('—');
  });

  it('returns "—" for Infinity', () => {
    expect(formatDuration(Infinity)).toBe('—');
  });
});

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  it('leaves alphanumeric characters unchanged', () => {
    expect(sanitizeFilename('MyAPI')).toBe('MyAPI');
  });

  it('leaves underscores and hyphens unchanged', () => {
    expect(sanitizeFilename('my_api-v2')).toBe('my_api-v2');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeFilename('my api')).toBe('my-api');
  });

  it('replaces dots with hyphens', () => {
    expect(sanitizeFilename('v1.0.0')).toBe('v1-0-0');
  });

  it('replaces forward slashes with hyphens', () => {
    expect(sanitizeFilename('path/to/file')).toBe('path-to-file');
  });

  it('replaces backslashes with hyphens', () => {
    expect(sanitizeFilename('path\\to\\file')).toBe('path-to-file');
  });

  it('replaces colons with hyphens (Windows drive letters)', () => {
    expect(sanitizeFilename('C:file')).toBe('C-file');
  });

  it('collapses consecutive special characters to a single hyphen', () => {
    expect(sanitizeFilename('a  b   c')).toBe('a-b-c');
  });

  it('trims leading hyphens', () => {
    expect(sanitizeFilename(' hello')).toBe('hello');
  });

  it('trims trailing hyphens', () => {
    expect(sanitizeFilename('hello ')).toBe('hello');
  });

  it('handles unicode by replacing non-ASCII with hyphens', () => {
    // "日本語" becomes three hyphens which collapse to one, with trimming
    const result = sanitizeFilename('日本語');
    expect(result).toMatch(/^-*[a-zA-Z0-9_-]*/);
    // Should not be empty
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles path separators together', () => {
    expect(sanitizeFilename('a/b\\c')).toBe('a-b-c');
  });

  it('returns "export" for an empty string', () => {
    expect(sanitizeFilename('')).toBe('export');
  });

  it('returns "export" for a string of only special characters', () => {
    expect(sanitizeFilename('///')).toBe('export');
  });

  it('handles a realistic collection name', () => {
    const result = sanitizeFilename('My API Collection v2.1');
    expect(result).toBe('My-API-Collection-v2-1');
  });
});

// ---------------------------------------------------------------------------
// buildReportFilename
// ---------------------------------------------------------------------------

describe('buildReportFilename', () => {
  it('produces the expected pattern: wave-{type}-{name}-{YYYYMMDD-HHMMSS}.html', () => {
    const now = new Date(2026, 4, 5, 14, 30, 22).getTime(); // May 5 2026 14:30:22 local
    const result = buildReportFilename('collection', 'My API', now);
    expect(result).toBe('wave-collection-My-API-20260505-143022.html');
  });

  it('sanitizes the subject name', () => {
    const now = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const result = buildReportFilename('flow', 'My Flow / v2', now);
    expect(result).toContain('My-Flow-v2');
  });

  it('uses the run type verbatim in the filename', () => {
    const now = new Date(2026, 0, 1, 0, 0, 0).getTime();
    expect(buildReportFilename('testsuite', 'Suite', now)).toMatch(/^wave-testsuite-/);
  });

  it('ends with .html', () => {
    const result = buildReportFilename('collection', 'Test', Date.now());
    expect(result).toMatch(/\.html$/);
  });

  it('embeds the date in YYYYMMDD format', () => {
    const d = new Date(2026, 4, 5, 0, 0, 0); // May 5 2026
    const result = buildReportFilename('collection', 'x', d.getTime());
    expect(result).toContain('20260505');
  });

  it('embeds the time in HHMMSS format', () => {
    const d = new Date(2026, 4, 5, 9, 7, 3); // 09:07:03
    const result = buildReportFilename('collection', 'x', d.getTime());
    expect(result).toContain('090703');
  });
});
