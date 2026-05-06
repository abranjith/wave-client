/**
 * Content-inspection helpers for Wave Client HTML report builders.
 *
 * These helpers decide how response bodies should be rendered in a report:
 * as text (possibly pretty-printed) or replaced by a binary placeholder.
 *
 * All functions are pure and never throw on user input — invalid inputs fall
 * back to safe, renderer-friendly defaults.
 */

// ============================================================================
// BINARY_PLACEHOLDER
// ============================================================================

/**
 * The string rendered in the response body panel when the response is binary
 * (base64-encoded) or when the content type indicates non-text data.
 */
export const BINARY_PLACEHOLDER = '(binary content not included)';

// ============================================================================
// isTextResponse
// ============================================================================

/**
 * Content-type patterns that indicate binary / non-text content.
 * Any response whose `Content-Type` matches one of these prefixes or exact
 * values is considered binary.
 */
const BINARY_CONTENT_TYPE_PATTERNS: ReadonlyArray<RegExp> = [
  /^image\//i,
  /^audio\//i,
  /^video\//i,
  /^application\/octet-stream/i,
  /^application\/pdf/i,
  /^application\/zip/i,
  /^application\/x-zip/i,
  /^application\/gzip/i,
  /^application\/x-tar/i,
];

/**
 * Returns `true` when the response body is safe to render as text in a report.
 *
 * The function short-circuits in the following order:
 * 1. `isEncoded === true` → the body is base64-encoded binary; always returns `false`.
 * 2. `Content-Type` matches a known binary pattern → returns `false`.
 * 3. First 64 bytes of `body` contain non-printable, non-whitespace characters
 *    (code points < 32, excluding `\t`, `\n`, `\r`) → returns `false` (raw binary sniff).
 * 4. Otherwise → returns `true`.
 *
 * @param headers - Response headers (any casing accepted for the key lookup).
 * @param body - The raw body string.
 * @param isEncoded - When `true`, the body is base64-encoded and must not be rendered.
 * @returns `true` when the body is safe to display as text.
 */
export function isTextResponse(
  headers: Record<string, string> | undefined,
  body: string | undefined,
  isEncoded: boolean | undefined,
): boolean {
  // 1. Caller explicitly flagged as encoded binary.
  if (isEncoded === true) { return false; }

  // 2. Content-Type header check.
  if (headers) {
    const contentType = getContentType(headers);
    if (contentType) {
      for (const pattern of BINARY_CONTENT_TYPE_PATTERNS) {
        if (pattern.test(contentType)) { return false; }
      }
    }
  }

  // 3. Raw-byte sniff on the first 64 characters.
  if (body && body.length > 0) {
    const sample = body.slice(0, 64);
    for (let i = 0; i < sample.length; i++) {
      const code = sample.charCodeAt(i);
      // Allow tab (9), newline (10), carriage return (13).
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) { return false; }
    }
  }

  return true;
}

// ============================================================================
// prettyPrintIfJson
// ============================================================================

/**
 * Attempts to pretty-print `body` when `contentType` indicates JSON.
 *
 * - If `contentType` contains `'json'` and `body` parses as valid JSON,
 *   returns `JSON.stringify(parsed, null, 2)`.
 * - Otherwise returns `body` unchanged.
 * - Never throws — malformed JSON falls back to the original string.
 *
 * @param body - The raw response body string.
 * @param contentType - The `Content-Type` header value (or empty/undefined).
 * @returns The original body, or a two-space-indented JSON string.
 */
export function prettyPrintIfJson(
  body: string | undefined,
  contentType: string | undefined,
): string {
  if (!body) { return body ?? ''; }
  if (!contentType || !contentType.toLowerCase().includes('json')) { return body; }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Extracts the `content-type` header value from a headers map, regardless of
 * key casing.
 */
function getContentType(headers: Record<string, string>): string | undefined {
  const lower = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  return lower !== undefined ? headers[lower] : undefined;
}
