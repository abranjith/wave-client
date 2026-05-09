/**
 * Flow Run HTML Report Builder
 *
 * Composes the foundation rendering blocks into a complete, self-contained
 * HTML report for a single flow run.
 *
 * The report is flat — items are rendered in the same order as `flow.nodes`
 * (which is the order passed in `nodes`). No flow graph / connector
 * visualization is included in v1; that is deferred per the plan.
 *
 * Security: `renderShell` escapes the `title` parameter; all dynamic values
 * inside `renderHeader`, `renderSummary`, and `renderRequestDetail` are passed
 * through `escapeHtml` / `escapeAttr` before HTML insertion. Callers must not
 * pre-escape values — pass raw strings and let the renderers handle escaping.
 */

import type { ReportMetadata, ReportSummary, ReportRequestNode } from '../types';
import { renderShell } from '../shell';
import { renderHeader } from '../blocks/header';
import { renderSummary } from '../blocks/summary';
import { renderRequestDetail } from '../blocks/requestDetail';
import { reconcileSummaryWithItems } from './summaryReconcile';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Input for building a flow run HTML report.
 *
 * All fields are read-only slices of the existing in-memory run state
 * assembled at click-time inside `FlowResultsPanel` — nothing is persisted.
 *
 * Note: `environmentName` and `defaultAuthName` in `metadata` are
 * intentionally `undefined` for v1 — the flow runner does not currently
 * surface the resolved environment / auth name to the results panel.
 * See TODO.md for the tracked follow-up item.
 *
 * Note: `concurrentCalls` and `delayBetweenCalls` are not applicable to flow
 * runs and must be omitted from `metadata` so that the report header does
 * not render empty rows.
 */
export interface FlowReportInput {
  /** Overall run metadata: flow name, timestamps, etc. */
  readonly metadata: ReportMetadata;
  /** Aggregate pass/fail/skip counts and optional average response time. */
  readonly summary: ReportSummary;
  /**
   * Per-node request results in `flow.nodes` order.
   * Already resolved (name, method, url, and request definition looked up
   * from the available collections) — the builder does not perform any
   * collection lookups.
   */
  readonly nodes: ReadonlyArray<ReportRequestNode>;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Builds a complete, self-contained HTML report for a flow run.
 *
 * Composes:
 *  1. Shell — `<!DOCTYPE html>` wrapper with embedded CSS + JS
 *  2. Header — run metadata (flow name, timestamps)
 *  3. Summary — tile grid of total / passed / failed / skipped / avg time
 *  4. Nodes — one expandable card per node in `flow.nodes` order
 *
 * The flow graph (nodes + connectors) is intentionally omitted from v1;
 * only a flat ordered list of node results is rendered.
 *
 * @param input - Report metadata, summary statistics, and per-node results.
 * @returns A complete `<!DOCTYPE html>` document string ready to be saved as
 *   a `.html` file and opened in any browser offline.
 */
export function buildFlowRunReport(input: FlowReportInput): string {
  const { metadata, summary, nodes } = input;

  const itemsHtml = nodes.map(renderRequestDetail).join('');
  const reconciledSummary = reconcileSummaryWithItems(summary, nodes);

  const body =
    renderHeader(metadata) +
    renderSummary(reconciledSummary) +
    `<section class="wc-items">${itemsHtml}</section>`;

  return renderShell({
    title: `Wave Flow Run — ${metadata.subjectName}`,
    body,
  });
}
