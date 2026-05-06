import { describe, it, expect } from 'vitest';
import { renderHeader } from '../../../../utils/reporting/blocks/header';
import type { ReportMetadata } from '../../../../utils/reporting/types';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeMetadata(overrides: Partial<ReportMetadata> = {}): ReportMetadata {
  return {
    runType: 'collection',
    subjectName: 'My Collection',
    startedAt: new Date(2026, 4, 5, 14, 30, 22).getTime(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderHeader — structural presence
// ---------------------------------------------------------------------------

describe('renderHeader', () => {
  it('renders a <header> element', () => {
    const out = renderHeader(makeMetadata());
    expect(out).toContain('<header');
    expect(out).toContain('</header>');
  });

  it('includes the Wave Client wordmark', () => {
    const out = renderHeader(makeMetadata());
    expect(out).toContain('Wave Client');
  });

  it('includes the run-type label for collection', () => {
    const out = renderHeader(makeMetadata({ runType: 'collection' }));
    expect(out).toContain('Collection Run');
  });

  it('includes the run-type label for flow', () => {
    const out = renderHeader(makeMetadata({ runType: 'flow' }));
    expect(out).toContain('Flow Run');
  });

  it('includes the run-type label for testsuite', () => {
    const out = renderHeader(makeMetadata({ runType: 'testsuite' }));
    expect(out).toContain('Test Suite Run');
  });

  it('renders the subject name', () => {
    const out = renderHeader(makeMetadata({ subjectName: 'Billing API' }));
    expect(out).toContain('Billing API');
  });

  it('renders the started timestamp in the meta strip', () => {
    const out = renderHeader(makeMetadata({ startedAt: new Date(2026, 4, 5, 14, 30, 22).getTime() }));
    expect(out).toContain('2026-05-05');
  });
});

// ---------------------------------------------------------------------------
// renderHeader — optional fields
// ---------------------------------------------------------------------------

describe('renderHeader — optional fields present', () => {
  const meta = makeMetadata({
    environmentName: 'Production',
    defaultAuthName: 'Bearer Token',
    concurrentCalls: 5,
    delayBetweenCalls: 200,
    completedAt: new Date(2026, 4, 5, 14, 31, 10).getTime(),
    totalElapsedMs: 48_000,
    itemPath: ['Accounts', 'CRUD'],
  });

  it('renders the environment name', () => {
    expect(renderHeader(meta)).toContain('Production');
  });

  it('renders the auth name', () => {
    expect(renderHeader(meta)).toContain('Bearer Token');
  });

  it('renders concurrency value', () => {
    expect(renderHeader(meta)).toContain('5');
  });

  it('renders delay formatted as duration', () => {
    expect(renderHeader(meta)).toContain('200ms');
  });

  it('renders the completed timestamp', () => {
    expect(renderHeader(meta)).toContain('2026-05-05');
  });

  it('renders total elapsed time', () => {
    // 48_000 ms → 48.00s
    expect(renderHeader(meta)).toContain('48.00s');
  });

  it('renders item path as breadcrumb', () => {
    const out = renderHeader(meta);
    expect(out).toContain('Accounts');
    expect(out).toContain('CRUD');
    // breadcrumb separator
    expect(out).toContain('/');
  });
});

describe('renderHeader — optional fields absent', () => {
  const meta = makeMetadata(); // no env, auth, concurrency, delay, completedAt, totalElapsedMs

  it('does not render an Environment meta item when environmentName is undefined', () => {
    expect(renderHeader(meta)).not.toContain('Environment');
  });

  it('does not render an Auth meta item when defaultAuthName is undefined', () => {
    expect(renderHeader(meta)).not.toContain('Auth:');
  });

  it('does not render Concurrency when concurrentCalls is undefined', () => {
    expect(renderHeader(meta)).not.toContain('Concurrency');
  });

  it('does not render Delay when delayBetweenCalls is undefined', () => {
    expect(renderHeader(meta)).not.toContain('Delay');
  });

  it('does not render Completed when completedAt is undefined', () => {
    expect(renderHeader(meta)).not.toContain('Completed');
  });

  it('does not render Total Time when totalElapsedMs is undefined', () => {
    expect(renderHeader(meta)).not.toContain('Total Time');
  });

  it('does not render item path when itemPath is undefined', () => {
    expect(renderHeader(meta)).not.toContain('wc-item-path');
  });
});

// ---------------------------------------------------------------------------
// renderHeader — XSS regression battery
// ---------------------------------------------------------------------------

describe('renderHeader — XSS regression', () => {
  const PAYLOAD = '<script>alert(1)</script>';

  it('escapes XSS in subjectName', () => {
    const out = renderHeader(makeMetadata({ subjectName: PAYLOAD }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in environmentName', () => {
    const out = renderHeader(makeMetadata({ environmentName: PAYLOAD }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in defaultAuthName', () => {
    const out = renderHeader(makeMetadata({ defaultAuthName: PAYLOAD }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in each itemPath segment', () => {
    const out = renderHeader(makeMetadata({ itemPath: [PAYLOAD, 'safe'] }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });
});
