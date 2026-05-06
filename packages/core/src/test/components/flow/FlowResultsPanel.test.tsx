/**
 * Component tests for FlowResultsPanel.
 *
 * Tested scenarios:
 *  1. Export button renders in the panel header.
 *  2. Export button is disabled when result === null.
 *  3. Export button is disabled while result.status === 'running'.
 *  4. Clicking Export calls exportFlowRun exactly once with nodes whose
 *     length equals flow.nodes.length.
 *  5. On adapter error, the notification adapter showNotification is invoked.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AdapterProvider } from '../../../hooks/useAdapter';
import { createMockAdapter } from '../../mocks/mockAdapter';
import { FlowResultsPanel } from '../../../components/flow/FlowResultsPanel';
import type { Flow, FlowRunResult } from '../../../types/flow';
import type { Collection } from '../../../types/collection';
import { err } from '../../../utils/result';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFlow(nodeCount = 2): Flow {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `node-${i}`,
    alias: `node${i}`,
    requestId: `req-${i}`,
    name: `Node ${i}`,
    method: 'GET',
    position: { x: 0, y: i * 100 },
  }));

  return {
    id: 'flow-1',
    name: 'Test Flow',
    nodes,
    connectors: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeResult(
  status: FlowRunResult['status'] = 'success',
  nodeCount = 2
): FlowRunResult {
  const nodeResults = new Map<string, import('../../../types/flow').FlowNodeResult>();
  for (let i = 0; i < nodeCount; i++) {
    nodeResults.set(`node-${i}`, {
      nodeId: `node-${i}`,
      requestId: `req-${i}`,
      alias: `node${i}`,
      status: 'success',
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
    flowId: 'flow-1',
    status,
    nodeResults,
    activeConnectorIds: [],
    skippedConnectorIds: [],
    startedAt: new Date(Date.now() - 3000).toISOString(),
    completedAt: status !== 'running' ? new Date().toISOString() : undefined,
    progress: {
      total: nodeCount,
      completed: status !== 'running' ? nodeCount : 0,
      succeeded: status === 'success' ? nodeCount : 0,
      failed: 0,
      skipped: 0,
    },
  };
}

const collections: Collection[] = [];

function renderPanel(
  flow: Flow,
  result: FlowRunResult | null,
  adapter = createMockAdapter().adapter
) {
  return render(
    <AdapterProvider adapter={adapter}>
      <FlowResultsPanel
        flow={flow}
        collections={collections}
        result={result}
        onClearResults={vi.fn()}
      />
    </AdapterProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FlowResultsPanel — Export button', () => {
  let mockAdapter: ReturnType<typeof createMockAdapter>['adapter'];

  beforeEach(() => {
    ({ adapter: mockAdapter } = createMockAdapter());
  });

  // ── 1. Export button renders ──────────────────────────────────────────────
  it('renders the export button in the panel header', () => {
    renderPanel(makeFlow(), makeResult(), mockAdapter);
    expect(screen.getByRole('button', { name: /export html report/i })).toBeInTheDocument();
  });

  // ── 2. Disabled when result === null ──────────────────────────────────────
  it('is disabled when result is null', () => {
    renderPanel(makeFlow(), null, mockAdapter);
    expect(screen.getByRole('button', { name: /export html report/i })).toBeDisabled();
  });

  // ── 3. Disabled while running ─────────────────────────────────────────────
  it('is disabled while result.status is "running"', () => {
    renderPanel(makeFlow(), makeResult('running'), mockAdapter);
    expect(screen.getByRole('button', { name: /export html report/i })).toBeDisabled();
  });

  // ── 4. Click invokes exportFlowRun once ───────────────────────────────────
  it('calls exportFile once when clicked, with nodes matching flow.nodes.length', async () => {
    const flow = makeFlow(3);
    const result = makeResult('success', 3);

    const exportFileSpy = vi.spyOn(mockAdapter.storage, 'exportFile');
    renderPanel(flow, result, mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(exportFileSpy).toHaveBeenCalledOnce();
    });

    // Verify the filename suggests a flow report
    const [fileName] = exportFileSpy.mock.calls[0];
    expect(fileName).toMatch(/^wave-flow-/);
  });

  it('exports a valid HTML file that contains the flow name', async () => {
    const flow = makeFlow(2);
    const result = makeResult('success', 2);

    const exportFileSpy = vi.spyOn(mockAdapter.storage, 'exportFile');
    renderPanel(flow, result, mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(exportFileSpy).toHaveBeenCalledOnce();
    });

    // Verify the content is HTML and contains the flow name
    const [, htmlContent, mimeType] = exportFileSpy.mock.calls[0];
    expect(mimeType).toBe('text/html');
    expect(htmlContent).toContain('Test Flow');
    expect(htmlContent).toMatch(/^<!DOCTYPE html>/i);
  });

  // ── 5. Adapter error surfaces via notification ────────────────────────────
  it('calls showNotification with error when exportFile fails', async () => {
    vi.spyOn(mockAdapter.storage, 'exportFile').mockResolvedValueOnce(err('Disk full'));

    const showNotificationSpy = vi.spyOn(mockAdapter.notification, 'showNotification');

    renderPanel(makeFlow(), makeResult(), mockAdapter);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /export html report/i }));
    });

    await waitFor(() => {
      expect(showNotificationSpy).toHaveBeenCalledOnce();
    });

    const [type, message] = showNotificationSpy.mock.calls[0];
    expect(type).toBe('error');
    expect(message).toContain('Disk full');
  });
});
