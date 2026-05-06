/**
 * useReportExport hook
 *
 * Manages the lifecycle of exporting a run report via the platform storage
 * adapter. Exposes a simple status object along with export methods for each
 * run type: `exportCollectionRun` and `exportFlowRun`.
 *
 * Design notes:
 * - State machine: idle → generating → success | error.
 * - A single shared `status` state is used; only one export can be in-flight
 *   at a time per hook instance. Each new call resets state to 'generating'.
 * - The hook does not manage any timer for hiding the success indicator; that
 *   is the caller's (component's) responsibility so the hook stays pure.
 * - Unexpected exceptions from the builders are caught here as defence-in-depth;
 *   in practice the builders are pure functions and should not throw, but
 *   wrapping guarantees no unhandled rejection reaches the UI.
 */

import { useState, useCallback } from 'react';
import { useStorageAdapter, useNotificationAdapter } from './useAdapter';
import {
  buildCollectionRunReport,
  type CollectionReportInput,
} from '../utils/reporting/builders/collectionRun';
import {
  buildFlowRunReport,
  type FlowReportInput,
} from '../utils/reporting/builders/flowRun';
import {
  buildTestSuiteRunReport,
  type TestSuiteReportInput,
} from '../utils/reporting/builders/testSuiteRun';
import { buildReportFilename } from '../utils/reporting';

// ============================================================================
// Public Types
// ============================================================================

/** The four possible states of a report export operation. */
export type ReportExportState = 'idle' | 'generating' | 'success' | 'error';

/**
 * Status object returned by the hook.
 *
 * Read `state` to drive UI; `error` and `lastFileName` are populated on
 * `'error'` and `'success'` respectively.
 */
export interface ReportExportStatus {
  readonly state: ReportExportState;
  /** Populated when `state === 'error'`. Human-readable failure description. */
  readonly error?: string;
  /**
   * Populated when `state === 'success'`. The actual file name used for the
   * download (may differ from the suggested name on VS Code if the user
   * renamed it in the save dialog).
   */
  readonly lastFileName?: string;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that manages the lifecycle of exporting a run report.
 *
 * A single shared `status` state covers all export methods. Each call
 * resets state to 'generating' at the start so callers can use one hook
 * instance per component.
 *
 * @returns
 *   - `status` — current export state.
 *   - `exportCollectionRun(input)` — builds a collection run HTML report and
 *     triggers a file download via `IStorageAdapter.exportFile`.
 *   - `exportFlowRun(input)` — builds a flow run HTML report and triggers a
 *     file download via `IStorageAdapter.exportFile`.
 *   - `exportTestSuiteRun(input)` — builds a test suite run HTML report and
 *     triggers a file download via `IStorageAdapter.exportFile`.
 */
export function useReportExport() {
  const storage = useStorageAdapter();
  const notification = useNotificationAdapter();

  const [status, setStatus] = useState<ReportExportStatus>({ state: 'idle' });

  const exportCollectionRun = useCallback(
    async (input: CollectionReportInput): Promise<void> => {
      setStatus({ state: 'generating' });

      try {
        // Pure builder — should not throw; wrapped for defence-in-depth.
        const html = buildCollectionRunReport(input);
        const fileName = buildReportFilename(
          'collection',
          input.metadata.subjectName,
          Date.now()
        );

        const result = await storage.exportFile(fileName, html, 'text/html');

        if (result.isOk) {
          setStatus({ state: 'success', lastFileName: result.value.fileName });
        } else {
          const errorMsg = result.error;
          setStatus({ state: 'error', error: errorMsg });
          notification.showNotification(
            'error',
            `Failed to export report: ${errorMsg}`
          );
        }
      } catch (e) {
        const errorMsg =
          e instanceof Error ? e.message : 'Unexpected error during report generation';
        setStatus({ state: 'error', error: errorMsg });
        notification.showNotification(
          'error',
          `Failed to export report: ${errorMsg}`
        );
      }
    },
    [storage, notification]
  );

  /**
   * Builds a flow run HTML report and triggers a file download.
   *
   * State transitions: idle → generating → success | error.
   * On failure, surfaces an error notification via the notification adapter
   * and sets `status.state` to 'error'.
   */
  const exportFlowRun = useCallback(
    async (input: FlowReportInput): Promise<void> => {
      setStatus({ state: 'generating' });

      try {
        // Pure builder — should not throw; wrapped for defence-in-depth.
        const html = buildFlowRunReport(input);
        const fileName = buildReportFilename(
          'flow',
          input.metadata.subjectName,
          Date.now()
        );

        const result = await storage.exportFile(fileName, html, 'text/html');

        if (result.isOk) {
          setStatus({ state: 'success', lastFileName: result.value.fileName });
        } else {
          const errorMsg = result.error;
          setStatus({ state: 'error', error: errorMsg });
          notification.showNotification(
            'error',
            `Failed to export report: ${errorMsg}`
          );
        }
      } catch (e) {
        const errorMsg =
          e instanceof Error ? e.message : 'Unexpected error during report generation';
        setStatus({ state: 'error', error: errorMsg });
        notification.showNotification(
          'error',
          `Failed to export report: ${errorMsg}`
        );
      }
    },
    [storage, notification]
  );

  /**
   * Builds a test suite run HTML report and triggers a file download.
   *
   * State transitions: idle → generating → success | error.
   * On failure, surfaces an error notification via the notification adapter
   * and sets `status.state` to 'error'.
   */
  const exportTestSuiteRun = useCallback(
    async (input: TestSuiteReportInput): Promise<void> => {
      setStatus({ state: 'generating' });

      try {
        // Pure builder — should not throw; wrapped for defence-in-depth.
        const html = buildTestSuiteRunReport(input);
        const fileName = buildReportFilename(
          'testsuite',
          input.metadata.subjectName,
          Date.now()
        );

        const result = await storage.exportFile(fileName, html, 'text/html');

        if (result.isOk) {
          setStatus({ state: 'success', lastFileName: result.value.fileName });
        } else {
          const errorMsg = result.error;
          setStatus({ state: 'error', error: errorMsg });
          notification.showNotification(
            'error',
            `Failed to export report: ${errorMsg}`
          );
        }
      } catch (e) {
        const errorMsg =
          e instanceof Error ? e.message : 'Unexpected error during report generation';
        setStatus({ state: 'error', error: errorMsg });
        notification.showNotification(
          'error',
          `Failed to export report: ${errorMsg}`
        );
      }
    },
    [storage, notification]
  );

  return { status, exportCollectionRun, exportFlowRun, exportTestSuiteRun };
}
