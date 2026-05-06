/**
 * Component tests for TestResultsPanel — Export button (FEAT-005 TASK-003).
 *
 * Tested scenarios:
 *  1. Export button renders in the panel header.
 *  2. Export button is disabled when result === null.
 *  3. Export button is disabled while result.status === 'running'.
 *  4. Clicking Export calls exportFile exactly once with a wave-testsuite-*.html filename.
 *  5. The exported HTML content contains the suite name.
 *  6. Enabled items only — disabled items are excluded from the report payload.
 *  7. On adapter error, showNotification is called with type 'error'.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import { TestResultsPanel } from '../../../components/testlab/TestResultsPanel';
import type { TestSuite, TestSuiteRunResult, RequestTestItemResult } from '../../../types/testSuite';
import type { Collection } from '../../../types/collection';
import type { Flow } from '../../../types/flow';
import { DEFAULT_TEST_SUITE_SETTINGS } from '../../../types/testSuite';
import { err } from '../../../utils/result';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSuite(itemCount = 1): TestSuite {
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    name: `Request ${i}`,
    type: 'request' as const,
    order: i,
    enabled: true,
    referenceId: `req-${i}`,
  }));

  return {
    id: 'suite-1',
    name: 'My Test Suite',
    items,
    settings: DEFAULT_TEST_SUITE_SETTINGS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeResult(
  status: TestSuiteRunResult['status'] = 'success',
  itemCount = 1
): TestSuiteRunResult {
  const itemResults = new Map<string, RequestTestItemResult>();
  for (let i = 0; i < itemCount; i++) {
    itemResults.set(`item-${i}`, {
      itemId: `item-${i}`,
      type: 'request',
      status: 'success',
      validationStatus: 'pass',
      response: {
        id: '',
        status: 200,
        statusText: 'OK',
        elapsedTime: 100,
        size: 0,
        body: '{}',
        headers: {},
        isEncoded: false,
      },
    });
  }

  return {
    suiteId: 'suite-1',
    status,
    itemResults,
    startedAt: new Date(Date.now() - 2000).toISOString(),
    completedAt: status !== 'running' ? new Date().toISOString() : undefined,
    progress: {
      total: itemCount,
      completed: status !== 'running' ? itemCount : 0,
      passed: status === 'success' ? itemCount : 0,
      failed: 0,
      skipped: 0,
    },
    averageTime: 100,
  };
}

const collections: Collection[] = [];
const flows: Flow[] = [];

function renderPanel(
  suite: TestSuite,
  result: TestSuiteRunResult | null,
  adapter = createMockAdapter().adapter
) {
  return render(
    <AdapterProvider adapter={adapter}>
      <TestResultsPanel
        suite={suite}
        collections={collections}
        flows={flows}
        result={result}
        onClearResults={vi.fn()}
      />
    </AdapterProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TestResultsPanel — Export button', () => {
  let mockAdapter: ReturnType<typeof createMockAdapter>['adapter'];

  beforeEach(() => {
    ({ adapter: mockAdapter } = createMockAdapter());
  });

  // ── 1. Export button renders ──────────────────────────────────────────────
  it('renders the export button in the panel header', () => {
    renderPanel(makeSuite(), makeResult(), mockAdapter);
    expect(screen.getByRole('button', { name: /export html report/i })).toBeInTheDocument();
  });

  // ── 2. Disabled when result === null ──────────────────────────────────────
  it('is disabled when result is null', () => {
    renderPanel(makeSuite(), null, mockAdapter);
    expect(screen.getByRole('button', { name: /export html report/i })).toBeDisabled();
  });

  // ── 3. Disabled while running ─────────────────────────────────────────────
  it('is disabled while result.status is "running"', () => {
    renderPanel(makeSuite(), makeResult('running'), mockAdapter);
    expect(screen.getByRole('button', { name: /export html report/i })).toBeDisabled();
  });

  // ── 4. Click invokes exportFile once with wave-testsuite-*.html ───────────
  it('calls exportFile once when clicked, with a wave-testsuite-*.html filename', async () => {
    const suite = makeSuite(2);
    const result = makeResult('success', 2);

    const exportFileSpy = vi.spyOn(mockAdapter.storage, 'exportFile');
    renderPanel(suite, result, mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(exportFileSpy).toHaveBeenCalledOnce();
    });

    const [fileName] = exportFileSpy.mock.calls[0];
    expect(fileName).toMatch(/^wave-testsuite-.*\.html$/);
  });

  // ── 5. Exported HTML contains the suite name ──────────────────────────────
  it('exports a valid HTML file that contains the suite name', async () => {
    const suite = makeSuite(1);
    const result = makeResult('success', 1);

    const exportFileSpy = vi.spyOn(mockAdapter.storage, 'exportFile');
    renderPanel(suite, result, mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(exportFileSpy).toHaveBeenCalledOnce();
    });

    const [, htmlContent, mimeType] = exportFileSpy.mock.calls[0];
    expect(mimeType).toBe('text/html');
    expect(htmlContent).toContain('My Test Suite');
    expect(htmlContent).toMatch(/^<!DOCTYPE html>/i);
  });

  // ── 6. Disabled items are excluded from the report ────────────────────────
  it('exports only enabled items — disabled items are excluded', async () => {
    const suite = makeSuite(3);
    // Disable the second item
    suite.items[1] = { ...suite.items[1], enabled: false };

    const result = makeResult('success', 3);
    const exportFileSpy = vi.spyOn(mockAdapter.storage, 'exportFile');
    renderPanel(suite, result, mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(exportFileSpy).toHaveBeenCalledOnce();
    });

    const [, htmlContent] = exportFileSpy.mock.calls[0];
    // Enabled items appear, disabled item name does not
    expect(htmlContent).toContain('Request 0');
    expect(htmlContent).not.toContain('Request 1');
    expect(htmlContent).toContain('Request 2');
  });

  // ── 7. Adapter error surfaces via notification ────────────────────────────
  it('calls showNotification with error when exportFile fails', async () => {
    vi.spyOn(mockAdapter.storage, 'exportFile').mockResolvedValueOnce(err('Permission denied'));

    const showNotificationSpy = vi.spyOn(mockAdapter.notification, 'showNotification');

    renderPanel(makeSuite(), makeResult(), mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledOnce();
    });

    const [type, message] = showNotificationSpy.mock.calls[0];
    expect(type).toBe('error');
    expect(message).toContain('Permission denied');
  });
});
