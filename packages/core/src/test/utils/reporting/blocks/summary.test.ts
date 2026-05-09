import { describe, it, expect } from 'vitest';
import { renderSummary } from '../../../../utils/reporting/blocks/summary';
import type { ReportSummary } from '../../../../utils/reporting/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    total: 10,
    passed: 7,
    failed: 2,
    skipped: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderSummary — tile presence
// ---------------------------------------------------------------------------

describe('renderSummary', () => {
  it('renders the wc-summary-grid container', () => {
    const out = renderSummary(makeSummary());
    expect(out).toContain('wc-summary-grid');
  });

  it('renders a search input for report filtering', () => {
    const out = renderSummary(makeSummary());
    expect(out).toContain('data-report-search');
    expect(out).toContain('wc-search-input');
    expect(out).not.toContain('wc-search-label');
    expect(out).not.toContain('<label');
  });

  it('renders a Total tile with the correct value', () => {
    const out = renderSummary(makeSummary({ total: 42 }));
    expect(out).toContain('Total');
    expect(out).toContain('42');
  });

  it('renders a Passed tile with the correct value', () => {
    const out = renderSummary(makeSummary({ passed: 38 }));
    expect(out).toContain('Passed');
    expect(out).toContain('38');
  });

  it('renders a Failed tile with the correct value', () => {
    const out = renderSummary(makeSummary({ failed: 3 }));
    expect(out).toContain('Failed');
    expect(out).toContain('3');
  });

  it('renders a Skipped tile with the correct value', () => {
    const out = renderSummary(makeSummary({ skipped: 1 }));
    expect(out).toContain('Skipped');
    expect(out).toContain('1');
  });

  it('renders all five tile CSS classes', () => {
    const out = renderSummary(makeSummary());
    expect(out).toContain('wc-tile-value--total');
    expect(out).toContain('wc-tile-value--passed');
    expect(out).toContain('wc-tile-value--failed');
    expect(out).toContain('wc-tile-value--skipped');
    expect(out).toContain('wc-tile-value--time');
  });

  it('renders clickable summary filters for total/passed/failed/skipped', () => {
    const out = renderSummary(makeSummary());
    expect(out).toContain('data-summary-filter="all"');
    expect(out).toContain('data-summary-filter="passed"');
    expect(out).toContain('data-summary-filter="failed"');
    expect(out).toContain('data-summary-filter="skipped"');
  });

  // The user reported having to click directly on the small label text to
  // filter; clicking the surrounding tile area did nothing. The whole tile is
  // now the button (a <button> with class `wc-tile`) so any click on the tile
  // toggles the filter.
  it('makes the entire summary tile a button (whole-tile click target)', () => {
    const out = renderSummary(makeSummary());
    // The Total tile button must be a <button> carrying both wc-tile and the
    // filter dataset attribute, not a label-only inner button.
    expect(out).toMatch(/<button[^>]*class="wc-tile wc-tile-btn"[^>]*data-summary-filter="all"/);
    expect(out).toMatch(/<button[^>]*class="wc-tile wc-tile-btn"[^>]*data-summary-filter="passed"/);
    expect(out).toMatch(/<button[^>]*class="wc-tile wc-tile-btn"[^>]*data-summary-filter="failed"/);
    expect(out).toMatch(/<button[^>]*class="wc-tile wc-tile-btn"[^>]*data-summary-filter="skipped"/);
  });

  it('renders Expand All and Collapse All bulk-toggle buttons', () => {
    const out = renderSummary(makeSummary());
    expect(out).toContain('data-bulk-toggle="expand"');
    expect(out).toContain('data-bulk-toggle="collapse"');
  });
});

// ---------------------------------------------------------------------------
// renderSummary — Avg Time tile
// ---------------------------------------------------------------------------

describe('renderSummary — Avg Time tile', () => {
  it('renders "-" when averageTimeMs is undefined', () => {
    const out = renderSummary(makeSummary({ averageTimeMs: undefined }));
    expect(out).toContain('Avg Time');
    // The "-" placeholder must be in the output
    expect(out).toContain('-');
  });

  it('formats averageTimeMs as milliseconds for small values', () => {
    const out = renderSummary(makeSummary({ averageTimeMs: 450 }));
    expect(out).toContain('450ms');
  });

  it('formats averageTimeMs as seconds for values >= 1000ms', () => {
    const out = renderSummary(makeSummary({ averageTimeMs: 2_500 }));
    expect(out).toContain('2.50s');
  });

  it('formats averageTimeMs as minutes for values >= 60000ms', () => {
    const out = renderSummary(makeSummary({ averageTimeMs: 90_000 }));
    expect(out).toContain('1m 30s');
  });

  it('renders "0ms" when averageTimeMs is 0', () => {
    const out = renderSummary(makeSummary({ averageTimeMs: 0 }));
    expect(out).toContain('0ms');
  });
});

// ---------------------------------------------------------------------------
// renderSummary — zero-value tiles
// ---------------------------------------------------------------------------

describe('renderSummary — zero values', () => {
  it('renders 0 for all counts correctly', () => {
    const out = renderSummary({ total: 0, passed: 0, failed: 0, skipped: 0 });
    // All five tile value spans exist; each has a numeric value
    expect(out).toContain('wc-tile-value--total');
    expect(out).toContain('wc-tile-value--passed');
    // The output contains "0" at least once (any of the zero values)
    expect(out).toContain('>0<');
  });
});
