/**
 * Unit tests for useReportExport.
 *
 * Collection run scenarios:
 *  1. Initial state is idle.
 *  2. Successful export: state transitions idle → generating → success; lastFileName is set.
 *  3. Adapter returns err: state ends in error; notification.showNotification is called.
 *  4. Builder throws unexpectedly: state ends in error; no unhandled rejection.
 *  5. State resets cleanly on a subsequent successful call.
 *
 * Flow run scenarios:
 *  6. Successful flow export: filename starts with wave-flow- and mimeType is text/html.
 *  7. Adapter error surfaces via notification for flow export.
 *  8. Hook state machine is independent — exportFlowRun does not interfere with
 *     a prior exportCollectionRun final state (each call resets to 'generating').
 *
 * Test suite run scenarios:
 *  9. Successful test suite export: filename starts with wave-testsuite- and mimeType is text/html.
 *  10. Adapter error surfaces via notification for test suite export.
 *  11. Sequential exports (collection → flow → testsuite) all transition cleanly.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import { useReportExport } from '../../hooks/useReportExport';
import type { CollectionReportInput } from '../../utils/reporting/builders/collectionRun';
import type { FlowReportInput } from '../../utils/reporting/builders/flowRun';
import type { TestSuiteReportInput } from '../../utils/reporting/builders/testSuiteRun';
import type { CollectionRequest } from '../../types/collection';
import { err } from '../../utils/result';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(id: string): CollectionRequest {
  return {
    id,
    name: id,
    protocol: 'http',
    method: 'GET',
    url: `https://api.example.com/${id}`,
  };
}

function makeInput(): CollectionReportInput {
  return {
    metadata: {
      runType: 'collection',
      subjectName: 'Test Suite',
      startedAt: Date.now(),
    },
    summary: { total: 1, passed: 1, failed: 0, skipped: 0, averageTimeMs: 50 },
    items: [
      {
        id: 'req-1',
        name: 'Health Check',
        method: 'GET',
        url: 'https://api.example.com/health',
        folderPath: [],
        runStatus: 'success',
        responseStatus: 200,
        responseTime: 50,
        validationStatus: 'pass',
        request: makeRequest('req-1'),
      },
    ],
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function createWrapper(adapter: ReturnType<typeof createMockAdapter>['adapter']) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AdapterProvider adapter={adapter}>{children}</AdapterProvider>;
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useReportExport', () => {
  let mockAdapterResult: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    mockAdapterResult = createMockAdapter();
  });

  // ── 1. Initial state ────────────────────────────────────────────────────────
  it('initial state is idle', () => {
    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    expect(result.current.status.state).toBe('idle');
    expect(result.current.status.error).toBeUndefined();
    expect(result.current.status.lastFileName).toBeUndefined();
  });

  // ── 2. Successful export ────────────────────────────────────────────────────
  it('transitions to success and populates lastFileName on successful export', async () => {
    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(result.current.status.state).toBe('success');
    expect(result.current.status.error).toBeUndefined();
    // The mock adapter returns a fileName derived from the suggested name
    expect(result.current.status.lastFileName).toBeTruthy();
    expect(typeof result.current.status.lastFileName).toBe('string');
  });

  it('calls storage.exportFile with text/html mime type', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(exportFileSpy).toHaveBeenCalledOnce();
    const [, , mimeType] = exportFileSpy.mock.calls[0];
    expect(mimeType).toBe('text/html');
  });

  it('calls storage.exportFile with a wave-collection-*.html filename', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    const [fileName] = exportFileSpy.mock.calls[0];
    expect(fileName).toMatch(/^wave-collection-.*\.html$/);
  });

  // ── 3. Adapter error ────────────────────────────────────────────────────────
  it('transitions to error state when adapter returns err', async () => {
    // Override exportFile to return an error result
    vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile').mockResolvedValueOnce(err('Disk full'));

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(result.current.status.state).toBe('error');
    expect(result.current.status.error).toBe('Disk full');
    expect(result.current.status.lastFileName).toBeUndefined();
  });

  it('calls notification.showNotification with error type when adapter returns err', async () => {
    vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile').mockResolvedValueOnce(err('Disk full'));

    const showNotificationSpy = vi.spyOn(
      mockAdapterResult.adapter.notification,
      'showNotification'
    );

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(showNotificationSpy).toHaveBeenCalledOnce();
    const [type, message] = showNotificationSpy.mock.calls[0];
    expect(type).toBe('error');
    expect(message).toContain('Disk full');
  });

  // ── 4. Unexpected builder throw ─────────────────────────────────────────────
  it('transitions to error state when an unexpected exception is thrown', async () => {
    // Force the builder to throw by making exportFile throw synchronously
    // (simulates an unexpected error in the try block)
    vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile').mockImplementationOnce(() => {
      throw new Error('Unexpected storage crash');
    });

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    // Should not throw / produce an unhandled rejection
    await act(async () => {
      await expect(result.current.exportCollectionRun(makeInput())).resolves.toBeUndefined();
    });

    expect(result.current.status.state).toBe('error');
    expect(result.current.status.error).toContain('Unexpected storage crash');
  });

  // ── 5. State resets on next successful call ──────────────────────────────────
  it('resets to success on a subsequent successful call after an error', async () => {
    // First call fails
    vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile').mockResolvedValueOnce(err('Transient error'));

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(result.current.status.state).toBe('error');

    // Second call succeeds (mock is no longer overridden)
    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(result.current.status.state).toBe('success');
    expect(result.current.status.error).toBeUndefined();
  });
});

// ── Flow export tests ─────────────────────────────────────────────────────────

function makeFlowInput(): FlowReportInput {
  return {
    metadata: {
      runType: 'flow',
      subjectName: 'My Flow',
      startedAt: Date.now(),
      completedAt: Date.now() + 2000,
      totalElapsedMs: 2000,
    },
    summary: { total: 2, passed: 1, failed: 0, skipped: 1 },
    nodes: [
      {
        id: 'node-1',
        name: 'Get User',
        method: 'GET',
        url: 'https://api.example.com/users/1',
        folderPath: [],
        runStatus: 'success',
        responseStatus: 200,
        responseTime: 80,
        validationStatus: 'pass',
        request: makeRequest('node-1'),
      },
      {
        id: 'node-2',
        name: 'Conditional Branch',
        method: 'POST',
        url: 'https://api.example.com/branch',
        folderPath: [],
        runStatus: 'skipped',
        validationStatus: 'idle',
        error: 'Skipped (condition not met)',
        request: makeRequest('node-2'),
      },
    ],
  };
}

describe('useReportExport — flow run', () => {
  let mockAdapterResult: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    mockAdapterResult = createMockAdapter();
  });

  // ── 6. Successful flow export ─────────────────────────────────────────────
  it('calls exportFile with a wave-flow-*.html filename', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportFlowRun(makeFlowInput());
    });

    expect(exportFileSpy).toHaveBeenCalledOnce();
    const [fileName] = exportFileSpy.mock.calls[0];
    expect(fileName).toMatch(/^wave-flow-.*\.html$/);
  });

  it('calls exportFile with text/html mimeType', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportFlowRun(makeFlowInput());
    });

    const [, , mimeType] = exportFileSpy.mock.calls[0];
    expect(mimeType).toBe('text/html');
  });

  it('transitions to success and populates lastFileName on successful flow export', async () => {
    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportFlowRun(makeFlowInput());
    });

    expect(result.current.status.state).toBe('success');
    expect(result.current.status.lastFileName).toBeTruthy();
  });

  // ── 7. Adapter error for flow export ─────────────────────────────────────
  it('transitions to error and notifies when adapter returns err', async () => {
    vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile').mockResolvedValueOnce(err('Write permission denied'));

    const showNotificationSpy = vi.spyOn(
      mockAdapterResult.adapter.notification,
      'showNotification'
    );

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportFlowRun(makeFlowInput());
    });

    expect(result.current.status.state).toBe('error');
    expect(result.current.status.error).toBe('Write permission denied');
    expect(showNotificationSpy).toHaveBeenCalledOnce();
    const [type, message] = showNotificationSpy.mock.calls[0];
    expect(type).toBe('error');
    expect(message).toContain('Write permission denied');
  });

  // ── 8. State machine independence ─────────────────────────────────────────
  it('exportFlowRun resets state to generating even after a prior exportCollectionRun success', async () => {
    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    // First, run a successful collection export
    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });

    expect(result.current.status.state).toBe('success');

    // Now run a flow export — it should reset to generating and end at success
    await act(async () => {
      await result.current.exportFlowRun(makeFlowInput());
    });

    expect(result.current.status.state).toBe('success');
    // Verify it was the flow filename, not the collection one
    const allCalls = vi.mocked(mockAdapterResult.adapter.storage.exportFile).mock.calls;
    expect(allCalls.length).toBe(2);
    expect(allCalls[1][0]).toMatch(/^wave-flow-/);
  });
});

// ── Test suite export tests ───────────────────────────────────────────────────

function makeTestSuiteInput(): TestSuiteReportInput {
  return {
    metadata: {
      runType: 'testsuite',
      subjectName: 'My Suite',
      startedAt: Date.now(),
      completedAt: Date.now() + 5000,
      totalElapsedMs: 5000,
    },
    summary: { total: 1, passed: 1, failed: 0, skipped: 0 },
    items: [
      {
        kind: 'request',
        name: 'Get User',
        status: 'success',
        single: {
          id: 'req-1',
          name: 'Get User',
          method: 'GET',
          url: 'https://api.example.com/users/1',
          folderPath: [],
          runStatus: 'success',
          responseStatus: 200,
          responseTime: 90,
          validationStatus: 'pass',
          request: makeRequest('req-1'),
        },
      },
    ],
  };
}

describe('useReportExport — test suite run', () => {
  let mockAdapterResult: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    mockAdapterResult = createMockAdapter();
  });

  // ── 9. Successful test suite export ───────────────────────────────────────
  it('calls exportFile with a wave-testsuite-*.html filename', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportTestSuiteRun(makeTestSuiteInput());
    });

    expect(exportFileSpy).toHaveBeenCalledOnce();
    const [fileName] = exportFileSpy.mock.calls[0];
    expect(fileName).toMatch(/^wave-testsuite-.*\.html$/);
  });

  it('calls exportFile with text/html mimeType', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportTestSuiteRun(makeTestSuiteInput());
    });

    const [, , mimeType] = exportFileSpy.mock.calls[0];
    expect(mimeType).toBe('text/html');
  });

  it('transitions to success and populates lastFileName on successful test suite export', async () => {
    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportTestSuiteRun(makeTestSuiteInput());
    });

    expect(result.current.status.state).toBe('success');
    expect(result.current.status.lastFileName).toBeTruthy();
  });

  // ── 10. Adapter error for test suite export ────────────────────────────────
  it('transitions to error and notifies when adapter returns err', async () => {
    vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile').mockResolvedValueOnce(err('Storage quota exceeded'));

    const showNotificationSpy = vi.spyOn(
      mockAdapterResult.adapter.notification,
      'showNotification'
    );

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    await act(async () => {
      await result.current.exportTestSuiteRun(makeTestSuiteInput());
    });

    expect(result.current.status.state).toBe('error');
    expect(result.current.status.error).toBe('Storage quota exceeded');
    expect(showNotificationSpy).toHaveBeenCalledOnce();
    const [type, message] = showNotificationSpy.mock.calls[0];
    expect(type).toBe('error');
    expect(message).toContain('Storage quota exceeded');
  });

  // ── 11. Sequential exports (collection → flow → testsuite) ────────────────
  it('all three export methods transition cleanly in sequence', async () => {
    const exportFileSpy = vi.spyOn(mockAdapterResult.adapter.storage, 'exportFile');

    const { result } = renderHook(() => useReportExport(), {
      wrapper: createWrapper(mockAdapterResult.adapter),
    });

    // Collection export
    await act(async () => {
      await result.current.exportCollectionRun(makeInput());
    });
    expect(result.current.status.state).toBe('success');

    // Flow export
    await act(async () => {
      await result.current.exportFlowRun(makeFlowInput());
    });
    expect(result.current.status.state).toBe('success');

    // Test suite export
    await act(async () => {
      await result.current.exportTestSuiteRun(makeTestSuiteInput());
    });
    expect(result.current.status.state).toBe('success');

    // Verify all three calls happened with correct filename prefixes
    expect(exportFileSpy).toHaveBeenCalledTimes(3);
    const fileNames = exportFileSpy.mock.calls.map(([name]) => name);
    expect(fileNames[0]).toMatch(/^wave-collection-/);
    expect(fileNames[1]).toMatch(/^wave-flow-/);
    expect(fileNames[2]).toMatch(/^wave-testsuite-/);
  });
});
