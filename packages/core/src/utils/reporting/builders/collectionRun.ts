/**
 * Collection Run HTML Report Builder
 *
 * Composes the foundation rendering blocks into a complete, self-contained
 * HTML report for a single collection run.
 *
 * The report is flat — items are rendered in the same order they appear in
 * `displayRequests` (the runner result order). Folder grouping is surfaced in
 * each request-detail card via its `folderPath` field, matching the UI card
 * layout of `RunRequestCard`.
 *
 * Security: `renderShell` escapes the `title` parameter; all dynamic values
 * inside `renderHeader`, `renderSummary`, and `renderRequestDetail` are passed
 * through `escapeHtml` / `escapeAttr` before HTML insertion. Callers must not
 * pre-escape values — pass raw strings and let the renderers handle escaping.
 */

import type { ReportMetadata } from '../types';
import type { ReportSummary } from '../types';
import type { ReportRequestNode } from '../types';
import { renderShell } from '../shell';
import { renderHeader } from '../blocks/header';
import { renderSummary } from '../blocks/summary';
import { renderRequestDetail } from '../blocks/requestDetail';
import { reconcileSummaryWithItems } from './summaryReconcile';

// ============================================================================
// Public Types
// ============================================================================

/**
 * Input for building a collection run HTML report.
 *
 * All fields are read-only slices of the existing in-memory run state
 * assembled at click-time inside `RunCollectionModal` — nothing is persisted.
 */
export interface CollectionReportInput {
  /** Overall run metadata: collection name, timestamps, settings, etc. */
  readonly metadata: ReportMetadata;
  /** Aggregate pass/fail/skip counts and average response time. */
  readonly summary: ReportSummary;
  /**
   * Per-request nodes in execution order.
   * Only requests the user had selected at export time are included;
   * filtering is the caller's responsibility.
   */
  readonly items: ReadonlyArray<ReportRequestNode>;
}

// ============================================================================
// Builder
// ============================================================================

/**
 * Builds a complete, self-contained HTML report for a collection run.
 *
 * Composes:
 *  1. Shell — `<!DOCTYPE html>` wrapper with embedded CSS + JS
 *  2. Header — run metadata (name, timestamps, env, auth, settings)
 *  3. Summary — tile grid of total / passed / failed / skipped / avg time
 *  4. Items — one expandable card per request in execution order
 *
 * @param input - Report metadata, summary statistics, and per-request nodes.
 * @returns A complete `<!DOCTYPE html>` document string ready to be saved as
 *   a `.html` file and opened in any browser offline.
 */
export function buildCollectionRunReport(input: CollectionReportInput): string {
  const { metadata, summary, items } = input;

  const itemsHtml = items.map(renderRequestDetail).join('');
  const reconciledSummary = reconcileSummaryWithItems(summary, items);

  const body =
    renderHeader(metadata) +
    renderSummary(reconciledSummary) +
    `<section class="wc-items">${itemsHtml}</section>`;

  return renderShell({
    title: `Wave Collection Run — ${metadata.subjectName}`,
    body,
  });
}
