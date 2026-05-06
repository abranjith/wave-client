/**
 * HTML document shell for Wave Client reports.
 *
 * `renderShell` assembles the complete HTML document by embedding the
 * pre-compiled theme CSS and interactivity JS and wrapping the caller-supplied
 * body fragment.
 *
 * **Security contract**: `title` is passed through `escapeHtml` here.
 * `body` is treated as **already-escaped HTML** produced by other reporting
 * blocks — callers must never pass raw user data as `body`.
 */

import { escapeHtml } from './escape';
import { THEME_CSS } from './theme';
import { INTERACTIVITY_JS } from './interactivity';

/** Options accepted by `renderShell`. */
export interface ShellOptions {
  /** The document title (will be HTML-escaped). */
  title: string;
  /**
   * The body content fragment.
   * Must be composed entirely from reporting blocks that escape all dynamic
   * data — never pass raw user input here.
   */
  body: string;
}

/**
 * Renders a complete HTML document wrapping `body` with theme CSS and
 * interactivity JS.
 *
 * Output structure:
 * ```
 * <!DOCTYPE html>
 * <html lang="en">
 *   <head>
 *     <meta charset="utf-8">
 *     <title>{escaped title}</title>
 *     <style>{THEME_CSS}</style>
 *   </head>
 *   <body>
 *     {body}
 *     <script>{INTERACTIVITY_JS}</script>
 *   </body>
 * </html>
 * ```
 *
 * @param options - Shell options.
 * @returns A complete, self-contained HTML document string.
 */
export function renderShell({ title, body }: ShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${THEME_CSS}
</style>
</head>
<body>
${body}
<script>
${INTERACTIVITY_JS}
</script>
</body>
</html>`;
}
