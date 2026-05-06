/**
 * HTML escape utilities — the single trusted boundary for all report builders.
 *
 * ## Security contract
 *
 * Every builder in `packages/core/src/utils/reporting/` MUST route every
 * piece of user-controlled dynamic data through `escapeHtml` or `escapeAttr`
 * before embedding it in an HTML string.  Raw template-literal interpolation
 * of dynamic data is treated as a defect during code review.
 *
 * Both functions are pure and never throw.  `undefined` / empty inputs
 * safely return `''`.
 */

/**
 * Escapes a string for safe embedding inside HTML text content or attribute
 * values that are already delimited by double quotes.
 *
 * Replacement order matters: `&` must be replaced first so that the
 * ampersands introduced by subsequent replacements are not double-escaped.
 *
 * | Input | Output     |
 * |-------|------------|
 * | `&`   | `&amp;`    |
 * | `<`   | `&lt;`     |
 * | `>`   | `&gt;`     |
 * | `"`   | `&quot;`   |
 * | `'`   | `&#39;`    |
 *
 * @param input - The raw string to escape. Returns `''` for `undefined` or empty strings.
 * @returns The escaped HTML-safe string.
 */
export function escapeHtml(input: string | undefined): string {
  if (!input) { return ''; }
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a string for safe embedding inside an HTML attribute value.
 *
 * Extends `escapeHtml` with an additional backtick replacement to prevent
 * injection in older template-literal or attribute contexts that allow
 * unquoted attribute values delimited by backticks.
 *
 * | Input | Output     |
 * |-------|------------|
 * | `&`   | `&amp;`    |
 * | `<`   | `&lt;`     |
 * | `>`   | `&gt;`     |
 * | `"`   | `&quot;`   |
 * | `'`   | `&#39;`    |
 * | `` ` ``   | `&#96;`    |
 *
 * @param input - The raw string to escape. Returns `''` for `undefined` or empty strings.
 * @returns The escaped attribute-safe string.
 *
 * @security Always use this function when embedding dynamic data in HTML attributes,
 * even inside double-quoted attributes — defence in depth.
 */
export function escapeAttr(input: string | undefined): string {
  if (!input) { return ''; }
  return escapeHtml(input).replace(/`/g, '&#96;');
}
