/**
 * Renders the report header block.
 *
 * The header contains:
 * - The "Wave Client" wordmark
 * - A run-type label (Collection Run / Flow Run / Test Suite Run)
 * - The subject name (collection / flow / test-suite display name)
 * - An optional item path breadcrumb (for scoped collection runs)
 * - A metadata strip with contextual details (environment, auth, concurrency,
 *   delay, timestamps, total elapsed) — fields are omitted when `undefined`
 *
 * **Security**: every dynamic value is routed through `escapeHtml` before
 * embedding. No raw user data reaches the output string.
 */

import { escapeHtml } from '../escape';
import { formatTimestamp, formatDuration } from '../format';
import type { ReportMetadata } from '../types';

/** Human-readable labels for the run type discriminant. */
const RUN_TYPE_LABELS: Record<string, string> = {
  collection: 'Collection Run',
  flow: 'Flow Run',
  testsuite: 'Test Suite Run',
};

/**
 * Renders the full report header as an HTML string.
 *
 * @param metadata - Metadata describing the run subject and settings.
 * @returns An HTML `<header>` element string.
 */
export function renderHeader(metadata: ReportMetadata): string {
  const runTypeLabel = RUN_TYPE_LABELS[metadata.runType] ?? 'Run';

  const itemPathHtml =
    metadata.itemPath && metadata.itemPath.length > 0
      ? `<div class="wc-item-path">${metadata.itemPath.map((p) => escapeHtml(p)).join(' / ')}</div>`
      : '';

  const metaItems: string[] = [];

  if (metadata.environmentName !== undefined) {
    metaItems.push(metaItem('Environment', escapeHtml(metadata.environmentName)));
  }
  if (metadata.defaultAuthName !== undefined) {
    metaItems.push(metaItem('Auth', escapeHtml(metadata.defaultAuthName)));
  }
  if (metadata.concurrentCalls !== undefined) {
    metaItems.push(metaItem('Concurrency', String(metadata.concurrentCalls)));
  }
  if (metadata.delayBetweenCalls !== undefined) {
    metaItems.push(metaItem('Delay', escapeHtml(formatDuration(metadata.delayBetweenCalls))));
  }

  metaItems.push(metaItem('Started', escapeHtml(formatTimestamp(metadata.startedAt))));

  if (metadata.completedAt !== undefined) {
    metaItems.push(metaItem('Completed', escapeHtml(formatTimestamp(metadata.completedAt))));
  }
  if (metadata.totalElapsedMs !== undefined) {
    metaItems.push(metaItem('Total Time', escapeHtml(formatDuration(metadata.totalElapsedMs))));
  }

  return `<header class="wc-report-header">
  <div class="wc-wordmark">Wave Client</div>
  <div class="wc-run-type-label">${escapeHtml(runTypeLabel)}</div>
  <div class="wc-subject-name">${escapeHtml(metadata.subjectName)}</div>
  ${itemPathHtml}
  <div class="wc-meta-strip">${metaItems.join('')}</div>
</header>`;
}

/** Renders a single `<span>` pair for the metadata strip. */
function metaItem(label: string, value: string): string {
  return `<span class="wc-meta-item"><span class="wc-meta-label">${escapeHtml(label)}:</span> <span class="wc-meta-value">${value}</span></span>`;
}
