/**
 * Renders the run summary tile grid.
 *
 * The grid always contains five tiles:
 *   Total | Passed | Failed | Skipped | Avg Time
 *
 * The "Avg Time" tile renders `'-'` when `averageTimeMs` is `undefined`
 * (e.g., when all requests were skipped or cancelled and no timing was
 * recorded).
 *
 * All values are numeric — no user-controlled strings are embedded — so no
 * HTML escaping is required for the tile values themselves.
 */

import { formatDuration } from '../format';
import type { ReportSummary } from '../types';

/**
 * Renders the summary tile grid as an HTML string.
 *
 * @param summary - Aggregate run counts and optional average time.
 * @returns An HTML `<div class="wc-summary-grid">` element string.
 */
export function renderSummary(summary: ReportSummary): string {
  const avgTime =
    summary.averageTimeMs !== undefined ? formatDuration(summary.averageTimeMs) : '-';

  return `<div class="wc-summary-grid">
  <div class="wc-tile">
    <span class="wc-tile-label">Total</span>
    <span class="wc-tile-value wc-tile-value--total">${summary.total}</span>
  </div>
  <div class="wc-tile">
    <span class="wc-tile-label">Passed</span>
    <span class="wc-tile-value wc-tile-value--passed">${summary.passed}</span>
  </div>
  <div class="wc-tile">
    <span class="wc-tile-label">Failed</span>
    <span class="wc-tile-value wc-tile-value--failed">${summary.failed}</span>
  </div>
  <div class="wc-tile">
    <span class="wc-tile-label">Skipped</span>
    <span class="wc-tile-value wc-tile-value--skipped">${summary.skipped}</span>
  </div>
  <div class="wc-tile">
    <span class="wc-tile-label">Avg Time</span>
    <span class="wc-tile-value wc-tile-value--time">${avgTime}</span>
  </div>
</div>`;
}
