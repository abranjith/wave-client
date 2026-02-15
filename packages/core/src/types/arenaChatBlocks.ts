/**
 * Arena Chat Block Types
 *
 * A discriminated union representing every kind of rich content block
 * that can appear inside an Arena assistant (or user) message.
 *
 * When an `ArenaMessage` has a non-empty `blocks` array, the UI renders
 * each block via `ArenaBlockRenderer` instead of treating `content` as
 * raw markdown.  If `blocks` is absent or empty, plain text rendering
 * is used (backward-compatible).
 *
 * @module arenaChatBlocks
 */

import type { ResponseData, HeaderRow, ParamRow } from './collection';

// ============================================================================
// Shared helpers
// ============================================================================

/**
 * Options for an environment picker inside a RequestFormBlock or
 * standalone EnvSelectorBlock.
 */
export interface EnvOption {
  /** Environment ID */
  id: string;
  /** Human-readable name */
  name: string;
}

/**
 * Data required to render a pre-filled "Run Request" form.
 */
export interface RequestFormData {
  /** HTTP method (GET, POST, …) */
  method: string;
  /** Target URL (may contain {{variables}}) */
  url: string;
  /** Optional pre-filled headers */
  headers?: HeaderRow[];
  /** Optional pre-filled query params */
  params?: ParamRow[];
  /** Optional request body (stringified JSON / raw text) */
  body?: string;
  /** Optional body content-type hint */
  bodyContentType?: string;
}

// ============================================================================
// Block variants
// ============================================================================

/** Plain markdown text rendered with enhanced formatting. */
export interface TextBlock {
  type: 'text';
  /** Markdown string */
  content: string;
}

/** Syntax-highlighted code snippet with a copy button. */
export interface CodeBlock {
  type: 'code';
  /** Language hint for highlight.js (e.g. "json", "http", "javascript") */
  language: string;
  /** Raw code string */
  content: string;
  /** Optional filename / label shown above the block */
  title?: string;
}

/** Collapsible, interactive JSON tree viewer. */
export interface JsonViewerBlock {
  type: 'json_viewer';
  /** JSON-serialisable data to display */
  data: Record<string, unknown> | unknown[];
  /** Optional heading above the viewer */
  title?: string;
  /** Start collapsed? (default: false) */
  defaultCollapsed?: boolean;
}

/**
 * Interactive form for configuring and sending an HTTP request.
 *
 * Rendered as environment dropdown + auth type + header/param overrides
 * plus a "Send" button. The result is dispatched through the adapter.
 */
export interface RequestFormBlock {
  type: 'request_form';
  /** Pre-populated request data */
  request: RequestFormData;
  /** Available environments to pick from */
  environments?: EnvOption[];
  /** Optional ID to correlate the response back to this form */
  formId?: string;
}

/** Display a completed HTTP response (status, headers, body, timing). */
export interface ResponseViewerBlock {
  type: 'response_viewer';
  /** The raw response data (same shape used by the request executor) */
  response: ResponseData;
  /** Optional label (e.g. "GET /api/users") */
  title?: string;
}

/** Dropdown to pick an environment (emits selection via callback). */
export interface EnvSelectorBlock {
  type: 'env_selector';
  /** Available environments */
  environments: EnvOption[];
  /** Pre-selected environment ID */
  selectedId?: string;
  /** Callback action ID — the selected env is sent back via this key */
  actionId?: string;
}

/** Simple data table with headers and rows. */
export interface TableBlock {
  type: 'table';
  /** Column headers */
  headers: string[];
  /** Row data (each row is same length as `headers`) */
  rows: string[][];
  /** Optional caption */
  caption?: string;
}

/**
 * Asks the user to confirm or reject an action.
 *
 * The decision is sent back using the `actionId` so the agent
 * can branch its graph accordingly.
 */
export interface ConfirmationBlock {
  type: 'confirmation';
  /** Descriptive message explaining what will happen */
  message: string;
  /** Unique action ID used to correlate the user's response */
  actionId: string;
  /** Optional override for the accept button label (default: "Confirm") */
  acceptLabel?: string;
  /** Optional override for the reject button label (default: "Cancel") */
  rejectLabel?: string;
}

/** Inline progress / status indicator. */
export interface ProgressBlock {
  type: 'progress';
  /** Short label (e.g. "Running flow…", "Tests passed") */
  label: string;
  /** Current status */
  status: 'running' | 'done' | 'error';
  /** Optional detail text shown below the label */
  detail?: string;
}

// ============================================================================
// Discriminated union
// ============================================================================

/**
 * All possible chat block variants.
 *
 * Use `block.type` to discriminate and render the correct component.
 */
export type ArenaChatBlock =
  | TextBlock
  | CodeBlock
  | JsonViewerBlock
  | RequestFormBlock
  | ResponseViewerBlock
  | EnvSelectorBlock
  | TableBlock
  | ConfirmationBlock
  | ProgressBlock;

/**
 * Extract the `type` literal from the union for type-safe switch helpers.
 */
export type ArenaChatBlockType = ArenaChatBlock['type'];

// ============================================================================
// Block helpers
// ============================================================================

/**
 * Create a simple text block.
 */
export function textBlock(content: string): TextBlock {
  return { type: 'text', content };
}

/**
 * Create a code block.
 */
export function codeBlock(language: string, content: string, title?: string): CodeBlock {
  return { type: 'code', language, content, ...(title ? { title } : {}) };
}

/**
 * Create a JSON viewer block from any JSON-serialisable value.
 */
export function jsonViewerBlock(
  data: Record<string, unknown> | unknown[],
  title?: string,
): JsonViewerBlock {
  return { type: 'json_viewer', data, ...(title ? { title } : {}) };
}

/**
 * Create a table block.
 */
export function tableBlock(headers: string[], rows: string[][], caption?: string): TableBlock {
  return { type: 'table', headers, rows, ...(caption ? { caption } : {}) };
}

/**
 * Create a progress block.
 */
export function progressBlock(
  label: string,
  status: 'running' | 'done' | 'error',
  detail?: string,
): ProgressBlock {
  return { type: 'progress', label, status, ...(detail ? { detail } : {}) };
}
