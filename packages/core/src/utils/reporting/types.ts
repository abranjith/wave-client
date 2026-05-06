/**
 * Types for the Wave Client HTML report builder.
 *
 * All types here describe the **inputs** that report builders accept.
 * None of these types are persisted — they are consumed transiently at
 * click-time from existing in-memory run state.
 *
 * Security note: every field that may contain user-controlled data (names,
 * URLs, header values, body text, etc.) MUST be routed through `escapeHtml` /
 * `escapeAttr` before being embedded in the produced HTML string.
 */

import type { AnyCollectionRequest } from '../../types/collection';
import type { ValidationResult } from '../../types/validation';

// ============================================================================
// Run type discriminant
// ============================================================================

/**
 * Discriminant for the three types of runs that can produce a report.
 * Drives header copy and the suggested filename.
 */
export type RunType = 'collection' | 'flow' | 'testsuite';

// ============================================================================
// ReportMetadata
// ============================================================================

/**
 * Metadata describing the overall run — who ran it, when, and with what settings.
 *
 * Optional fields are omitted from the report header when `undefined` so that
 * flow and test-suite reports (which don't have concurrency settings, for
 * example) don't render empty rows.
 */
export interface ReportMetadata {
  /** Discriminant — 'collection' | 'flow' | 'testsuite'. Drives header copy and filename. */
  readonly runType: RunType;
  /** Display name of the collection, flow, or test suite. */
  readonly subjectName: string;
  /**
   * Optional folder path within a collection (collection runs scoped to a
   * sub-folder). Rendered as "parent / sub / leaf" in the report header.
   */
  readonly itemPath?: readonly string[];
  /** Name of the selected environment, or undefined when "None" was chosen. */
  readonly environmentName?: string;
  /**
   * Display name of the default auth profile applied to the run (option (a):
   * name only — credential values are never accessed by this module).
   */
  readonly defaultAuthName?: string;
  /** Maximum concurrent HTTP calls (collection runner only; omit for flow/testsuite). */
  readonly concurrentCalls?: number;
  /** Milliseconds delay between request calls (collection runner only; omit for flow/testsuite). */
  readonly delayBetweenCalls?: number;
  /** Run start time as epoch milliseconds. */
  readonly startedAt: number;
  /** Run end time as epoch milliseconds; undefined when the run was cancelled mid-flight. */
  readonly completedAt?: number;
  /**
   * Total wall-clock elapsed time in milliseconds.
   * Included for resilience when one of the timestamps might be missing.
   */
  readonly totalElapsedMs?: number;
}

// ============================================================================
// ReportSummary
// ============================================================================

/**
 * Aggregate counts for the run result, displayed as a tile grid in the report.
 */
export interface ReportSummary {
  /** Total number of requests in the run. */
  readonly total: number;
  /** Number of requests that passed (status 2xx and validation passed). */
  readonly passed: number;
  /** Number of requests that failed (error, non-2xx, or validation failed). */
  readonly failed: number;
  /** Number of requests that were skipped. */
  readonly skipped: number;
  /**
   * Average response time across all executed requests, in milliseconds.
   * `undefined` when no requests completed (e.g., all were skipped or cancelled).
   */
  readonly averageTimeMs?: number;
}

// ============================================================================
// ReportRequestNode
// ============================================================================

/**
 * The input to `renderRequestDetail`. Mirrors the public fields of
 * `RunRequestData` from `RunRequestCard.tsx` and augments them with the
 * originating request object so the Request tab can render headers / params /
 * body.
 *
 * Reuses (does not duplicate) `RunStatus`, `ValidationStatus`, and
 * `ValidationResult` from existing core modules.
 */
export interface ReportRequestNode {
  /** Unique identifier from the run state. */
  readonly id: string;
  /** Display name of the request. */
  readonly name: string;
  /** HTTP method (GET, POST, …) — empty string for WebSocket. */
  readonly method: string;
  /** Resolved URL as a string. */
  readonly url: string;
  /**
   * Folder path within the collection (e.g. ['Accounts', 'CRUD']).
   * Rendered as a breadcrumb in the card header.
   */
  readonly folderPath: readonly string[];
  /** Overall run outcome. */
  readonly runStatus: RunStatus;
  /** HTTP response status code (e.g. 200, 404). */
  readonly responseStatus?: number;
  /** Response round-trip time in milliseconds. */
  readonly responseTime?: number;
  /** Validation outcome after rule evaluation. */
  readonly validationStatus: ValidationStatus;
  /** Detailed per-rule validation results. */
  readonly validationResult?: ValidationResult;
  /** Raw response headers, keyed by lower-case header name. */
  readonly responseHeaders?: Record<string, string>;
  /** Raw response body text (or base64 when `isResponseEncoded === true`). */
  readonly responseBody?: string;
  /**
   * When `true`, `responseBody` is base64-encoded binary data.
   * The report renders the `BINARY_PLACEHOLDER` instead of the raw body.
   */
  readonly isResponseEncoded?: boolean;
  /** Error message when the request failed with an exception (e.g. network error). */
  readonly error?: string;
  /**
   * The originating request definition. Used by the Request tab to render
   * headers, query params, and body from the configured request.
   */
  readonly request: AnyCollectionRequest;
}

// ============================================================================
// Re-exported status aliases (from RunRequestCard.tsx)
// ============================================================================

/**
 * Possible states of a single request during a run.
 * Mirrors `RunStatus` exported from `RunRequestCard.tsx`.
 */
export type RunStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled';

/**
 * Outcome of validation rule evaluation for a single request.
 * Mirrors `ValidationStatus` exported from `RunRequestCard.tsx`.
 */
export type ValidationStatus = 'idle' | 'pending' | 'pass' | 'fail';

// Re-export ValidationResult so callers only need to import from this module.
export type { ValidationResult };
