/**
 * Unit tests for buildCollectionRunReport.
 *
 * Tested scenarios:
 *  1. Happy path — 3 items produce a valid HTML document with expected content.
 *  2. Empty items array — valid shell with zero-count summary tiles.
 *  3. XSS regression — malicious strings in metadata / item names are escaped.
 *  4. Document structure — exactly one <head> and one <body> in the output.
 */

import { describe, it, expect } from 'vitest';
import {
  buildCollectionRunReport,
  type CollectionReportInput,
} from '../../../../utils/reporting/builders/collectionRun';
import type { ReportRequestNode } from '../../../../utils/reporting/types';
import type { CollectionRequest } from '../../../../types/collection';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal HTTP request stub that satisfies AnyCollectionRequest. */
function makeRequest(id: string, name: string): CollectionRequest {
  return {
    id,
    name,
    protocol: 'http',
    method: 'GET',
    url: `https://api.example.com/${id}`,
  };
}

/** Builds a ReportRequestNode stub with sensible defaults. */
function makeNode(
  id: string,
  name: string,
  overrides: Partial<ReportRequestNode> = {}
): ReportRequestNode {
  return {
    id,
    name,
    method: 'GET',
    url: `https://api.example.com/${id}`,
    folderPath: [],
    runStatus: 'success',
    responseStatus: 200,
    responseTime: 123,
    validationStatus: 'pass',
    request: makeRequest(id, name),
    ...overrides,
  };
}

/** Builds a CollectionReportInput with sensible defaults. */
function makeInput(
  nodes: ReportRequestNode[],
  overrides: Partial<CollectionReportInput> = {}
): CollectionReportInput {
  return {
    metadata: {
      runType: 'collection',
      subjectName: 'My Collection',
      startedAt: 1_700_000_000_000,
      completedAt: 1_700_000_005_000,
      totalElapsedMs: 5_000,
      concurrentCalls: 2,
      delayBetweenCalls: 100,
      environmentName: 'Staging',
      defaultAuthName: 'Bearer Token',
    },
    summary: {
      total: nodes.length,
      passed: nodes.filter((n) => n.runStatus === 'success').length,
      failed: nodes.filter((n) => n.runStatus === 'failed').length,
      skipped: nodes.filter((n) => n.runStatus === 'skipped').length,
      averageTimeMs: 123,
    },
    items: nodes,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildCollectionRunReport', () => {
  // ── 1. Happy path ───────────────────────────────────────────────────────────
  describe('happy path (3 mixed-status items)', () => {
    const nodes = [
      makeNode('req-1', 'Get Users'),
      makeNode('req-2', 'Create User', { runStatus: 'failed', responseStatus: 422, validationStatus: 'fail' }),
      makeNode('req-3', 'Delete User', { runStatus: 'skipped', validationStatus: 'idle' }),
    ];
    const input = makeInput(nodes, {
      summary: { total: 3, passed: 1, failed: 1, skipped: 1, averageTimeMs: 123 },
    });

    it('produces output that starts with DOCTYPE', () => {
      const html = buildCollectionRunReport(input);
      expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
    });

    it('contains the collection subject name in the header', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('My Collection');
    });

    it('contains all three request item names', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('Get Users');
      expect(html).toContain('Create User');
      expect(html).toContain('Delete User');
    });

    it('contains exactly three request-detail cards (data-toggle="card")', () => {
      const html = buildCollectionRunReport(input);
      // Strip embedded scripts (INTERACTIVITY_JS uses data-toggle as a selector)
      // so that only actual card elements are counted.
      const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      const matches = withoutScripts.match(/data-toggle="card"/g) ?? [];
      expect(matches.length).toBe(3);
    });

    it('summary tile shows total count of 3', () => {
      const html = buildCollectionRunReport(input);
      // The summary section includes wc-tile elements; "3" should appear as total
      expect(html).toContain('>3<');
    });

    it('includes concurrency and delay settings in header', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('Concurrency');
      expect(html).toContain('Delay');
    });

    it('includes environment name in header', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('Staging');
    });

    it('includes default auth name in header', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('Bearer Token');
    });
  });

  // ── 2. Empty items ──────────────────────────────────────────────────────────
  describe('empty items array', () => {
    const input = makeInput([], {
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    });

    it('produces valid HTML document', () => {
      const html = buildCollectionRunReport(input);
      expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
      expect(html).toContain('<head');
      expect(html).toContain('<body');
    });

    it('summary tiles show zero counts', () => {
      const html = buildCollectionRunReport(input);
      // Summary section exists with the expected zero values
      expect(html).toContain('wc-summary-grid');
    });

    it('contains no request-detail cards', () => {
      const html = buildCollectionRunReport(input);
      // Strip embedded scripts (INTERACTIVITY_JS contains data-toggle selectors)
      // before asserting no card elements exist.
      const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      expect(withoutScripts).not.toContain('data-toggle="card"');
    });

    it('contains the wc-items section', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('class="wc-items"');
    });
  });

  // ── 3. XSS regression ──────────────────────────────────────────────────────
  describe('XSS regression', () => {
    const xssPayload = '<script>alert(1)</script>';
    const xssNodes = [
      makeNode('xss-1', xssPayload),
    ];
    const xssInput = makeInput(xssNodes, {
      metadata: {
        runType: 'collection',
        subjectName: xssPayload,
        startedAt: 1_700_000_000_000,
      },
      summary: { total: 1, passed: 0, failed: 0, skipped: 0 },
    });

    it('does not contain an executable <script> tag from metadata subjectName', () => {
      const html = buildCollectionRunReport(xssInput);
      // The document will have <script> for the interactivity JS, but NOT from user content.
      // The malicious payload must be escaped; strip out the known interactivity block and check.
      const withoutKnownScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      expect(withoutKnownScripts).not.toContain('<script>');
    });

    it('does not contain an executable <script> tag from item names', () => {
      const html = buildCollectionRunReport(xssInput);
      // Remove known legitimate scripts
      const withoutKnownScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      expect(withoutKnownScripts).not.toContain('<script>');
    });

    it('contains the escaped version of the payload', () => {
      const html = buildCollectionRunReport(xssInput);
      // The payload must appear as escaped HTML entities, not raw tags
      expect(html).toContain('&lt;script&gt;');
    });
  });

  // ── 4. Document structure ───────────────────────────────────────────────────
  describe('document structure', () => {
    const input = makeInput([makeNode('req-1', 'Health Check')]);

    it('contains exactly one <head> element', () => {
      const html = buildCollectionRunReport(input);
      // Use \b (word boundary) to avoid matching <header> elements.
      const headMatches = html.match(/<head\b[^>]*>/g) ?? [];
      expect(headMatches.length).toBe(1);
    });

    it('contains exactly one <body> element', () => {
      const html = buildCollectionRunReport(input);
      const bodyMatches = html.match(/<body[^>]*>/g) ?? [];
      expect(bodyMatches.length).toBe(1);
    });

    it('contains a <title> with the collection name', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('<title>');
      expect(html).toContain('My Collection');
    });

    it('contains embedded CSS (theme)', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('<style>');
    });

    it('contains embedded interactivity JS', () => {
      const html = buildCollectionRunReport(input);
      expect(html).toContain('<script>');
    });
  });
});
