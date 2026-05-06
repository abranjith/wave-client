/**
 * Test Suite Run HTML Report Builder
 *
 * Composes the foundation rendering blocks into a complete, self-contained
 * HTML report for a single test suite run.
 *
 * The report renders one collapsible item group per `TestSuiteReportItem`.
 * Four nested layouts are supported:
 *   (a) request item + single execution  → one request detail card
 *   (b) request item + test cases        → "Test Cases" label + one card per case
 *   (c) flow item + single execution     → flat list of node detail cards
 *   (d) flow item + test cases           → nested collapsible per case, each
 *       with its own node detail cards inside
 *
 * All collapsible behaviour reuses the `data-toggle="card"` / `data-card-body`
 * convention from `INTERACTIVITY_JS` — no new JavaScript is added.
 *
 * Security: `renderShell` escapes the `title` parameter; all dynamic values
 * inside `renderHeader`, `renderSummary`, and `renderRequestDetail` are passed
 * through `escapeHtml` / `escapeAttr` before HTML insertion. Callers must not
 * pre-escape values — pass raw strings and let the renderers handle escaping.
 */

import type { ReportMetadata, ReportSummary, ReportRequestNode, RunStatus } from '../types';
import { renderShell } from '../shell';
import { renderHeader } from '../blocks/header';
import { renderSummary } from '../blocks/summary';
import { renderRequestDetail } from '../blocks/requestDetail';
import { escapeHtml, escapeAttr } from '../escape';

// ============================================================================
// Public Types
// ============================================================================

/**
 * A resolved test case for a flow test item.
 *
 * The builder receives pre-resolved node data — no collection lookups are
 * performed inside the builder. Resolution is the caller's responsibility
 * (performed in the component's `handleExport` callback).
 */
export interface TestSuiteFlowTestCase {
  /** Test case ID (from `FlowTestCaseResult.testCaseId`). */
  readonly id: string;
  /** Display name (from `FlowTestCaseResult.testCaseName`). */
  readonly name: string;
  /** Aggregated run status for this test case. */
  readonly status: RunStatus;
  /** Pre-resolved node results in `flow.nodes` order. */
  readonly nodes: ReadonlyArray<ReportRequestNode>;
}

/**
 * A single item in the test suite report.
 *
 * Discriminated by `kind`:
 * - `'request'`: a collection request item. Use `single` for a single
 *   execution or `testCases` for data-driven testing.
 * - `'flow'`: a flow item. Use `nodes` for a single execution or `testCases`
 *   for data-driven testing.
 *
 * `single` and `testCases` are mutually exclusive for request items.
 * `nodes` and `testCases` are mutually exclusive for flow items.
 */
export type TestSuiteReportItem =
  | {
      readonly kind: 'request';
      /** Display name of the test item. */
      readonly name: string;
      /** Aggregated run status for this item. */
      readonly status: RunStatus;
      /** Single execution result — present when no test cases are defined. */
      readonly single?: ReportRequestNode;
      /** Data-driven test case results — present when test cases are defined. */
      readonly testCases?: ReadonlyArray<ReportRequestNode>;
    }
  | {
      readonly kind: 'flow';
      /** Display name of the test item. */
      readonly name: string;
      /** Aggregated run status for this item. */
      readonly status: RunStatus;
      /** Single execution node results — present when no test cases are defined. */
      readonly nodes?: ReadonlyArray<ReportRequestNode>;
      /** Data-driven test case results — present when test cases are defined. */
      readonly testCases?: ReadonlyArray<TestSuiteFlowTestCase>;
    };

/**
 * Input for building a test suite run HTML report.
 *
 * All fields are read-only slices of the existing in-memory run state
 * assembled at click-time inside `TestResultsPanel` — nothing is persisted.
 *
 * Note: `environmentName` and `defaultAuthName` in `metadata` are
 * intentionally `undefined` for v1 — the test suite runner does not currently
 * surface the resolved environment / auth name to the results panel.
 *
 * Note: `concurrentCalls` and `delayBetweenCalls` are not applicable to test
 * suite runs and must be omitted from `metadata` so that the report header
 * does not render empty rows.
 */
export interface TestSuiteReportInput {
  /** Overall run metadata: suite name, timestamps, etc. */
  readonly metadata: ReportMetadata;
  /** Aggregate pass/fail/skip counts and optional average response time. */
  readonly summary: ReportSummary;
  /**
   * Per-item results in the order the caller provides (typically the
   * enabled items sorted by `order`). Only enabled items should be included;
   * filtering is the caller's responsibility.
   */
  readonly items: ReadonlyArray<TestSuiteReportItem>;
}

// ============================================================================
// Internal renderers
// ============================================================================

/** Renders a run-status pill. */
function renderStatusPill(status: RunStatus): string {
  return `<span class="wc-status wc-status--${escapeAttr(status)}">${escapeHtml(status)}</span>`;
}

/** Renders the FLOW type badge used in place of an HTTP method badge. */
function renderFlowBadge(): string {
  return `<span class="wc-method wc-method--FLOW">FLOW</span>`;
}

/** Renders the CASE badge used in nested flow test case headers. */
function renderCaseBadge(): string {
  return `<span class="wc-method wc-method--CASE">CASE</span>`;
}

/**
 * Renders body content for a request item with a single execution result.
 * Layout (a): single `renderRequestDetail` card.
 */
function renderRequestSingleBody(node: ReportRequestNode): string {
  return renderRequestDetail(node);
}

/**
 * Renders body content for a request item with data-driven test cases.
 * Layout (b): section label followed by one `renderRequestDetail` per case.
 */
function renderRequestTestCasesBody(testCases: ReadonlyArray<ReportRequestNode>): string {
  const cardsHtml = testCases.map(renderRequestDetail).join('');
  return `<div class="wc-section-title">Test Cases</div>${cardsHtml}`;
}

/**
 * Renders body content for a flow item with a single execution.
 * Layout (c): flat list of `renderRequestDetail` cards for each node.
 */
function renderFlowNodesBody(nodes: ReadonlyArray<ReportRequestNode>): string {
  return nodes.map(renderRequestDetail).join('');
}

/**
 * Renders a single nested collapsible card for one flow test case.
 * Uses the existing `wc-card` / `data-toggle="card"` / `data-card-body`
 * pattern so the INTERACTIVITY_JS handles expand/collapse without any new JS.
 */
function renderFlowTestCaseCard(tc: TestSuiteFlowTestCase): string {
  const nodesHtml = tc.nodes.map(renderRequestDetail).join('');
  return `<div class="wc-card">
  <div class="wc-card-header" data-toggle="card">
    ${renderCaseBadge()}
    <span class="wc-card-name">${escapeHtml(tc.name)}</span>
    ${renderStatusPill(tc.status)}
  </div>
  <div class="wc-card-body" data-card-body hidden>
    ${nodesHtml || `<p class="wc-placeholder">No node results.</p>`}
  </div>
</div>`;
}

/**
 * Renders body content for a flow item with data-driven test cases.
 * Layout (d): section label + one nested collapsible per test case,
 * each containing the test case's resolved node results.
 */
function renderFlowTestCasesBody(testCases: ReadonlyArray<TestSuiteFlowTestCase>): string {
  const caseCardsHtml = testCases.map(renderFlowTestCaseCard).join('');
  return `<div class="wc-section-title">Test Cases</div>${caseCardsHtml}`;
}

/**
 * Determines the body HTML for an item based on its kind and content.
 * Falls back to a placeholder when no results are available.
 */
function renderItemBody(item: TestSuiteReportItem): string {
  if (item.kind === 'request') {
    if (item.testCases && item.testCases.length > 0) {
      return renderRequestTestCasesBody(item.testCases);
    }
    if (item.single) {
      return renderRequestSingleBody(item.single);
    }
    return `<p class="wc-placeholder">No results available.</p>`;
  }

  // kind === 'flow'
  if (item.testCases && item.testCases.length > 0) {
    return renderFlowTestCasesBody(item.testCases);
  }
  if (item.nodes && item.nodes.length > 0) {
    return renderFlowNodesBody(item.nodes);
  }
  return `<p class="wc-placeholder">No results available.</p>`;
}

/**
 * Renders one outer collapsible item group for the test suite.
 *
 * The outer `div.wc-suite-item` contains:
 *  - A header (`wc-suite-item-header`) with `data-toggle="card"` that
 *    toggles the body via the INTERACTIVITY_JS card-toggle handler.
 *  - A body (`wc-suite-item-body`) with `data-card-body hidden` that
 *    holds the layout-specific inner content.
 *
 * Nested cards inside the body reuse `wc-card` / `wc-card-header` so that
 * `querySelector('[data-card-body]')` correctly resolves each toggle to its
 * own body (the first `[data-card-body]` in its parent's subtree).
 */
function renderItem(item: TestSuiteReportItem): string {
  const badge =
    item.kind === 'flow' ? renderFlowBadge() : `<span class="wc-method wc-method--OTHER">ITEM</span>`;
  const body = renderItemBody(item);

  return `<div class="wc-suite-item">
  <div class="wc-suite-item-header" data-toggle="card">
    ${badge}
    <span class="wc-suite-item-name">${escapeHtml(item.name)}</span>
    ${renderStatusPill(item.status)}
  </div>
  <div class="wc-suite-item-body" data-card-body hidden>
    ${body}
  </div>
</div>`;
}

function renderItems(items: ReadonlyArray<TestSuiteReportItem>): string {
  if (items.length === 0) {
    return `<p class="wc-placeholder">No items in this test suite.</p>`;
  }
  return `<section class="wc-items">${items.map(renderItem).join('')}</section>`;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Builds a complete, self-contained HTML report for a test suite run.
 *
 * Composes:
 *  1. Shell — `<!DOCTYPE html>` wrapper with embedded CSS + JS
 *  2. Header — run metadata (suite name, timestamps)
 *  3. Summary — tile grid of total / passed / failed / skipped / avg time
 *  4. Items — one collapsible item group per enabled test suite item, with
 *     nested layouts for single requests, data-driven request test cases,
 *     single flow executions, and data-driven flow test cases.
 *
 * @param input - Report metadata, summary statistics, and per-item results.
 * @returns A complete `<!DOCTYPE html>` document string ready to be saved as
 *   a `.html` file and opened in any browser offline.
 */
export function buildTestSuiteRunReport(input: TestSuiteReportInput): string {
  const { metadata, summary, items } = input;

  const body = renderHeader(metadata) + renderSummary(summary) + renderItems(items);

  return renderShell({
    title: `Wave Test Suite — ${metadata.subjectName}`,
    body,
  });
}
