import { describe, it, expect } from 'vitest';
import { renderShell } from '../../../utils/reporting/shell';
import { THEME_CSS } from '../../../utils/reporting/theme';
import { INTERACTIVITY_JS } from '../../../utils/reporting/interactivity';

// ---------------------------------------------------------------------------
// renderShell — structural anchors
// ---------------------------------------------------------------------------

describe('renderShell', () => {
  const output = renderShell({ title: 'Test Report', body: '<p>Hello</p>' });

  it('starts with <!DOCTYPE html>', () => {
    expect(output.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('contains a lang="en" attribute on <html>', () => {
    expect(output).toContain('lang="en"');
  });

  it('contains <meta charset="utf-8">', () => {
    expect(output.toLowerCase()).toContain('charset="utf-8"');
  });

  it('embeds the title in <title>', () => {
    expect(output).toContain('<title>Test Report</title>');
  });

  it('contains exactly one <style> block', () => {
    const styleCount = (output.match(/<style/g) ?? []).length;
    expect(styleCount).toBe(1);
  });

  it('contains exactly one <script> block', () => {
    const scriptCount = (output.match(/<script/g) ?? []).length;
    expect(scriptCount).toBe(1);
  });

  it('embeds THEME_CSS inside the <style> block', () => {
    // A representative fragment of the CSS must be present
    expect(output).toContain('--wc-bg');
    expect(output).toContain('wc-summary-grid');
  });

  it('embeds INTERACTIVITY_JS inside the <script> block', () => {
    // A representative fragment of the JS must be present
    expect(output).toContain('data-toggle');
    expect(output).toContain('data-tab-panel');
  });

  it('places the <script> before </body>', () => {
    const scriptIdx = output.lastIndexOf('<script');
    const bodyCloseIdx = output.indexOf('</body>');
    expect(scriptIdx).toBeGreaterThan(-1);
    expect(bodyCloseIdx).toBeGreaterThan(-1);
    expect(scriptIdx).toBeLessThan(bodyCloseIdx);
  });

  it('includes the body content', () => {
    expect(output).toContain('<p>Hello</p>');
  });

  it('closes all major structural tags', () => {
    expect(output).toContain('</html>');
    expect(output).toContain('</head>');
    expect(output).toContain('</body>');
  });

  it('includes THEME_CSS constant verbatim', () => {
    // The first 20 chars of the constant must appear in the output
    expect(output).toContain(THEME_CSS.slice(0, 20));
  });

  it('includes INTERACTIVITY_JS constant verbatim', () => {
    expect(output).toContain(INTERACTIVITY_JS.slice(0, 20));
  });
});

// ---------------------------------------------------------------------------
// renderShell — title escaping
// ---------------------------------------------------------------------------

describe('renderShell — title escaping', () => {
  it('escapes < and > in the title', () => {
    const out = renderShell({ title: '<evil>', body: '' });
    expect(out).toContain('&lt;evil&gt;');
    expect(out).not.toContain('<title><evil>');
  });

  it('escapes & in the title', () => {
    const out = renderShell({ title: 'A & B', body: '' });
    expect(out).toContain('A &amp; B');
  });

  it('escapes " in the title', () => {
    const out = renderShell({ title: 'Say "hi"', body: '' });
    expect(out).toContain('Say &quot;hi&quot;');
  });

  it('XSS regression: <script>alert(1)</script> in title is escaped', () => {
    const out = renderShell({ title: '<script>alert(1)</script>', body: '' });
    expect(out).toContain('&lt;script&gt;');
    // The title element should not contain a raw executable script tag
    const titleStart = out.indexOf('<title>') + '<title>'.length;
    const titleEnd = out.indexOf('</title>');
    const titleContent = out.slice(titleStart, titleEnd);
    expect(titleContent).not.toContain('<script>');
  });
});
