/**
 * Reconciles `ReportSummary` counts against the actual rendered items so the
 * summary tiles always match the per-card filter classification.
 *
 * Background: callers compute `summary.passed/failed/skipped` from the
 * runner's progress counters, which only track HTTP-level outcomes. A request
 * that returns 200 OK but fails validation is recorded as a successful run
 * by the runner, but `getCardFilterStatus` correctly classifies it as
 * `'failed'` for the per-card filter pill. Without reconciliation the summary
 * tile would say `failed: 0` while clicking the Failed filter still shows
 * cards — a confusing mismatch the user reported.
 *
 * Reconciling here keeps `total` and `averageTimeMs` from the caller (the
 * runner is authoritative for those) and overrides only the per-status
 * counts using the same classification the per-card filter uses.
 */

import type { ReportSummary, ReportRequestNode } from '../types';
import { getCardFilterStatus } from '../blocks/requestDetail';

/**
 * Returns a `ReportSummary` whose `passed/failed/skipped` counts agree with
 * the classification the per-card filter applies to each item.
 *
 * `total` and `averageTimeMs` are preserved from the input summary because
 * the runner is the source of truth for total request count and aggregate
 * timing (items rendered may be a filtered subset, and timing is not
 * recoverable from a node alone).
 */
export function reconcileSummaryWithItems(
  summary: ReportSummary,
  items: ReadonlyArray<ReportRequestNode>,
): ReportSummary {
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const node of items) {
    const status = getCardFilterStatus(node);
    if (status === 'passed') { passed += 1; }
    else if (status === 'failed') { failed += 1; }
    else if (status === 'skipped') { skipped += 1; }
  }

  return {
    total: summary.total,
    passed,
    failed,
    skipped,
    averageTimeMs: summary.averageTimeMs,
  };
}
