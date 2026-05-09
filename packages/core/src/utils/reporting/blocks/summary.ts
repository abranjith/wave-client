/**
 * Renders the run summary tile grid.
 *
 * Above the tiles, a search box and bulk Expand/Collapse All controls are
 * rendered for client-side filtering and toggling of report cards.
 *
 * The grid always contains five tiles:
 *   Total | Passed | Failed | Skipped | Avg Time
 *
 * The Total, Passed, Failed, and Skipped tiles are themselves rendered as
 * clickable buttons (`data-summary-filter`) so the user can click anywhere on
 * the tile (not just the label text) to filter the list.
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

  return `<div class="wc-summary-controls">
  <input
    id="wc-report-search"
    class="wc-search-input"
    type="search"
    placeholder="Search requests by name, method, URL, or folder"
    data-report-search
  />
  <div class="wc-summary-actions">
    <button type="button" class="wc-action-btn" data-bulk-toggle="expand" title="Expand all" aria-label="Expand all">Expand All</button>
    <button type="button" class="wc-action-btn" data-bulk-toggle="collapse" title="Collapse all" aria-label="Collapse all">Collapse All</button>
  </div>
</div>
<div class="wc-summary-grid">
  <button type="button" class="wc-tile wc-tile-btn" data-summary-filter="all" aria-pressed="false">
    <span class="wc-tile-label">Total</span>
    <span class="wc-tile-value wc-tile-value--total">${summary.total}</span>
  </button>
  <button type="button" class="wc-tile wc-tile-btn" data-summary-filter="passed" aria-pressed="false">
    <span class="wc-tile-label">Passed</span>
    <span class="wc-tile-value wc-tile-value--passed">${summary.passed}</span>
  </button>
  <button type="button" class="wc-tile wc-tile-btn" data-summary-filter="failed" aria-pressed="false">
    <span class="wc-tile-label">Failed</span>
    <span class="wc-tile-value wc-tile-value--failed">${summary.failed}</span>
  </button>
  <button type="button" class="wc-tile wc-tile-btn" data-summary-filter="skipped" aria-pressed="false">
    <span class="wc-tile-label">Skipped</span>
    <span class="wc-tile-value wc-tile-value--skipped">${summary.skipped}</span>
  </button>
  <div class="wc-tile">
    <span class="wc-tile-label">Avg Time</span>
    <span class="wc-tile-value wc-tile-value--time">${avgTime}</span>
  </div>
</div>`;
}
