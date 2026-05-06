import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr } from '../../../utils/reporting/escape';

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  // --- Individual special characters ---

  it('escapes & to &amp;', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('escapes < to &lt;', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeHtml('>')).toBe('&gt;');
  });

  it('escapes " to &quot;', () => {
    expect(escapeHtml('"')).toBe('&quot;');
  });

  it("escapes ' to &#39;", () => {
    expect(escapeHtml("'")).toBe('&#39;');
  });

  // --- Edge inputs ---

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  // --- Mixed payloads ---

  it('escapes all special characters in a mixed string', () => {
    expect(escapeHtml('<b class="x">it\'s & fine</b>')).toBe(
      '&lt;b class=&quot;x&quot;&gt;it&#39;s &amp; fine&lt;/b&gt;',
    );
  });

  // --- & must be escaped first (no double-escaping) ---

  it('does not double-escape: & in input becomes &amp; not &amp;amp;', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('handles repeated & correctly', () => {
    expect(escapeHtml('a && b')).toBe('a &amp;&amp; b');
  });

  // --- XSS regression: script injection ---

  it('neutralises a <script> XSS payload', () => {
    const payload = '<script>alert(1)</script>';
    const result = escapeHtml(payload);
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('neutralises an attribute injection payload', () => {
    const payload = '" onmouseover="alert(1)"';
    const result = escapeHtml(payload);
    expect(result).not.toContain('"');
    expect(result).toContain('&quot;');
  });

  it('handles an event handler injection via single-quote', () => {
    const payload = "' onload='alert(1)'";
    const result = escapeHtml(payload);
    expect(result).not.toContain("'");
    expect(result).toContain('&#39;');
  });

  // --- Surrogate-pair / unicode safety ---

  it('preserves standard unicode characters without alteration', () => {
    expect(escapeHtml('日本語テスト')).toBe('日本語テスト');
  });

  it('preserves emoji without alteration', () => {
    expect(escapeHtml('🎉 party')).toBe('🎉 party');
  });

  // Surrogate pairs (high + low surrogate encoded as a single JS string)
  it('handles surrogate-pair characters correctly', () => {
    const surrogate = '\uD83D\uDE00'; // 😀 U+1F600
    expect(escapeHtml(surrogate)).toBe(surrogate);
  });
});

// ---------------------------------------------------------------------------
// escapeAttr
// ---------------------------------------------------------------------------

describe('escapeAttr', () => {
  // --- All escapeHtml characters are also covered ---

  it('escapes & to &amp;', () => {
    expect(escapeAttr('&')).toBe('&amp;');
  });

  it('escapes < to &lt;', () => {
    expect(escapeAttr('<')).toBe('&lt;');
  });

  it('escapes > to &gt;', () => {
    expect(escapeAttr('>')).toBe('&gt;');
  });

  it('escapes " to &quot;', () => {
    expect(escapeAttr('"')).toBe('&quot;');
  });

  it("escapes ' to &#39;", () => {
    expect(escapeAttr("'")).toBe('&#39;');
  });

  // --- Backtick — the extra escapeAttr character ---

  it('escapes backtick to &#96;', () => {
    expect(escapeAttr('`')).toBe('&#96;');
  });

  it('escapes backtick in a mixed string', () => {
    const result = escapeAttr('hello`world');
    expect(result).toBe('hello&#96;world');
  });

  // --- Edge inputs ---

  it('returns empty string for empty input', () => {
    expect(escapeAttr('')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(escapeAttr(undefined)).toBe('');
  });

  // --- XSS regression ---

  it('neutralises a <script> XSS payload', () => {
    const payload = '<script>alert(1)</script>';
    const result = escapeAttr(payload);
    expect(result).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('neutralises backtick template-literal injection', () => {
    const payload = '`; alert(1); //`';
    const result = escapeAttr(payload);
    expect(result).not.toContain('`');
    expect(result).toContain('&#96;');
  });

  it('neutralises combined injection with &, <, " and backtick', () => {
    const payload = '& < " ` >';
    const result = escapeAttr(payload);
    expect(result).toBe('&amp; &lt; &quot; &#96; &gt;');
    expect(result).not.toContain('`');
    expect(result).not.toContain('"');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  // --- Surrogate-pair / unicode safety ---

  it('preserves unicode characters without alteration', () => {
    expect(escapeAttr('日本語テスト')).toBe('日本語テスト');
  });
});
