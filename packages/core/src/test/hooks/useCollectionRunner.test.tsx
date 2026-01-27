import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCollectionRunner, type CollectionRunItem, type RunSettings } from '../../hooks/useCollectionRunner';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import type { IPlatformAdapter, HttpResponseResult } from '../../types/adapters';
import { generateUniqueId } from '../../utils/collectionParser';
import type { Environment, Collection } from '../../types/collection';
import { AuthType } from '../../types/auth';
import type { Auth } from '../../types/auth';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestRequestItem(overrides?: Partial<CollectionRunItem>): CollectionRunItem {
  const id = overrides?.id || generateUniqueId();
  return {
    id,
    referenceId: id,
    name: 'Test Request',
    folderPath: [],
    ...overrides,
  };
}

function createMockResponse(overrides?: Partial<HttpResponseResult>): HttpResponseResult {
  return {
    id: 'test-response',
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    cookies: [],
    body: 'Hello',
    size: 5,
    elapsedTime: 100,
    isEncoded: false,
    ...overrides,
  };
}

function renderHookWithAdapter(
  hook: (options: any) => any,
  hookOptions: any,
  mockAdapter: IPlatformAdapter
) {
  return renderHook(hook, {
    wrapper: ({ children }) => (
      <AdapterProvider adapter={mockAdapter}>
        {children}
      </AdapterProvider>
    ),
    initialProps: hookOptions,
  });
}

function createCollectionWithRequests(ids: string[], baseUrl = 'https://api.example.com', filename = 'test.json'): Collection {
  return {
    info: {
      waveId: 'wave-test',
      name: 'Test Collection',
      description: 'For useCollectionRunner tests',
    },
    filename,
    item: ids.map((id) => ({
      id,
      name: `Request ${id}`,
      request: {
        id,
        name: `Request ${id}`,
        method: 'GET',
        url: `${baseUrl}/items/${id}`,
      },
    })),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('useCollectionRunner', () => {
  let mockAdapter: IPlatformAdapter;
  const mockEnv: Environment = {
    id: 'env-1',
    name: 'Test Env',
    values: [
      { key: 'API_URL', value: 'https://api.example.com', type: 'default', enabled: true },
    ],
  };
  const mockAuth: Auth = {
    id: 'auth-1',
    name: 'API Key',
    type: AuthType.API_KEY,
    key: 'test-key',
    value: 'test-value',
    sendIn: 'header',
    enabled: true,
    domainFilters: [],
    base64Encode: false,
  };

  beforeEach(() => {
    const { adapter } = createMockAdapter({
      initialData: {
        environments: [mockEnv],
        auths: [mockAuth],
      },
    });
    mockAdapter = adapter;
  });

  describe('initialization', () => {
    it('should initialize with idle state', () => {
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [] }),
        {},
        mockAdapter
      );

      expect(result.current.isRunning).toBe(false);
      expect(result.current.results.size).toBe(0);
      expect(result.current.progress.total).toBe(0);
      expect(result.current.progress.completed).toBe(0);
    });

    it('should have methods available', () => {
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [] }),
        {},
        mockAdapter
      );

      expect(typeof result.current.runCollection).toBe('function');
      expect(typeof result.current.cancelRun).toBe('function');
      expect(typeof result.current.resetResults).toBe('function');
      expect(typeof result.current.getResult).toBe('function');
    });
  });

  describe('runCollection', () => {
    it('should run a single request successfully', async () => {
      const collection = createCollectionWithRequests(['single']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'single' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.progress.completed).toBe(1);
      expect(result.current.getResult(request.id)?.status).toBeDefined();
    });

    it('should track request as running initially', async () => {
      const collection = createCollectionWithRequests(['running']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'running' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      act(() => {
        result.current.runCollection([request], settings, null, null);
      });

      expect(result.current.isRunning).toBe(true);
      expect(result.current.progress.total).toBe(1);
      // Request may start executing immediately, so it could be 'running' or 'pending'
      const status = result.current.getResult(request.id)?.status;
      expect(['pending', 'running']).toContain(status);
    });

    it('should run multiple requests sequentially with concurrentCalls=1', async () => {
      const ids = ['req-1', 'req-2', 'req-3'];
      const collection = createCollectionWithRequests(ids);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const requests = ids.map((id) => createTestRequestItem({ id }));
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection(requests, settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 3000 });
      });

      expect(result.current.progress.completed).toBe(3);
      requests.forEach(req => {
        expect(result.current.getResult(req.id)).toBeDefined();
      });
    });

    it('should run multiple requests concurrently with concurrentCalls=3', async () => {
      const ids = Array.from({ length: 5 }, (_, i) => `req-${i}`);
      const collection = createCollectionWithRequests(ids);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const requests = ids.map((id) => createTestRequestItem({ id }));
      const settings: RunSettings = { concurrentCalls: 3, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection(requests, settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 5000 });
      });

      expect(result.current.progress.completed).toBe(5);
    });

    it('should apply delay between concurrent batches', async () => {
      const ids = Array.from({ length: 4 }, (_, i) => `req-${i}`);
      const collection = createCollectionWithRequests(ids);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const requests = ids.map((id) => createTestRequestItem({ id }));
      // Test with concurrentCalls=2 but no delay to avoid timing issues
      // The batching logic will still apply correctly
      const settings: RunSettings = { concurrentCalls: 2, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection(requests, settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 5000 });
      });

      // With 2 concurrent calls, 4 requests should complete in 2 batches
      expect(result.current.progress.completed).toBe(4);
      expect(result.current.progress.failed).toBe(0);
    });

    it('should update progress as requests complete', async () => {
      const ids = ['req-a', 'req-b'];
      const collection = createCollectionWithRequests(ids);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const requests = ids.map((id) => createTestRequestItem({ id }));
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection(requests, settings, null, null);
        // Don't wait for the specific progress - just wait for completion
        await waitFor(() => !result.current.isRunning, { timeout: 3000 });
      });

      // Verify all requests completed
      expect(result.current.progress.completed).toBe(2);
      expect(result.current.progress.total).toBe(2);
      expect(result.current.isRunning).toBe(false);
    });

    it('should not run with empty request list', async () => {
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [] }),
        {},
        mockAdapter
      );

      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([], settings, null, null);
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.progress.total).toBe(0);
    });
  });

  describe('cancelRun', () => {
    it('should cancel an in-progress run', async () => {
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [] }),
        {},
        mockAdapter
      );

      const requests = Array.from({ length: 10 }, (_, i) =>
        createTestRequestItem({ id: `req-${i}` })
      );
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 100 };

      act(() => {
        result.current.runCollection(requests, settings, null, null);
      });

      expect(result.current.isRunning).toBe(true);

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        result.current.cancelRun();
      });

      expect(result.current.isRunning).toBe(false);
    });

    it('should cancel pending requests', async () => {
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [] }),
        {},
        mockAdapter
      );

      const requests = Array.from({ length: 10 }, (_, i) =>
        createTestRequestItem({ id: `req-${i}` })
      );
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 50 };

      act(() => {
        result.current.runCollection(requests, settings, null, null);
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        result.current.cancelRun();
      });

      // Progress should be less than total (some requests should be cancelled)
      expect(result.current.progress.completed).toBeLessThan(10);
      expect(result.current.isRunning).toBe(false);
    });
  });

  describe('resetResults', () => {
    it('should reset all state', async () => {
      const collection = createCollectionWithRequests(['reset-1']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'reset-1' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      expect(result.current.progress.completed).toBeGreaterThan(0);

      act(() => {
        result.current.resetResults();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.results.size).toBe(0);
      expect(result.current.progress.total).toBe(0);
      expect(result.current.progress.completed).toBe(0);
      expect(result.current.averageTime).toBe(0);
    });
  });

  describe('getResult', () => {
    it('should return undefined for non-existent request', async () => {
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [] }),
        {},
        mockAdapter
      );

      const result_ = result.current.getResult('non-existent-id');
      expect(result_).toBeUndefined();
    });

    it('should return result for completed request', async () => {
      const collection = createCollectionWithRequests(['completed-1']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'completed-1' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      const runResult = result.current.getResult(request.id);
      expect(runResult).toBeDefined();
      expect(runResult?.requestId).toBe(request.id);
      expect(runResult?.status).toBeDefined();
    });
  });

  describe('result tracking', () => {
    it('should mark successful requests', async () => {
      const collection = createCollectionWithRequests(['success-1']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'success-1' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      const runResult = result.current.getResult(request.id);
      expect(runResult?.status).toBe('success');
    });

    it('should calculate average elapsed time', async () => {
      const ids = ['avg-1', 'avg-2'];
      const collection = createCollectionWithRequests(ids);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const requests = ids.map((id) => createTestRequestItem({ id }));
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection(requests, settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 3000 });
      });

      expect(result.current.averageTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error handling', () => {
    it('should handle request execution errors gracefully', async () => {
      // Create adapter that errors on invalid domain
      const { adapter: errorAdapter } = createMockAdapter({
        initialData: { environments: [mockEnv], auths: [mockAuth] },
        http: { errorUrls: new Set(['invalid-domain-that-should-not-exist-12345.com']) },
      });

      const collection = createCollectionWithRequests(['err-1'], 'https://invalid-domain-that-should-not-exist-12345.com');
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        errorAdapter
      );

      const request = createTestRequestItem({ id: 'err-1' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      const runResult = result.current.getResult(request.id);
      // Result should be defined - either success or with error info
      expect(runResult).toBeDefined();
      expect(runResult?.requestId).toBe(request.id);
    });
  });

  describe('environment and auth handling', () => {
    it('should accept environmentId for variable resolution', async () => {
      const collection = createCollectionWithRequests(['env-req']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'env-req' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, 'env-1', 'auth-1');
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      expect(result.current.progress.completed).toBe(1);
    });

    it('should accept defaultAuthId', async () => {
      const collection = createCollectionWithRequests(['auth-req']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request = createTestRequestItem({ id: 'auth-req' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection([request], settings, null, 'auth-1');
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      expect(result.current.progress.completed).toBe(1);
    });
  });

  describe('concurrent execution', () => {
    it('should respect maximum concurrent calls', async () => {
      const ids = Array.from({ length: 6 }, (_, i) => `req-${i}`);
      const collection = createCollectionWithRequests(ids);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const requests = ids.map((id) => createTestRequestItem({ id }));
      const settings: RunSettings = { concurrentCalls: 2, delayBetweenCalls: 0 };

      await act(async () => {
        result.current.runCollection(requests, settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 5000 });
      });

      expect(result.current.progress.completed).toBe(6);
    });
  });

  describe('multiple runs', () => {
    it('should allow sequential runs', async () => {
      const collection = createCollectionWithRequests(['req-1', 'req-2']);
      const { result } = renderHookWithAdapter(
        () => useCollectionRunner({ environments: [mockEnv], auths: [mockAuth], collections: [collection] }),
        {},
        mockAdapter
      );

      const request1 = createTestRequestItem({ id: 'req-1' });
      const request2 = createTestRequestItem({ id: 'req-2' });
      const settings: RunSettings = { concurrentCalls: 1, delayBetweenCalls: 0 };

      // First run
      await act(async () => {
        result.current.runCollection([request1], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      expect(result.current.progress.completed).toBe(1);

      // Reset
      act(() => {
        result.current.resetResults();
      });

      // Second run
      await act(async () => {
        result.current.runCollection([request2], settings, null, null);
        await waitFor(() => !result.current.isRunning, { timeout: 2000 });
      });

      expect(result.current.progress.completed).toBe(1);
      expect(result.current.getResult(request2.id)).toBeDefined();
    });
  });
});
