/**
 * Unit tests for buildTestSuiteRunReport.
 *
 * Tested scenarios:
 *  1. Request item with a single execution result — one request card rendered.
 *  2. Request item with 3 data-driven test cases (mix pass/fail) — "Test Cases"
 *     section label and 3 cards rendered.
 *  3. Flow item with a flat node list (no test cases) — flat node cards rendered,
 *     FLOW badge present, no "Test Cases" label.
 *  4. Flow item with 2 data-driven test cases, each with nodes — nested
 *     collapsibles rendered with CASE badge and test case names.
 *  5. Item order is preserved from the input array.
 *  6. Empty items array → valid shell with placeholder text.
 *  7. XSS regression: suite name, item name, test case name, and node name
 *     containing `<script>` are escaped — no raw tag in output.
 */

import { describe, it, expect } from 'vitest';
import {
  buildTestSuiteRunReport,
  type TestSuiteReportInput,
  type TestSuiteFlowTestCase,
  type TestSuiteReportItem,
} from '../../../../utils/reporting/builders/testSuiteRun';
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
    runType: 'testsuite',
    subjectName: 'My Test Suite',
    startedAt: 1_700_000_000_000,
    completedAt: 1_700_000_010_000,
    totalElapsedMs: 10_000,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ReportSummary> = {}): ReportSummary {
  return {
    total: 3,
    passed: 2,
    failed: 1,
    skipped: 0,
    averageTimeMs: 130,
    ...overrides,
  };
}

function makeInput(
  items: ReadonlyArray<TestSuiteReportItem>,
  overrides: Partial<TestSuiteReportInput> = {}
): TestSuiteReportInput {
  return {
    metadata: makeMetadata(),
    summary: makeSummary(),
    items,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildTestSuiteRunReport', () => {
  // ── 1. Request item with single result ────────────────────────────────────
  describe('request item with single execution', () => {
    const node = makeNode('req-1', 'Get User', 'success', {
      responseStatus: 200,
      responseTime: 120,
    });
    const items: TestSuiteReportItem[] = [
      { kind: 'request', name: 'Get User Item', status: 'success', single: node },
    ];

    it('returns a valid <!DOCTYPE html> document', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toMatch(/^<!DOCTYPE html>/i);
    });

    it('includes the suite name in the document title', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Wave Test Suite — My Test Suite');
    });

    it('renders the item name in the item group header', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Get User Item');
    });

    it('renders the ITEM method badge for request items', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('ITEM');
    });

    it('renders the request node name', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Get User');
    });

    it('does not render a "Test Cases" section label', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).not.toContain('Test Cases');
    });
  });

  // ── 2. Request item with data-driven test cases ────────────────────────────
  describe('request item with 3 data-driven test cases', () => {
    const testCaseNodes: ReportRequestNode[] = [
      makeNode('tc-1', 'Valid User', 'success', { responseStatus: 200 }),
      makeNode('tc-2', 'Invalid Credentials', 'failed', {
        responseStatus: 401,
        validationStatus: 'fail',
      }),
      makeNode('tc-3', 'Missing Fields', 'failed', {
        responseStatus: 400,
        validationStatus: 'fail',
      }),
    ];
    const items: TestSuiteReportItem[] = [
      {
        kind: 'request',
        name: 'Login Request',
        status: 'failed',
        testCases: testCaseNodes,
      },
    ];

    it('renders the "Test Cases" section label', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Test Cases');
    });

    it('renders all 3 test case names', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Valid User');
      expect(html).toContain('Invalid Credentials');
      expect(html).toContain('Missing Fields');
    });

    it('renders the item name', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Login Request');
    });

    it('does not render a FLOW badge', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      // Check the rendered badge text, not the CSS class name which appears in the stylesheet
      expect(html).not.toContain('>FLOW<');
    });
  });

  // ── 3. Flow item with flat node list (no test cases) ──────────────────────
  describe('flow item with single execution nodes', () => {
    const nodes: ReportRequestNode[] = [
      makeNode('node-a', 'Get Token', 'success', { responseStatus: 200 }),
      makeNode('node-b', 'Create Resource', 'success', { responseStatus: 201 }),
    ];
    const items: TestSuiteReportItem[] = [
      { kind: 'flow', name: 'Auth Flow', status: 'success', nodes },
    ];

    it('renders the FLOW method badge', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('wc-method--FLOW');
      expect(html).toContain('>FLOW<');
    });

    it('renders all node names', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Get Token');
      expect(html).toContain('Create Resource');
    });

    it('renders the flow item name', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Auth Flow');
    });

    it('does not render a "Test Cases" section label', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).not.toContain('Test Cases');
    });

    it('does not render CASE badges', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      // Check the rendered badge text, not the CSS class name which appears in the stylesheet
      expect(html).not.toContain('>CASE<');
    });
  });

  // ── 4. Flow item with 2 data-driven test cases ────────────────────────────
  describe('flow item with 2 data-driven test cases', () => {
    const flowTestCases: TestSuiteFlowTestCase[] = [
      {
        id: 'tc-flow-1',
        name: 'Case: Admin User',
        status: 'success',
        nodes: [
          makeNode('flow-node-1', 'Authenticate Admin', 'success', { responseStatus: 200 }),
          makeNode('flow-node-2', 'Get Admin Resource', 'success', { responseStatus: 200 }),
        ],
      },
      {
        id: 'tc-flow-2',
        name: 'Case: Regular User',
        status: 'failed',
        nodes: [
          makeNode('flow-node-3', 'Authenticate User', 'success', { responseStatus: 200 }),
          makeNode('flow-node-4', 'Get Restricted Resource', 'failed', {
            responseStatus: 403,
            validationStatus: 'fail',
          }),
        ],
      },
    ];
    const items: TestSuiteReportItem[] = [
      { kind: 'flow', name: 'Auth + Resource Flow', status: 'failed', testCases: flowTestCases },
    ];

    it('renders the FLOW badge for the outer item', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('wc-method--FLOW');
    });

    it('renders CASE badges for each test case nested collapsible', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      // Match rendered badge text (not CSS definition which appears in the stylesheet)
      expect((html.match(/>CASE</g) ?? []).length).toBe(2);
    });

    it('renders the "Test Cases" section label', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Test Cases');
    });

    it('renders both test case names', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Case: Admin User');
      expect(html).toContain('Case: Regular User');
    });

    it('renders all 4 node names across both test cases', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      expect(html).toContain('Authenticate Admin');
      expect(html).toContain('Get Admin Resource');
      expect(html).toContain('Authenticate User');
      expect(html).toContain('Get Restricted Resource');
    });

    it('uses nested data-card-body for collapsible test cases', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      // Each test case card has its own wc-card-body with data-card-body
      // The outer suite item body also has data-card-body — total should be >= 3
      const matches = html.match(/data-card-body/g) ?? [];
      // outer suite item body + 2 test case card bodies + 4 node card bodies = >= 7
      expect(matches.length).toBeGreaterThanOrEqual(7);
    });
  });

  // ── 5. Item order is preserved ────────────────────────────────────────────
  describe('item order preservation', () => {
    const items: TestSuiteReportItem[] = [
      {
        kind: 'request',
        name: 'First Item',
        status: 'success',
        single: makeNode('n1', 'First Node', 'success'),
      },
      {
        kind: 'flow',
        name: 'Second Item',
        status: 'success',
        nodes: [makeNode('n2', 'Second Node', 'success')],
      },
      {
        kind: 'request',
        name: 'Third Item',
        status: 'failed',
        single: makeNode('n3', 'Third Node', 'failed'),
      },
    ];

    it('renders items in the input order', () => {
      const html = buildTestSuiteRunReport(makeInput(items));
      const firstIdx = html.indexOf('First Item');
      const secondIdx = html.indexOf('Second Item');
      const thirdIdx = html.indexOf('Third Item');
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(secondIdx).toBeLessThan(thirdIdx);
    });
  });

  // ── 6. Empty items array ──────────────────────────────────────────────────
  describe('empty items array', () => {
    it('returns a valid <!DOCTYPE html> document', () => {
      const html = buildTestSuiteRunReport(makeInput([], { summary: makeSummary({ total: 0, passed: 0, failed: 0, skipped: 0 }) }));
      expect(html).toMatch(/^<!DOCTYPE html>/i);
    });

    it('renders the summary tiles even when there are no items', () => {
      const html = buildTestSuiteRunReport(
        makeInput([], { summary: makeSummary({ total: 0, passed: 0, failed: 0, skipped: 0 }) })
      );
      // Summary grid rendered with zero values
      expect(html).toContain('wc-summary-grid');
    });

    it('renders the placeholder text', () => {
      const html = buildTestSuiteRunReport(makeInput([]));
      expect(html).toContain('No items in this test suite.');
    });
  });

  // ── 7. XSS regression ─────────────────────────────────────────────────────
  describe('XSS escaping', () => {
    const xss = '<script>alert("xss")</script>';

    it('escapes the suite name (subjectName)', () => {
      const html = buildTestSuiteRunReport(
        makeInput([], {
          metadata: makeMetadata({ subjectName: xss }),
        })
      );
      expect(html).not.toContain(xss);
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes the item name', () => {
      const html = buildTestSuiteRunReport(
        makeInput([
          {
            kind: 'request',
            name: xss,
            status: 'success',
            single: makeNode('n1', 'Node', 'success'),
          },
        ])
      );
      expect(html).not.toContain(xss);
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes a test case name in a request item', () => {
      const html = buildTestSuiteRunReport(
        makeInput([
          {
            kind: 'request',
            name: 'Safe Item',
            status: 'success',
            testCases: [makeNode('n1', xss, 'success')],
          },
        ])
      );
      expect(html).not.toContain(xss);
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes a flow test case name', () => {
      const html = buildTestSuiteRunReport(
        makeInput([
          {
            kind: 'flow',
            name: 'Safe Flow',
            status: 'success',
            testCases: [
              {
                id: 'tc-1',
                name: xss,
                status: 'success',
                nodes: [makeNode('n1', 'Node', 'success')],
              },
            ],
          },
        ])
      );
      expect(html).not.toContain(xss);
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes a node name inside a flow item', () => {
      const html = buildTestSuiteRunReport(
        makeInput([
          {
            kind: 'flow',
            name: 'Safe Flow',
            status: 'success',
            nodes: [makeNode('n1', xss, 'success')],
          },
        ])
      );
      expect(html).not.toContain(xss);
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
