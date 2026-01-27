import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTestSuiteRunner } from '../../hooks/useTestSuiteRunner';
import type {
  UseTestSuiteRunnerOptions,
  RunTestSuiteOptions,
} from '../../hooks/useTestSuiteRunner';
import type {
  TestSuite,
  RequestTestItem,
  FlowTestItem,
  TestCase,
} from '../../types/testSuite';
import type { Environment } from '../../types/collection';
import type { Auth } from '../../types/auth';
import { AuthType } from '../../types/auth';
import type { Collection, CollectionItem } from '../../types/collection';
import type { Flow, FlowNode, FlowConnector } from '../../types/flow';
import type { IPlatformAdapter } from '../../types/adapters';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import { generateUniqueId } from '../../utils/collectionParser';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestRequestItem(overrides?: Partial<RequestTestItem>): RequestTestItem {
  const id = overrides?.id || generateUniqueId();
  return {
    id,
    type: 'request',
    referenceId: overrides?.referenceId || `req-${id}`,
    name: 'Test Request Item',
    order: 0,
    enabled: true,
    ...overrides,
  };
}

function createTestFlowItem(overrides?: Partial<FlowTestItem>): FlowTestItem {
  const id = overrides?.id || generateUniqueId();
  return {
    id,
    type: 'flow',
    referenceId: overrides?.referenceId || `flow-${id}`,
    name: 'Test Flow Item',
    order: 0,
    enabled: true,
    ...overrides,
  };
}

function createTestCase(overrides?: Partial<TestCase>): TestCase {
  return {
    id: generateUniqueId(),
    name: 'Test Case',
    order: 0,
    enabled: true,
    data: {},
    ...overrides,
  };
}

function createTestSuite(overrides?: Partial<TestSuite>): TestSuite {
  return {
    id: generateUniqueId(),
    name: 'Test Suite',
    description: 'A test suite',
    items: [],
    settings: {
      concurrentCalls: 1,
      delayBetweenCalls: 0,
      stopOnFailure: false,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createTestCollectionItem(overrides?: Partial<CollectionItem>): CollectionItem {
  const id = overrides?.id || generateUniqueId();
  const name = overrides?.name || 'Test Request';
  return {
    id,
    name,
    request: {
      id,
      name,
      method: 'GET',
      url: 'https://api.example.com/test',
      header: [],
    },
    ...overrides,
  };
}

function createTestCollection(items: CollectionItem[] = []): Collection {
  return {
    info: {
      name: 'Test Collection',
      schema: '',
      waveId: generateUniqueId(),
    },
    item: items.length > 0 ? items : [createTestCollectionItem()],
    filename: 'test-collection.json',
  };
}

function createTestFlowNode(overrides?: Partial<FlowNode>): FlowNode {
  return {
    id: generateUniqueId(),
    alias: 'Node',
    requestId: 'req-1',
    name: 'Test Request',
    method: 'GET',
    position: { x: 100, y: 100 },
    ...overrides,
  };
}

function createTestFlowConnector(overrides?: Partial<FlowConnector>): FlowConnector {
  return {
    id: generateUniqueId(),
    sourceNodeId: 'node-1',
    targetNodeId: 'node-2',
    condition: 'success',
    ...overrides,
  };
}

function createTestFlow(overrides?: Partial<Flow>): Flow {
  const node1 = createTestFlowNode({ id: 'node-1', alias: 'Start', requestId: 'req-1' });
  const node2 = createTestFlowNode({ id: 'node-2', alias: 'Next', requestId: 'req-2' });

  return {
    id: generateUniqueId(),
    name: 'Test Flow',
    description: 'Test flow',
    nodes: [node1, node2],
    connectors: [
      createTestFlowConnector({
        sourceNodeId: 'node-1',
        targetNodeId: 'node-2',
        condition: 'success',
      }),
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
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

// ============================================================================
// Tests
// ============================================================================

describe('useTestSuiteRunner', () => {
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
    it('should initialize with default state', () => {
      const suite = createTestSuite();
      const collection = createTestCollection();

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      expect(result.current.isRunning).toBe(false);
      expect(result.current.result).toBeNull();
      expect(result.current.runningItemIds.size).toBe(0);
    });

    it('should have required methods', () => {
      const suite = createTestSuite();
      const collection = createTestCollection();

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      expect(typeof result.current.runTestSuite).toBe('function');
      expect(typeof result.current.cancelTestSuite).toBe('function');
      expect(typeof result.current.resetTestSuite).toBe('function');
      expect(typeof result.current.getItemResult).toBe('function');
    });
  });

  describe('runTestSuite', () => {
    it('should run a test suite with a single request item', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'req-1',
      });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.total).toBe(1);
      expect(result.current.result?.progress.completed).toBe(1);
      expect(result.current.result?.progress.passed).toBe(1);
    });

    it('should run a test suite with multiple request items', async () => {
      const req1 = createTestCollectionItem({ id: 'req-1' });
      const req2 = createTestCollectionItem({ id: 'req-2' });
      const collection = createTestCollection([req1, req2]);
      
      const item1 = createTestRequestItem({ id: 'item-1', referenceId: 'req-1', order: 0 });
      const item2 = createTestRequestItem({ id: 'item-2', referenceId: 'req-2', order: 1 });
      const suite = createTestSuite({
        items: [item1, item2],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.total).toBe(2);
      expect(result.current.result?.progress.completed).toBe(2);
    });

    it('should run a test suite with a flow item', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const flow = createTestFlow({
        id: 'flow-1',
        nodes: [createTestFlowNode({ id: 'node-1', requestId: 'req-1' })],
        connectors: [],
      });
      
      const testItem = createTestFlowItem({
        id: 'item-1',
        referenceId: 'flow-1',
      });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [flow],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.total).toBe(1);
      expect(result.current.result?.progress.completed).toBe(1);
    });

    it('should run a test suite with mixed request and flow items', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const flow = createTestFlow({
        id: 'flow-1',
        nodes: [createTestFlowNode({ id: 'node-1', requestId: 'req-1' })],
        connectors: [],
      });
      
      const reqTestItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'req-1',
        order: 0,
      });
      const flowTestItem = createTestFlowItem({
        id: 'item-2',
        referenceId: 'flow-1',
        order: 1,
      });
      
      const suite = createTestSuite({
        items: [reqTestItem, flowTestItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [flow],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.total).toBe(2);
      expect(result.current.result?.progress.completed).toBe(2);
    });

    it('should handle empty test suite', async () => {
      const collection = createTestCollection();
      const suite = createTestSuite({
        items: [],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.total).toBe(0);
      expect(result.current.result?.progress.completed).toBe(0);
    });

    it('should only run enabled items', async () => {
      const req1 = createTestCollectionItem({ id: 'req-1' });
      const req2 = createTestCollectionItem({ id: 'req-2' });
      const collection = createTestCollection([req1, req2]);
      
      const item1 = createTestRequestItem({ id: 'item-1', referenceId: 'req-1', enabled: true });
      const item2 = createTestRequestItem({ id: 'item-2', referenceId: 'req-2', enabled: false });
      const suite = createTestSuite({
        items: [item1, item2],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.progress.total).toBe(1);
      expect(result.current.result?.progress.completed).toBe(1);
    });

    it('should respect item order', async () => {
      const req1 = createTestCollectionItem({ id: 'req-1' });
      const req2 = createTestCollectionItem({ id: 'req-2' });
      const collection = createTestCollection([req1, req2]);
      
      const item1 = createTestRequestItem({ id: 'item-1', referenceId: 'req-1', order: 2 });
      const item2 = createTestRequestItem({ id: 'item-2', referenceId: 'req-2', order: 1 });
      const suite = createTestSuite({
        items: [item1, item2], // item1 has higher order, should run second
        settings: {
          concurrentCalls: 1,
          delayBetweenCalls: 0,
          stopOnFailure: false,
        },
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.progress.completed).toBe(2);
    });

    it('should track progress as items complete', async () => {
      const req1 = createTestCollectionItem({ id: 'req-1' });
      const req2 = createTestCollectionItem({ id: 'req-2' });
      const collection = createTestCollection([req1, req2]);
      
      const item1 = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const item2 = createTestRequestItem({ id: 'item-2', referenceId: 'req-2' });
      const suite = createTestSuite({
        items: [item1, item2],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.progress.total).toBe(2);
      expect(result.current.result?.progress.completed).toBe(2);
      expect(result.current.isRunning).toBe(false);
    });

    it('should accept environmentId option', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      const options: RunTestSuiteOptions = {
        environmentId: 'env-1',
      };

      await act(async () => {
        await result.current.runTestSuite(suite, options);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.completed).toBe(1);
    });

    it('should accept defaultAuthId option', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      const options: RunTestSuiteOptions = {
        defaultAuthId: 'auth-1',
      };

      await act(async () => {
        await result.current.runTestSuite(suite, options);
      });

      expect(result.current.result?.status).toBe('success');
      expect(result.current.result?.progress.completed).toBe(1);
    });

    it('should use suite defaults when options not provided', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
        defaultEnvId: 'env-1',
        defaultAuthId: 'auth-1',
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
    });

    it('should respect concurrentCalls setting', async () => {
      const items = Array.from({ length: 4 }, (_, i) =>
        createTestCollectionItem({ id: `req-${i}` })
      );
      const collection = createTestCollection(items);
      
      const testItems = items.map((item, i) =>
        createTestRequestItem({ id: `item-${i}`, referenceId: item.id })
      );
      const suite = createTestSuite({
        items: testItems,
        settings: {
          concurrentCalls: 2,
          delayBetweenCalls: 0,
          stopOnFailure: false,
        },
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.progress.completed).toBe(4);
    });

    it('should handle stopOnFailure setting', async () => {
      // Create adapter that errors on specific URL
      const { adapter: errorAdapter } = createMockAdapter({
        initialData: { environments: [mockEnv], auths: [mockAuth] },
        http: { errorUrls: new Set(['https://api.example.com/fail']) },
      });

      const req1 = createTestCollectionItem({ id: 'req-1', request: { id: 'req-1', name: 'Request 1', method: 'GET', url: 'https://api.example.com/success' } });
      const req2 = createTestCollectionItem({ id: 'req-2', request: { id: 'req-2', name: 'Request 2', method: 'GET', url: 'https://api.example.com/fail' } });
      const req3 = createTestCollectionItem({ id: 'req-3', request: { id: 'req-3', name: 'Request 3', method: 'GET', url: 'https://api.example.com/success' } });
      const collection = createTestCollection([req1, req2, req3]);
      
      const item1 = createTestRequestItem({ id: 'item-1', referenceId: 'req-1', order: 0 });
      const item2 = createTestRequestItem({ id: 'item-2', referenceId: 'req-2', order: 1 });
      const item3 = createTestRequestItem({ id: 'item-3', referenceId: 'req-3', order: 2 });
      
      const suite = createTestSuite({
        items: [item1, item2, item3],
        settings: {
          concurrentCalls: 1,
          delayBetweenCalls: 0,
          stopOnFailure: true,
        },
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        errorAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      // Should stop after second item fails
      expect(result.current.result?.progress.completed).toBeLessThan(3);
      expect(result.current.result?.progress.failed).toBeGreaterThan(0);
    });
  });

  describe('test cases', () => {
    it('should execute multiple test cases for a single request', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testCase1 = createTestCase({ id: 'tc-1', name: 'Case 1', order: 0 });
      const testCase2 = createTestCase({ id: 'tc-2', name: 'Case 2', order: 1 });
      
      const testItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'req-1',
        testCases: [testCase1, testCase2],
      });
      
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult).toBeDefined();
      expect(itemResult?.testCaseResults?.size).toBe(2);
    });

    it('should only execute enabled test cases', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testCase1 = createTestCase({ id: 'tc-1', enabled: true });
      const testCase2 = createTestCase({ id: 'tc-2', enabled: false });
      
      const testItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'req-1',
        testCases: [testCase1, testCase2],
      });
      
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult?.testCaseResults?.size).toBe(1);
    });

    it('should execute request without test cases', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'req-1',
        testCases: [],
      });
      
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult).toBeDefined();
      expect(itemResult?.status).toBe('success');
    });

    it('should respect test case order', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testCase1 = createTestCase({ id: 'tc-1', order: 2 });
      const testCase2 = createTestCase({ id: 'tc-2', order: 1 });
      
      const testItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'req-1',
        testCases: [testCase1, testCase2],
      });
      
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult?.testCaseResults?.size).toBe(2);
    });
  });

  describe('cancelTestSuite', () => {
    it('should cancel a running test suite', async () => {
      const items = Array.from({ length: 5 }, (_, i) =>
        createTestCollectionItem({ id: `req-${i}` })
      );
      const collection = createTestCollection(items);
      
      const testItems = items.map((item, i) =>
        createTestRequestItem({ id: `item-${i}`, referenceId: item.id })
      );
      const suite = createTestSuite({
        items: testItems,
        settings: {
          concurrentCalls: 1,
          delayBetweenCalls: 100,
          stopOnFailure: false,
        },
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      act(() => {
        result.current.runTestSuite(suite);
      });

      expect(result.current.isRunning).toBe(true);

      await act(async () => {
        result.current.cancelTestSuite();
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.result?.status).toBe('cancelled');
    });

    it('should mark result as cancelled', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      act(() => {
        result.current.runTestSuite(suite);
      });

      await act(async () => {
        result.current.cancelTestSuite();
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      expect(result.current.result?.status).toBe('cancelled');
      expect(result.current.result?.error).toContain('cancelled');
    });
  });

  describe('resetTestSuite', () => {
    it('should reset all state', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result).toBeDefined();

      act(() => {
        result.current.resetTestSuite();
      });

      expect(result.current.isRunning).toBe(false);
      expect(result.current.result).toBeNull();
      expect(result.current.runningItemIds.size).toBe(0);
    });
  });

  describe('getItemResult', () => {
    it('should return undefined for non-existent item', () => {
      const collection = createTestCollection();
      const suite = createTestSuite();

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      const itemResult = result.current.getItemResult('non-existent-id');
      expect(itemResult).toBeUndefined();
    });

    it('should return result for completed item', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult).toBeDefined();
      expect(itemResult?.itemId).toBe('item-1');
      expect(itemResult?.type).toBe('request');
    });
  });

  describe('error handling', () => {
    it('should handle failed requests', async () => {
      const { adapter: errorAdapter } = createMockAdapter({
        initialData: { environments: [mockEnv], auths: [mockAuth] },
        http: { errorUrls: new Set(['https://api.example.com/fail']) },
      });

      const requestItem = createTestCollectionItem({
        id: 'req-1',
        request: { id: 'req-1', name: 'Fail Request', method: 'GET', url: 'https://api.example.com/fail' },
      });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        errorAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('failed');
      expect(result.current.result?.progress.failed).toBeGreaterThan(0);
    });

    it('should handle missing request reference', async () => {
      const collection = createTestCollection([]);
      
      const testItem = createTestRequestItem({
        id: 'item-1',
        referenceId: 'non-existent-req',
      });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult).toBeDefined();
      // The executor should handle missing references gracefully
    });

    it('should handle missing flow reference', async () => {
      const collection = createTestCollection();
      
      const testItem = createTestFlowItem({
        id: 'item-1',
        referenceId: 'non-existent-flow',
      });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      const itemResult = result.current.getItemResult('item-1');
      expect(itemResult).toBeDefined();
    });
  });

  describe('result tracking', () => {
    it('should track average time', async () => {
      const req1 = createTestCollectionItem({ id: 'req-1' });
      const req2 = createTestCollectionItem({ id: 'req-2' });
      const collection = createTestCollection([req1, req2]);
      
      const item1 = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const item2 = createTestRequestItem({ id: 'item-2', referenceId: 'req-2' });
      const suite = createTestSuite({
        items: [item1, item2],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.averageTime).toBeGreaterThanOrEqual(0);
    });

    it('should include timing information', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.startedAt).toBeDefined();
      expect(result.current.result?.completedAt).toBeDefined();
    });
  });

  describe('multiple runs', () => {
    it('should allow sequential runs', async () => {
      const requestItem = createTestCollectionItem({ id: 'req-1' });
      const collection = createTestCollection([requestItem]);
      
      const testItem = createTestRequestItem({ id: 'item-1', referenceId: 'req-1' });
      const suite = createTestSuite({
        items: [testItem],
      });

      const { result } = renderHookWithAdapter(
        (options: UseTestSuiteRunnerOptions) => useTestSuiteRunner(options),
        {
          suiteId: suite.id,
          environments: [mockEnv],
          auths: [mockAuth],
          collections: [collection],
          flows: [],
        },
        mockAdapter
      );

      // First run
      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');

      // Reset
      act(() => {
        result.current.resetTestSuite();
      });

      expect(result.current.result).toBeNull();

      // Second run
      await act(async () => {
        await result.current.runTestSuite(suite);
      });

      expect(result.current.result?.status).toBe('success');
    });
  });
});
