/**
 * Format helpers for Wave Client HTML report builders.
 *
 * All functions are pure — they accept fully-resolved inputs and return
 * strings.  They never throw on user input; invalid or missing values fall
 * back to safe defaults.
 *
 * Note on locale: `formatTimestamp` formats in **local** (device) time.
 * Reports are generated client-side where the local timezone is the
 * meaningful one for the user.
 */

// ============================================================================
// formatTimestamp
// ============================================================================

/**
 * Formats an epoch-millisecond timestamp as `YYYY-MM-DD HH:MM:SS` in the
 * user's **local** timezone.
 *
 * Returns `'—'` when `epochMs` is `NaN` or not a finite number.
 *
 * @param epochMs - Milliseconds since Unix epoch.
 * @returns A human-readable timestamp string in local time.
 */
export function formatTimestamp(epochMs: number): string {
  if (!Number.isFinite(epochMs)) { return '—'; }
  const d = new Date(epochMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ============================================================================
// formatDuration
// ============================================================================

/**
 * Converts a duration in milliseconds to a human-readable string.
 *
 * | Range          | Example output |
 * |----------------|----------------|
 * | < 1 000 ms     | `"42ms"`       |
 * | 1 000 – 59 999 ms | `"1.23s"`  |
 * | ≥ 60 000 ms    | `"2m 14s"`     |
 *
 * Returns `'0ms'` for zero and negative values.
 * Returns `'—'` for `NaN` or non-finite inputs.
 *
 * @param ms - Duration in milliseconds.
 * @returns A human-readable duration string.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) { return '—'; }
  if (ms <= 0) { return '0ms'; }
  if (ms < 1_000) { return `${Math.round(ms)}ms`; }
  if (ms < 60_000) {
    return `${(ms / 1_000).toFixed(2)}s`;
  }
  const totalSeconds = Math.floor(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// ============================================================================
// sanitizeFilename
// ============================================================================

/**
 * Collapses any character that is not `[A-Za-z0-9_-]` to a hyphen, then
 * trims leading and trailing hyphens.
 *
 * Path separators (`.`, `/`, `\`, `:`) and whitespace are replaced, making
 * the output safe for use as a filename across all major operating systems.
 *
 * @param name - An arbitrary string (e.g. a collection or flow name).
 * @returns A filesystem-safe slug, or `'export'` when the result would be empty.
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'export';
}

// ============================================================================
// buildReportFilename
// ============================================================================

/**
 * Builds the suggested filename for a report download.
 *
 * Format: `wave-{runType}-{sanitizedName}-{YYYYMMDD-HHMMSS}.html`
 *
 * Example: `wave-collection-my-api-20260505-143022.html`
 *
 * @param runType - One of 'collection', 'flow', or 'testsuite'.
 * @param subjectName - The display name of the run subject (will be sanitized).
 * @param now - The epoch-millisecond timestamp to embed in the filename (local time).
 * @returns The suggested filename string (no path components).
 */
export function buildReportFilename(
  runType: string,
  subjectName: string,
  now: number,
): string {
  const d = new Date(now);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  const datePart = `${year}${month}${day}-${hours}${minutes}${seconds}`;
  return `wave-${runType}-${sanitizeFilename(subjectName)}-${datePart}.html`;
}
