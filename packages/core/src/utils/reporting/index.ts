/**
 * Public API for the Wave Client reporting module.
 *
 * All functions accept plain values and return HTML strings.
 * Zero React / DOM / Node.js dependencies — safe for any environment.
 */

// Types
export type {
  ReportMetadata,
  ReportSummary,
  ReportRequestNode,
  RunType,
  RunStatus,
  ValidationStatus,
} from './types';
export type { ValidationResult } from './types';

// Escape helpers (also useful for consumer templates)
export { escapeHtml, escapeAttr } from './escape';

// Format helpers
export { formatTimestamp, formatDuration, sanitizeFilename, buildReportFilename } from './format';

// Content helpers
export { isTextResponse, prettyPrintIfJson, BINARY_PLACEHOLDER } from './content';

// Static assets (embed in the shell or an existing page)
export { THEME_CSS } from './theme';
export { INTERACTIVITY_JS } from './interactivity';

// HTML rendering functions
export type { ShellOptions } from './shell';
export { renderShell } from './shell';
export { renderHeader } from './blocks/header';
export { renderSummary } from './blocks/summary';
export { renderRequestDetail } from './blocks/requestDetail';

// Report builders
export type { CollectionReportInput } from './builders/collectionRun';
export { buildCollectionRunReport } from './builders/collectionRun';

export type { FlowReportInput } from './builders/flowRun';
export { buildFlowRunReport } from './builders/flowRun';

export type { TestSuiteReportInput, TestSuiteReportItem, TestSuiteFlowTestCase } from './builders/testSuiteRun';
export { buildTestSuiteRunReport } from './builders/testSuiteRun';
