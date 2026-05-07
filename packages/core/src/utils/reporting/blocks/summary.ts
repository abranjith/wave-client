/**
 * Renders the run summary tile grid.
 *
 * Above the tiles, a lightweight search box is rendered for client-side
 * filtering of top-level report cards.
 *
 * The grid always contains five tiles:
 *   Total | Passed | Failed | Skipped | Avg Time
 *
 * The labels for Total, Passed, Failed, and Skipped are rendered as clickable
 * buttons (`data-summary-filter`) used by the report interactivity script.
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
</div>
<div class="wc-summary-grid">
  <div class="wc-tile">
    <button class="wc-tile-label wc-tile-label-btn" type="button" data-summary-filter="all" aria-pressed="false">Total</button>
    <span class="wc-tile-value wc-tile-value--total">${summary.total}</span>
  </div>
  <div class="wc-tile">
    <button class="wc-tile-label wc-tile-label-btn" type="button" data-summary-filter="passed" aria-pressed="false">Passed</button>
    <span class="wc-tile-value wc-tile-value--passed">${summary.passed}</span>
  </div>
  <div class="wc-tile">
    <button class="wc-tile-label wc-tile-label-btn" type="button" data-summary-filter="failed" aria-pressed="false">Failed</button>
    <span class="wc-tile-value wc-tile-value--failed">${summary.failed}</span>
  </div>
  <div class="wc-tile">
    <button class="wc-tile-label wc-tile-label-btn" type="button" data-summary-filter="skipped" aria-pressed="false">Skipped</button>
    <span class="wc-tile-value wc-tile-value--skipped">${summary.skipped}</span>
  </div>
  <div class="wc-tile">
    <span class="wc-tile-label">Avg Time</span>
    <span class="wc-tile-value wc-tile-value--time">${avgTime}</span>
  </div>
</div>`;
}
