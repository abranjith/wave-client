/**
 * Test Suite Runner Hook V2
 * 
 * Manages execution of a TestSuite using the executor pattern:
 * - HttpRequestExecutor: For individual request execution with test case overrides
 * - FlowExecutor: For flow execution within test suites
 * - BatchExecutor: For concurrency control
 * 
 * This hook handles:
 * - Test case iteration (data-driven testing)
 * - Progress tracking and state management
 * - Cancellation
 * 
 * Uses global state (Zustand) for cross-component state sharing.
 */

import { useCallback, useRef, useMemo } from 'react';
import { useHttpAdapter } from './useAdapter';
import useAppStateStore from './store/useAppStateStore';
import type { Environment, Collection } from '../types/collection';
import type { Auth } from './store/createAuthSlice';
import type { Flow } from '../types/flow';
import type {
    TestSuite,
    TestItem,
    TestSuiteRunResult,
    TestItemResult,
    RequestTestItem,
    FlowTestItem,
    RequestTestItemResult,
    FlowTestItemResult,
    TestItemStatus,
    TestValidationStatus,
    TestCase,
    TestCaseResult,
} from '../types/testSuite';
import { isRequestTestItem, createEmptyTestSuiteRunResult } from '../types/testSuite';
import { httpRequestExecutor } from '../utils/executors/httpRequestExecutor';
import { flowExecutor } from '../utils/executors/flowExecutor';
import {
    ExecutionContext,
    HttpExecutionInput,
    HttpExecutionResult,
    FlowExecutionInput,
    FlowExecutionConfig,
    RequestOverrides,
} from '../utils/executors/types';
import {
    createBatchExecutor,
    type BatchExecutor,
    type BatchExecutorCallbacks,
    type ResultStatusExtractor,
} from '../utils/batchExecutor';

// ============================================================================
// Types
// ============================================================================

export interface UseTestSuiteRunnerV2Options {
    /** Test suite ID being executed (required for global state tracking) */
    suiteId: string;
    /** Available environments for variable resolution */
    environments: Environment[];
    /** Available auth configurations */
    auths: Auth[];
    /** Available collections (to look up request details) */
    collections: Collection[];
    /** Available flows (to look up flow details) */
    flows: Flow[];
}

export interface RunTestSuiteOptions {
    /** Environment ID for variable resolution */
    environmentId?: string;
    /** Default auth ID for requests without specific auth */
    defaultAuthId?: string;
}

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_TEST_SUITE_RUN_STATE = {
    isRunning: false,
    result: null,
    runningItemIds: new Set<string>(),
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert HttpExecutionResult status to TestItemStatus
 */
function toTestItemStatus(execStatus: HttpExecutionResult['status']): TestItemStatus {
    switch (execStatus) {
        case 'success': return 'success';
        case 'failed': return 'failed';
        case 'cancelled': return 'skipped';
        case 'skipped': return 'skipped';
        default: return 'failed';
    }
}

/**
 * Convert validation status
 */
function toTestValidationStatus(validationStatus: HttpExecutionResult['validationStatus']): TestValidationStatus {
    switch (validationStatus) {
        case 'pass': return 'pass';
        case 'fail': return 'fail';
        case 'pending': return 'pending';
        default: return 'idle';
    }
}

/**
 * Convert test case data to RequestOverrides
 */
function testCaseToOverrides(testCase: TestCase): RequestOverrides {
    const data = testCase.data || {};
    return {
        headers: data.headers,
        params: data.params,
        body: data.body,
        variables: data.variables,
        authId: data.authId,
        validation: testCase.validation,
    };
}

/**
 * Check if a result is "passed" for progress
 */
function isItemPassed(result: TestItemResult): boolean {
    return result.status === 'success' && result.validationStatus !== 'fail';
}

/**
 * Extract status from TestItemResult for BatchExecutor progress tracking
 */
const extractTestItemStatus: ResultStatusExtractor<TestItemResult> = (result) => {
    const statusMap: Record<TestItemStatus, 'success' | 'failed' | 'skipped' | 'cancelled'> = {
        'idle': 'skipped',
        'pending': 'skipped',
        'running': 'skipped',
        'success': 'success',
        'failed': 'failed',
        'skipped': 'skipped',
    };
    
    const validationMap: Record<TestValidationStatus, 'idle' | 'pending' | 'pass' | 'fail'> = {
        'idle': 'idle',
        'pending': 'pending',
        'pass': 'pass',
        'fail': 'fail',
    };
    
    return {
        status: statusMap[result.status] || 'failed',
        validationStatus: validationMap[result.validationStatus] || 'idle',
    };
};

// ============================================================================
// Hook
// ============================================================================

export function useTestSuiteRunnerV2({
    suiteId,
    environments,
    auths,
    collections,
    flows,
}: UseTestSuiteRunnerV2Options) {
    const httpAdapter = useHttpAdapter();
    
    // Global state management
    const state = useAppStateStore((s) => s.testSuiteRunStates[suiteId] || DEFAULT_TEST_SUITE_RUN_STATE);
    const setTestSuiteRunState = useAppStateStore((s) => s.setTestSuiteRunState);
    const clearTestSuiteRunState = useAppStateStore((s) => s.clearTestSuiteRunState);
    
    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const environmentIdRef = useRef<string | null>(null);
    const defaultAuthIdRef = useRef<string | null>(null);
    const batchExecutorRef = useRef<BatchExecutor<TestItem, TestItemResult> | null>(null);
    
    // Memoize executor instances
    const httpExecutor = useMemo(() => httpRequestExecutor, []);
    const flowExec = useMemo(() => flowExecutor, []);
    
    /**
     * Create execution context
     */
    const createContext = useCallback((): ExecutionContext => ({
        httpAdapter,
        environments,
        auths,
        collections,
        flows,
        environmentId: environmentIdRef.current,
        defaultAuthId: defaultAuthIdRef.current,
        isCancelled: () => isCancelledRef.current,
    }), [httpAdapter, environments, auths, collections, flows]);
    
    /**
     * Execute a single request item (with test cases support)
     */
    const executeRequestItem = useCallback(async (
        item: RequestTestItem
    ): Promise<RequestTestItemResult> => {
        const startedAt = new Date().toISOString();
        const context = createContext();
        
        // Get enabled test cases
        const enabledTestCases = (item.testCases || []).filter(tc => tc.enabled);
        
        // If no test cases, run once with defaults
        if (enabledTestCases.length === 0) {
            const input: HttpExecutionInput = {
                referenceId: item.referenceId,
                executionId: `${item.id}-default-${Date.now()}`,
                validation: item.validation,
            };
            
            const execResult = await httpExecutor.execute(input, context);
            
            return {
                itemId: item.id,
                type: 'request',
                status: toTestItemStatus(execResult.status),
                validationStatus: toTestValidationStatus(execResult.validationStatus),
                response: execResult.response,
                error: execResult.error,
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        // Execute each test case
        const testCaseResults = new Map<string, TestCaseResult>();
        let overallStatus: TestItemStatus = 'success';
        let overallValidationStatus: TestValidationStatus = 'pass';
        let lastResponse = undefined as typeof testCaseResults extends Map<string, TestCaseResult> ? TestCaseResult['response'] : never;
        let lastError: string | undefined;
        
        for (const testCase of enabledTestCases.sort((a, b) => a.order - b.order)) {
            if (isCancelledRef.current) {
                testCaseResults.set(testCase.id, {
                    testCaseId: testCase.id,
                    testCaseName: testCase.name,
                    status: 'skipped',
                    validationStatus: 'idle',
                    startedAt: new Date().toISOString(),
                    completedAt: new Date().toISOString(),
                });
                continue;
            }
            
            const caseStartedAt = new Date().toISOString();
            const overrides = testCaseToOverrides(testCase);
            
            const input: HttpExecutionInput = {
                referenceId: item.referenceId,
                executionId: `${item.id}-${testCase.id}-${Date.now()}`,
                validation: testCase.validation || item.validation,
            };
            
            const execResult = await httpExecutor.execute(input, context, overrides);
            
            const caseStatus = toTestItemStatus(execResult.status);
            const caseValidation = toTestValidationStatus(execResult.validationStatus);
            
            testCaseResults.set(testCase.id, {
                testCaseId: testCase.id,
                testCaseName: testCase.name,
                status: caseStatus,
                validationStatus: caseValidation,
                response: execResult.response,
                error: execResult.error,
                startedAt: caseStartedAt,
                completedAt: new Date().toISOString(),
            });
            
            // Track last response/error
            if (execResult.response) {
                lastResponse = execResult.response;
            }
            if (execResult.error) {
                lastError = execResult.error;
            }
            
            // Aggregate status (any failure = overall failure)
            if (caseStatus === 'failed') {
                overallStatus = 'failed';
            }
            if (caseValidation === 'fail') {
                overallValidationStatus = 'fail';
            }
        }
        
        return {
            itemId: item.id,
            type: 'request',
            status: overallStatus,
            validationStatus: overallValidationStatus,
            response: lastResponse,
            error: lastError,
            startedAt,
            completedAt: new Date().toISOString(),
            testCaseResults,
        };
    }, [createContext, httpExecutor]);
    
    /**
     * Execute a flow test item
     */
    const executeFlowItem = useCallback(async (
        item: FlowTestItem
    ): Promise<FlowTestItemResult> => {
        const startedAt = new Date().toISOString();
        const context = createContext();
        
        const input: FlowExecutionInput = {
            flowId: item.referenceId,
            executionId: `${item.id}-${Date.now()}`,
        };
        
        const config: FlowExecutionConfig = {
            parallel: true, // Could be made configurable
            defaultAuthId: defaultAuthIdRef.current || undefined,
        };
        
        const execResult = await flowExec.execute(input, context, config);
        
        return {
            itemId: item.id,
            type: 'flow',
            status: execResult.status === 'success' ? 'success' :
                   execResult.status === 'cancelled' ? 'skipped' : 'failed',
            validationStatus: toTestValidationStatus(execResult.validationStatus),
            flowResult: execResult.flowRunResult,
            error: execResult.error,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }, [createContext, flowExec]);
    
    /**
     * Update state helper
     */
    const updateRunState = useCallback((
        updater: (prev: TestSuiteRunResult) => TestSuiteRunResult
    ) => {
        const currentState = useAppStateStore.getState().testSuiteRunStates[suiteId];
        if (currentState?.result) {
            setTestSuiteRunState(suiteId, {
                ...currentState,
                result: updater(currentState.result),
            });
        }
    }, [suiteId, setTestSuiteRunState]);
    
    /**
     * Run the test suite
     */
    const runTestSuite = useCallback(async (
        suite: TestSuite,
        options: RunTestSuiteOptions = {}
    ): Promise<TestSuiteRunResult> => {
        const { environmentId, defaultAuthId } = options;
        
        // Get enabled items sorted by order
        const enabledItems = suite.items
            .filter(item => item.enabled)
            .sort((a, b) => a.order - b.order);
        
        if (enabledItems.length === 0) {
            const emptyResult = createEmptyTestSuiteRunResult(suite.id);
            emptyResult.status = 'success';
            emptyResult.completedAt = new Date().toISOString();
            
            setTestSuiteRunState(suiteId, {
                isRunning: false,
                result: emptyResult,
                runningItemIds: new Set(),
            });
            
            return emptyResult;
        }
        
        // Initialize refs
        isCancelledRef.current = false;
        environmentIdRef.current = environmentId || suite.defaultEnvId || null;
        defaultAuthIdRef.current = defaultAuthId || suite.defaultAuthId || null;
        
        // Create batch executor
        batchExecutorRef.current = createBatchExecutor<TestItem, TestItemResult>();
        
        // Initialize result
        const initialResult: TestSuiteRunResult = {
            suiteId: suite.id,
            status: 'running',
            itemResults: new Map(),
            startedAt: new Date().toISOString(),
            progress: {
                total: enabledItems.length,
                completed: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
            },
            averageTime: 0,
        };
        
        // Initialize all items as idle
        for (const item of enabledItems) {
            initialResult.itemResults.set(item.id, {
                itemId: item.id,
                type: item.type,
                status: 'idle',
                validationStatus: 'idle',
            } as TestItemResult);
        }
        
        setTestSuiteRunState(suiteId, {
            isRunning: true,
            result: initialResult,
            runningItemIds: new Set(),
        });
        
        // Polymorphic executor - routes to request or flow executor based on item type
        const executeItem = async (item: TestItem): Promise<TestItemResult> => {
            if (isRequestTestItem(item)) {
                return executeRequestItem(item);
            } else {
                return executeFlowItem(item as FlowTestItem);
            }
        };
        
        // Track all results for average time calculation
        const allResults: TestItemResult[] = [];
        
        // Callbacks for state updates
        const callbacks: BatchExecutorCallbacks<TestItemResult> = {
            onItemStart: (itemId) => {
                // Mark item as running in state
                updateRunState(prev => {
                    const newResults = new Map(prev.itemResults);
                    const existing = newResults.get(itemId);
                    if (existing) {
                        newResults.set(itemId, {
                            ...existing,
                            status: 'running',
                            validationStatus: 'pending',
                        });
                    }
                    return { ...prev, itemResults: newResults };
                });
                
                // Update running item IDs
                const currentState = useAppStateStore.getState().testSuiteRunStates[suiteId];
                if (currentState) {
                    const newRunningIds = new Set(currentState.runningItemIds);
                    newRunningIds.add(itemId);
                    setTestSuiteRunState(suiteId, {
                        ...currentState,
                        runningItemIds: newRunningIds,
                    });
                }
            },
            onItemComplete: (result) => {
                allResults.push(result);
                
                // Update item result in state
                updateRunState(prev => {
                    const newResults = new Map(prev.itemResults);
                    newResults.set(result.itemId, result);
                    
                    const completed = prev.progress.completed + 1;
                    const passed = prev.progress.passed + (isItemPassed(result) ? 1 : 0);
                    const failed = prev.progress.failed + (result.status === 'failed' ? 1 : 0);
                    
                    // Calculate average time
                    const timings = allResults
                        .filter(r => r.type === 'request' && (r as RequestTestItemResult).response?.elapsedTime)
                        .map(r => (r as RequestTestItemResult).response!.elapsedTime!);
                    const avgTime = timings.length > 0 
                        ? timings.reduce((a, b) => a + b, 0) / timings.length 
                        : 0;
                    
                    return {
                        ...prev,
                        itemResults: newResults,
                        progress: { ...prev.progress, completed, passed, failed },
                        averageTime: avgTime,
                    };
                });
                
                // Remove from running item IDs
                const currentState = useAppStateStore.getState().testSuiteRunStates[suiteId];
                if (currentState) {
                    const newRunningIds = new Set(currentState.runningItemIds);
                    newRunningIds.delete(result.itemId);
                    setTestSuiteRunState(suiteId, {
                        ...currentState,
                        runningItemIds: newRunningIds,
                    });
                }
            },
        };
        
        // Execute using BatchExecutor
        const { settings } = suite;
        const batchResult = await batchExecutorRef.current!.execute(
            enabledItems,
            executeItem,
            {
                concurrentCalls: settings.concurrentCalls,
                delayBetweenCalls: settings.delayBetweenCalls,
                stopOnFailure: settings.stopOnFailure,
            },
            () => isCancelledRef.current,
            extractTestItemStatus,
            callbacks
        );
        
        // Handle skipped items if stopped on failure
        if (batchResult.stoppedOnFailure) {
            const completedIds = new Set(allResults.map(r => r.itemId));
            for (const item of enabledItems) {
                if (!completedIds.has(item.id)) {
                    updateRunState(prev => {
                        const newResults = new Map(prev.itemResults);
                        newResults.set(item.id, {
                            itemId: item.id,
                            type: item.type,
                            status: 'skipped',
                            validationStatus: 'idle',
                        } as TestItemResult);
                        return {
                            ...prev,
                            itemResults: newResults,
                            progress: {
                                ...prev.progress,
                                skipped: prev.progress.skipped + 1,
                            },
                        };
                    });
                }
            }
        }
        
        // Build final result
        const currentState = useAppStateStore.getState().testSuiteRunStates[suiteId];
        const finalResult = currentState?.result || initialResult;
        
        const anyFailed = batchResult.results.some(r => r.status === 'failed');
        const wasCancelled = batchResult.cancelled && !anyFailed;
        
        const completedResult: TestSuiteRunResult = {
            ...finalResult,
            status: anyFailed ? 'failed' : (wasCancelled ? 'cancelled' : 'success'),
            completedAt: new Date().toISOString(),
            error: anyFailed ? 'One or more tests failed' : 
                   wasCancelled ? 'Test suite was cancelled' : undefined,
        };
        
        setTestSuiteRunState(suiteId, {
            isRunning: false,
            result: completedResult,
            runningItemIds: new Set(),
        });
        
        return completedResult;
    }, [suiteId, executeRequestItem, executeFlowItem, updateRunState, setTestSuiteRunState]);
    
    /**
     * Cancel the test suite run
     */
    const cancelTestSuite = useCallback(() => {
        isCancelledRef.current = true;
        
        // Cancel batch executor delay
        batchExecutorRef.current?.cancelDelay();
        
        // Cancel any in-flight requests
        httpAdapter.cancelRequest?.('*');
        
        const currentState = useAppStateStore.getState().testSuiteRunStates[suiteId];
        setTestSuiteRunState(suiteId, {
            ...(currentState || DEFAULT_TEST_SUITE_RUN_STATE),
            isRunning: false,
            runningItemIds: new Set(),
            result: currentState?.result ? {
                ...currentState.result,
                status: 'cancelled',
                completedAt: new Date().toISOString(),
                error: 'Test suite was cancelled',
            } : null,
        });
    }, [suiteId, httpAdapter, setTestSuiteRunState]);
    
    /**
     * Reset the test suite runner state
     */
    const resetTestSuite = useCallback(() => {
        isCancelledRef.current = false;
        
        // Clean up batch executor
        batchExecutorRef.current?.cancelDelay();
        batchExecutorRef.current = null;
        
        clearTestSuiteRunState(suiteId);
    }, [suiteId, clearTestSuiteRunState]);
    
    /**
     * Get result for a specific item
     */
    const getItemResult = useCallback((itemId: string): TestItemResult | undefined => {
        return state.result?.itemResults.get(itemId);
    }, [state.result]);
    
    return {
        ...state,
        runTestSuite,
        cancelTestSuite,
        resetTestSuite,
        getItemResult,
    };
}

export default useTestSuiteRunnerV2;
