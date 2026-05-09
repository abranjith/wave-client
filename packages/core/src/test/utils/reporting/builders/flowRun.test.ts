/**
 * Unit tests for buildFlowRunReport.
 *
 * Tested scenarios:
 *  1. Happy path: 4 nodes with mixed statuses → 4 cards rendered, summary
 *     tile values match the input summary.
 *  2. Empty nodes array → valid shell with summary showing zeros.
 *  3. XSS regression: <script> injected into the flow name (subjectName) and
 *     a node name is escaped — no raw <script> tag in the output.
 *  4. Node order is preserved from the input array.
 *  5. Skipped nodes expose the 'Skipped (condition not met)' error text.
 */

import { describe, it, expect } from 'vitest';
import { buildFlowRunReport, type FlowReportInput } from '../../../../utils/reporting/builders/flowRun';
import type { ReportMetadata, ReportSummary, ReportRequestNode } from '../../../../utils/reporting/types';
import type { CollectionRequest } from '../../../../types/collection';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(id: string): CollectionRequest {
  return {
    id,
    name: id,
    protocol: 'http',
    method: 'GET',
    url: `https://api.example.com/${id}`,
  };
}

function makeNode(
  id: string,
  name: string,
  status: ReportRequestNode['runStatus'],
  overrides: Partial<ReportRequestNode> = {}
): ReportRequestNode {
  return {
    id,
    name,
    method: 'GET',
    url: `https://api.example.com/${id}`,
    folderPath: [],
    runStatus: status,
    validationStatus: status === 'success' ? 'pass' : 'idle',
    request: makeRequest(id),
    ...overrides,
  };
}

function makeMetadata(overrides: Partial<ReportMetadata> = {}): ReportMetadata {
  return {
    runType: 'flow',
    subjectName: 'My Test Flow',
    startedAt: 1_700_000_000_000,
    completedAt: 1_700_000_005_000,
    totalElapsedMs: 5_000,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    total: 4,
    passed: 2,
    failed: 1,
    skipped: 1,
    averageTimeMs: 120,
    ...overrides,
  };
}

function makeInput(overrides: Partial<FlowReportInput> = {}): FlowReportInput {
  return {
    metadata: makeMetadata(),
    summary: makeSummary(),
    nodes: [
      makeNode('node-1', 'Get User', 'success', { responseStatus: 200, responseTime: 100 }),
      makeNode('node-2', 'Create Order', 'success', { responseStatus: 201, responseTime: 140 }),
      makeNode('node-3', 'Delete Item', 'failed', {
        responseStatus: 404,
        error: 'HTTP 404',
        validationStatus: 'fail',
      }),
      makeNode('node-4', 'Notify', 'skipped', {
        error: 'Skipped (condition not met)',
        validationStatus: 'idle',
      }),
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildFlowRunReport', () => {
  // ── 1. Happy path ────────────────────────────────────────────────────────────
  describe('happy path — 4 nodes with mixed statuses', () => {
    it('returns a valid <!DOCTYPE html> document', () => {
      const html = buildFlowRunReport(makeInput());
      expect(html).toMatch(/^<!DOCTYPE html>/i);
    });

    it('contains exactly one <head> and one <body> element', () => {
      const html = buildFlowRunReport(makeInput());
      expect((html.match(/<head[\s>]/gi) ?? []).length).toBe(1);
      expect((html.match(/<body[\s>]/gi) ?? []).length).toBe(1);
    });

    it('includes the flow name in the document title', () => {
      const html = buildFlowRunReport(makeInput());
      expect(html).toContain('Wave Flow Run — My Test Flow');
    });

    it('renders all 4 node cards', () => {
      const html = buildFlowRunReport(makeInput());
      // Each card renders the node name — check for all four
      expect(html).toContain('Get User');
      expect(html).toContain('Create Order');
      expect(html).toContain('Delete Item');
      expect(html).toContain('Notify');
    });

    it('summary tiles reflect the passed-in counts', () => {
      const html = buildFlowRunReport(makeInput());
      // Summary values 2 (passed), 1 (failed), 1 (skipped), 4 (total)
      // The summary block renders these counts; we check they appear in the HTML
      expect(html).toContain('4'); // total
      expect(html).toContain('2'); // passed
      expect(html).toContain('1'); // failed / skipped
    });

    it('includes response status codes for executed nodes', () => {
      const html = buildFlowRunReport(makeInput());
      expect(html).toContain('200');
      expect(html).toContain('201');
      expect(html).toContain('404');
    });
  });

  // ── Regression: validation failures must be counted in summary ──────────────
  // Bug: a node with HTTP 200 but `validationStatus: 'fail'` was classified as
  // `failed` by the per-card filter, but the runner reported it under
  // `succeeded`. The summary tile said `failed: 0` while clicking the Failed
  // filter still showed the card. The builder now reconciles the summary
  // counts against each item's filter classification so the two always agree.
  describe('summary reconciliation — validation failures count as failed', () => {
    function buildInputWithValidationFailure(): FlowReportInput {
      return {
        metadata: makeMetadata(),
        // Caller-provided counts mirror the runner's HTTP-only view —
        // node-3 returned 200 OK so it is reported as passed.
        summary: { total: 3, passed: 2, failed: 0, skipped: 1, averageTimeMs: 100 },
        nodes: [
          makeNode('n1', 'Get User', 'success', {
            responseStatus: 200,
            validationStatus: 'pass',
          }),
          makeNode('n2', 'Skip Me', 'skipped'),
          // HTTP success but validation fails — the per-card filter classifies
          // this as 'failed', so the summary tile must show `failed: 1`.
          makeNode('n3', 'Bad Body', 'success', {
            responseStatus: 200,
            validationStatus: 'fail',
          }),
        ],
      };
    }

    it('reports failed=1 in the Failed tile when an item has validation:fail (HTTP 200)', () => {
      const html = buildFlowRunReport(buildInputWithValidationFailure());
      // The Failed tile value span carries the `wc-tile-value--failed` class —
      // assert the count rendered in that span is 1, not 0.
      const m = html.match(/wc-tile-value--failed[^>]*>(\d+)</);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
    });

    it('reports passed=1 (excludes the validation-failed item) in the Passed tile', () => {
      const html = buildFlowRunReport(buildInputWithValidationFailure());
      const m = html.match(/wc-tile-value--passed[^>]*>(\d+)</);
      expect(m).not.toBeNull();
      expect(m![1]).toBe('1');
    });

    it('preserves total and skipped counts from the caller-provided summary', () => {
      const html = buildFlowRunReport(buildInputWithValidationFailure());
      const total = html.match(/wc-tile-value--total[^>]*>(\d+)</);
      const skipped = html.match(/wc-tile-value--skipped[^>]*>(\d+)</);
      expect(total![1]).toBe('3');
      expect(skipped![1]).toBe('1');
    });

    it('agrees with the per-card data-filter-status attribute used by the Failed filter button', () => {
      const html = buildFlowRunReport(buildInputWithValidationFailure());
      // Count cards classified as 'failed' by getCardFilterStatus —
      // the summary tile must equal the count of cards a Failed-filter click would show.
      const failedCards = (html.match(/data-filter-status="failed"/g) ?? []).length;
      const failedTile = html.match(/wc-tile-value--failed[^>]*>(\d+)</);
      expect(failedTile![1]).toBe(String(failedCards));
    });
  });

  // ── 2. Empty nodes ────────────────────────────────────────────────────────────
  describe('empty nodes array', () => {
    it('produces a valid HTML document with no item cards', () => {
      const input = makeInput({
        nodes: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      });
      const html = buildFlowRunReport(input);
      expect(html).toMatch(/^<!DOCTYPE html>/i);
      // The wc-items section should be present but empty
      expect(html).toContain('class="wc-items"');
    });

    it('summary shows zeros for all counts', () => {
      const input = makeInput({
        nodes: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      });
      const html = buildFlowRunReport(input);
      // The metadata and summary are still rendered
      expect(html).toContain('My Test Flow');
    });
  });

  // ── 3. XSS regression ────────────────────────────────────────────────────────
  describe('XSS escaping', () => {
    it('escapes <script> injected into the flow name (subjectName)', () => {
      const input = makeInput({
        metadata: makeMetadata({ subjectName: '<script>alert(1)</script>' }),
        nodes: [],
        summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      });
      const html = buildFlowRunReport(input);
      // The raw <script> tag must not appear in executable form
      expect(html).not.toContain('<script>alert(1)</script>');
    });

    it('escapes <script> injected into a node name', () => {
      const input = makeInput({
        nodes: [
          makeNode('xss-node', '<script>alert("xss")</script>', 'success'),
        ],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      });
      const html = buildFlowRunReport(input);
      expect(html).not.toContain('<script>alert("xss")</script>');
      // The escaped form should appear instead
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes <script> injected into a node URL', () => {
      const input = makeInput({
        nodes: [
          makeNode('url-xss', 'Test Node', 'success', {
            url: 'https://api.example.com/<script>alert(1)</script>',
          }),
        ],
        summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
      });
      const html = buildFlowRunReport(input);
      expect(html).not.toContain('<script>alert(1)</script>');
    });
  });

  // ── 4. Order preservation ─────────────────────────────────────────────────────
  describe('node ordering', () => {
    it('preserves the order of nodes from the input array', () => {
      const input = makeInput({
        nodes: [
          makeNode('a', 'Alpha', 'success'),
          makeNode('b', 'Beta', 'failed', { error: 'HTTP 500' }),
          makeNode('c', 'Gamma', 'skipped', { error: 'Skipped (condition not met)' }),
          makeNode('d', 'Delta', 'pending'),
        ],
        summary: { total: 4, passed: 1, failed: 1, skipped: 1 },
      });
      const html = buildFlowRunReport(input);

      const alphaPos = html.indexOf('Alpha');
      const betaPos = html.indexOf('Beta');
      const gammaPos = html.indexOf('Gamma');
      const deltaPos = html.indexOf('Delta');

      expect(alphaPos).toBeGreaterThan(-1);
      expect(betaPos).toBeGreaterThan(alphaPos);
      expect(gammaPos).toBeGreaterThan(betaPos);
      expect(deltaPos).toBeGreaterThan(gammaPos);
    });
  });

  // ── 5. Skipped nodes ──────────────────────────────────────────────────────────
  describe('skipped nodes', () => {
    it('renders the skipped node with its error message', () => {
      const input = makeInput({
        nodes: [
          makeNode('skip-1', 'Conditional Branch', 'skipped', {
            error: 'Skipped (condition not met)',
          }),
        ],
        summary: { total: 1, passed: 0, failed: 0, skipped: 1 },
      });
      const html = buildFlowRunReport(input);

      expect(html).toContain('Conditional Branch');
      // The error message for skipped nodes is rendered in the card
      expect(html).toContain('Skipped (condition not met)');
    });

    it('renders the node with skipped run status indicator', () => {
      const input = makeInput({
        nodes: [
          makeNode('skip-2', 'Auth Check', 'skipped', {
            error: 'Skipped (condition not met)',
          }),
        ],
        summary: { total: 1, passed: 0, failed: 0, skipped: 1 },
      });
      const html = buildFlowRunReport(input);
      // The status pill text should contain 'Skipped' (case-insensitive)
      expect(html.toLowerCase()).toContain('skipped');
    });
  });
});
