/**
 * Test Suite Runner Hook
 * 
 * Manages execution of a TestSuite - a collection of requests and flows that can
 * be run together with configurable settings.
 * 
 * Combines patterns from:
 * - useCollectionRunner: Concurrency control, delay between batches, request execution
 * - useFlowRunner: Global state management, flow execution
 * 
 * Uses the platform adapter pattern for HTTP execution, making it platform-agnostic.
 * Uses shared utilities for collection lookup and data merging.
 */

import { useCallback, useRef } from 'react';
import { useHttpAdapter } from './useAdapter';
import useAppStateStore from './store/useAppStateStore';
import type { Environment, Collection } from '../types/collection';
import type { Auth } from './store/createAuthSlice';
import type { HttpRequestConfig, HttpResponseResult } from '../types/adapters';
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
import {
    isRequestTestItem,
    createEmptyTestSuiteRunResult,
} from '../types/testSuite';
import { buildHttpRequest, CollectionRequestInput } from '../utils/requestBuilder';
import type { HeaderRow, ParamRow } from '../types/collection';
import {
    createEmptyFlowContext,
    flowContextToDynamicEnvVars,
} from '../utils/flowResolver';
import {
    getTopologicalOrder,
    getIncomingConnectors,
    getUpstreamNodeIds,
    isConditionSatisfied,
    validateFlow,
} from '../utils/flowUtils';
import type { FlowContext, FlowRunResult, FlowNodeResult, FlowNode } from '../types/flow';
import { findRequestById, findFlowById } from '../utils/collectionLookup';
import {
    mergeHeadersWithOverrides,
    mergeParamsWithOverrides,
    mergeEnvVarsWithOverrides,
} from '../utils/executors/types';
import { determineExecutionStatus, determineValidationStatus } from '../types/execution';

// ============================================================================
// Types
// ============================================================================

export interface UseTestSuiteRunnerOptions {
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
// Hook
// ============================================================================

export function useTestSuiteRunner({
    suiteId,
    environments,
    auths,
    collections,
    flows,
}: UseTestSuiteRunnerOptions) {
    const httpAdapter = useHttpAdapter();
    
    // Global state management
    const state = useAppStateStore((s) => s.testSuiteRunStates[suiteId] || DEFAULT_TEST_SUITE_RUN_STATE);
    const setTestSuiteRunState = useAppStateStore((s) => s.setTestSuiteRunState);
    const clearTestSuiteRunState = useAppStateStore((s) => s.clearTestSuiteRunState);
    
    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const pendingQueueRef = useRef<TestItem[]>([]);
    const activeItemIdsRef = useRef<Set<string>>(new Set());
    const environmentIdRef = useRef<string | null>(null);
    const defaultAuthIdRef = useRef<string | null>(null);
    const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // ========================================================================
    // Helper: Execute a single request with optional test case overrides
    // ========================================================================
    
    const executeSingleRequest = useCallback(async (
        item: RequestTestItem,
        testCase?: TestCase
    ): Promise<{ response?: HttpResponseResult; error?: string; status: TestItemStatus; validationStatus: TestValidationStatus }> => {
        const found = findRequestById(item.referenceId, collections);
        if (!found || !found.item.request) {
            return {
                status: 'failed',
                validationStatus: 'idle',
                error: `Request not found: ${item.referenceId}`,
            };
        }
        
        const { item: collectionItem } = found;
        const request = collectionItem.request!;
        
        const urlObj = request.url;
        const baseQueryParams = typeof urlObj === 'object' && urlObj?.query ? urlObj.query : [];
        const urlString = typeof urlObj === 'string' ? urlObj : urlObj?.raw || '';
        
        // Apply test case overrides using shared utilities
        const testCaseData = testCase?.data || {};
        const finalHeaders = mergeHeadersWithOverrides(request.header || [], testCaseData.headers);
        const finalParams = mergeParamsWithOverrides(baseQueryParams, testCaseData.params);
        const finalAuthId = testCaseData.authId || request.authId;
        const dynamicVars = testCaseData.variables || {};
        
        const input: CollectionRequestInput = {
            id: `${item.id}-${testCase?.id || 'default'}-${Date.now()}`,
            name: collectionItem.name,
            method: request.method,
            url: urlString,
            headers: finalHeaders,
            params: finalParams,
            authId: finalAuthId,
            request: request,
        };

        if (testCaseData.body !== undefined) {
            input.body = testCaseData.body;
        }
        
        const buildResult = await buildHttpRequest(
            input,
            environmentIdRef.current,
            environments,
            auths,
            defaultAuthIdRef.current,
            dynamicVars
        );
        
        if (buildResult.error || !buildResult.request) {
            return {
                status: 'failed',
                validationStatus: 'idle',
                error: buildResult.error || 'Failed to build request',
            };
        }
        
        // Merge environment variables with test case variables using shared utility
        const finalEnvVars = mergeEnvVarsWithOverrides(
            buildResult.request.envVars || {},
            testCaseData.variables
        );
        
        // Determine body - if test case has body override, use that instead
        let finalBody = buildResult.request.body;
        
        // Determine validation - test case validation > item validation > request validation
        const validation = testCase?.validation || item.validation || request.validation;
        
        const config: HttpRequestConfig = {
            id: buildResult.request.id,
            method: buildResult.request.method,
            url: buildResult.request.url,
            headers: buildResult.request.headers || [],
            params: buildResult.request.params || [],
            body: finalBody,
            auth: buildResult.request.auth,
            envVars: finalEnvVars,
            validation,
        };
        
        try {
            const result = await httpAdapter.executeRequest(config);
            
            if (isCancelledRef.current) {
                return {
                    status: 'failed',
                    validationStatus: 'idle',
                    error: 'Cancelled',
                };
            }
            
            if (result.isOk) {
                const response = result.value;
                const isSuccess = response.status >= 200 && response.status < 400;
                const validationResult = response.validationResult;
                
                let validationStatus: TestValidationStatus = 'idle';
                if (validationResult) {
                    validationStatus = validationResult.allPassed ? 'pass' : 'fail';
                }
                
                return {
                    response,
                    status: isSuccess ? 'success' : 'failed',
                    validationStatus,
                };
            } else {
                return {
                    status: 'failed',
                    validationStatus: 'idle',
                    error: result.error,
                };
            }
        } catch (err) {
            return {
                status: 'failed',
                validationStatus: 'idle',
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }, [collections, httpAdapter, environments, auths]);
    
    // ========================================================================
    // Helper: Execute a single request test item (with test cases support)
    // ========================================================================
    
    const executeRequestItem = useCallback(async (
        item: RequestTestItem
    ): Promise<RequestTestItemResult> => {
        const startedAt = new Date().toISOString();
        
        // Get enabled test cases
        const enabledTestCases = (item.testCases || []).filter(tc => tc.enabled);
        
        // If no test cases, run once with defaults
        if (enabledTestCases.length === 0) {
            const result = await executeSingleRequest(item);
            return {
                itemId: item.id,
                type: 'request',
                status: result.status,
                validationStatus: result.validationStatus,
                response: result.response,
                error: result.error,
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        // Execute each test case and collect results
        const testCaseResults = new Map<string, TestCaseResult>();
        let overallStatus: TestItemStatus = 'success';
        let overallValidationStatus: TestValidationStatus = 'pass';
        let lastResponse: HttpResponseResult | undefined;
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
            const result = await executeSingleRequest(item, testCase);
            const caseCompletedAt = new Date().toISOString();
            
            const caseResult: TestCaseResult = {
                testCaseId: testCase.id,
                testCaseName: testCase.name,
                status: result.status,
                validationStatus: result.validationStatus,
                response: result.response,
                error: result.error,
                startedAt: caseStartedAt,
                completedAt: caseCompletedAt,
            };
            
            testCaseResults.set(testCase.id, caseResult);
            lastResponse = result.response;
            lastError = result.error;
            
            // Aggregate status: failed if any case fails
            if (result.status === 'failed') {
                overallStatus = 'failed';
            }
            
            // Aggregate validation: fail if any case fails validation
            if (result.validationStatus === 'fail') {
                overallValidationStatus = 'fail';
            } else if (result.validationStatus === 'idle' && overallValidationStatus !== 'fail') {
                // Keep 'pass' if we had any pass, otherwise stay idle
                if (overallValidationStatus === 'pass') {
                    // Already have a pass, keep it
                } else {
                    overallValidationStatus = 'idle';
                }
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
    }, [executeSingleRequest]);
    
    // ========================================================================
    // Helper: Execute a single flow test item (simplified inline flow runner)
    // ========================================================================
    
    const executeFlowItem = useCallback(async (
        item: FlowTestItem
    ): Promise<FlowTestItemResult> => {
        const startedAt = new Date().toISOString();
        
        // Use shared findFlowById utility
        const flow = findFlowById(item.referenceId, flows);
        if (!flow) {
            return {
                itemId: item.id,
                type: 'flow',
                status: 'failed',
                validationStatus: 'idle',
                error: `Flow not found: ${item.referenceId}`,
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        // Validate flow structure
        const validationErrors = validateFlow(flow);
        if (validationErrors.length > 0) {
            return {
                itemId: item.id,
                type: 'flow',
                status: 'failed',
                validationStatus: 'idle',
                error: `Invalid flow: ${validationErrors.join('; ')}`,
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        // Get topological order
        const executionOrder = getTopologicalOrder(flow);
        if (!executionOrder) {
            return {
                itemId: item.id,
                type: 'flow',
                status: 'failed',
                validationStatus: 'idle',
                error: 'Flow contains a cycle',
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        // Initialize flow execution
        const flowContext: FlowContext = createEmptyFlowContext();
        const nodeResults = new Map<string, FlowNodeResult>();
        const activeConnectorIds: string[] = [];
        const skippedConnectorIds: string[] = [];
        
        // Initialize all nodes as idle
        for (const node of flow.nodes) {
            nodeResults.set(node.id, {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'idle',
            });
        }
        
        // Execute nodes in order (simplified sequential execution)
        for (const node of executionOrder) {
            if (isCancelledRef.current) {
                break;
            }
            
            // Check if dependencies are satisfied
            const incoming = getIncomingConnectors(flow, node.id);
            let canExecute = incoming.length === 0;
            
            for (const conn of incoming) {
                const sourceResult = nodeResults.get(conn.sourceNodeId);
                if (sourceResult && isConditionSatisfied(conn.condition, sourceResult)) {
                    canExecute = true;
                    activeConnectorIds.push(conn.id);
                } else if (sourceResult) {
                    skippedConnectorIds.push(conn.id);
                }
            }
            
            if (!canExecute) {
                nodeResults.set(node.id, {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'skipped',
                });
                continue;
            }
            
            // Execute node
            nodeResults.set(node.id, {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'running',
            });
            
            const nodeResult = await executeFlowNode(flow, node, flowContext);
            nodeResults.set(node.id, nodeResult);
            
            if (nodeResult.response) {
                flowContext.responses.set(node.alias, nodeResult.response);
                flowContext.executionOrder.push(node.alias);
            }
            
            if (nodeResult.status === 'failed') {
                // Stop on first failure within flow
                break;
            }
        }
        
        // Build flow result
        const succeeded = Array.from(nodeResults.values()).filter(r => r.status === 'success').length;
        const failed = Array.from(nodeResults.values()).filter(r => r.status === 'failed').length;
        const skipped = Array.from(nodeResults.values()).filter(r => r.status === 'skipped').length;
        
        const flowResult: FlowRunResult = {
            flowId: flow.id,
            status: failed > 0 ? 'failed' : 'success',
            nodeResults,
            activeConnectorIds,
            skippedConnectorIds,
            startedAt,
            completedAt: new Date().toISOString(),
            progress: {
                total: flow.nodes.length,
                completed: succeeded + failed + skipped,
                succeeded,
                failed,
                skipped,
            },
        };
        
        // Derive validation status from node validations
        let validationStatus: TestValidationStatus = 'idle';
        const nodeValidationResults = Array.from(nodeResults.values())
            .filter(r => r.response?.validationResult)
            .map(r => r.response!.validationResult!);
        
        if (nodeValidationResults.length > 0) {
            const allPassed = nodeValidationResults.every(v => v.allPassed);
            validationStatus = allPassed ? 'pass' : 'fail';
        }
        
        return {
            itemId: item.id,
            type: 'flow',
            status: failed > 0 ? 'failed' : 'success',
            validationStatus,
            flowResult,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }, [flows, collections, httpAdapter, environments, auths]);
    
    // Helper to execute a single flow node
    const executeFlowNode = useCallback(async (
        flow: Flow,
        node: FlowNode,
        flowContext: FlowContext
    ): Promise<FlowNodeResult> => {
        const startedAt = new Date().toISOString();
        
        // Use shared findRequestById utility
        const found = findRequestById(node.requestId, collections);
        if (!found || !found.item.request) {
            return {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'failed',
                error: `Request not found: ${node.requestId}`,
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        const { item: collectionItem } = found;
        const request = collectionItem.request!;
        
        // Get upstream node IDs
        const upstreamNodeIds = getUpstreamNodeIds(flow, node.id);
        const nodeIdToAliasMap = new Map(flow.nodes.map(n => [n.id, n.alias]));
        
        // Convert flow context to dynamic env vars
        const dynamicEnvVars = flowContextToDynamicEnvVars(
            flowContext,
            upstreamNodeIds,
            nodeIdToAliasMap,
            request
        );
        
        const urlObj = request.url;
        const queryParams = typeof urlObj === 'object' && urlObj?.query ? urlObj.query : [];
        const urlString = typeof urlObj === 'string' ? urlObj : urlObj?.raw || '';
        
        const input: CollectionRequestInput = {
            id: `${node.id}-${Date.now()}`,
            name: collectionItem.name,
            method: request.method,
            url: urlString,
            headers: request.header || [],
            params: queryParams,
            authId: request.authId,
            request: request,
        };
        
        const buildResult = await buildHttpRequest(
            input,
            environmentIdRef.current,
            environments,
            auths,
            defaultAuthIdRef.current || flow.defaultAuthId,
            dynamicEnvVars
        );
        
        if (buildResult.error || !buildResult.request) {
            return {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'failed',
                error: buildResult.error || 'Failed to build request',
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        const config: HttpRequestConfig = {
            id: buildResult.request.id,
            method: buildResult.request.method,
            url: buildResult.request.url,
            headers: buildResult.request.headers || [],
            params: buildResult.request.params || [],
            body: buildResult.request.body || null,
            auth: buildResult.request.auth,
            envVars: buildResult.request.envVars || {},
            validation: request.validation,
        };
        
        try {
            const result = await httpAdapter.executeRequest(config);
            
            if (result.isOk) {
                const response = result.value;
                const isSuccess = response.status >= 200 && response.status < 400;
                
                return {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: isSuccess ? 'success' : 'failed',
                    response,
                    startedAt,
                    completedAt: new Date().toISOString(),
                };
            } else {
                return {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'failed',
                    error: result.error,
                    startedAt,
                    completedAt: new Date().toISOString(),
                };
            }
        } catch (err) {
            return {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'failed',
                error: err instanceof Error ? err.message : 'Unknown error',
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
    }, [collections, httpAdapter, environments, auths]);
    
    // ========================================================================
    // Update state helper
    // ========================================================================
    
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
    
    // ========================================================================
    // Main: Run test suite
    // ========================================================================
    
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
        pendingQueueRef.current = [...enabledItems];
        activeItemIdsRef.current = new Set();
        environmentIdRef.current = environmentId || suite.defaultEnvId || null;
        defaultAuthIdRef.current = defaultAuthId || suite.defaultAuthId || null;
        
        // Clear any pending delay timer
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }
        
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
        
        // Initialize item results as pending
        for (const item of enabledItems) {
            initialResult.itemResults.set(item.id, {
                itemId: item.id,
                type: item.type,
                status: 'pending',
                validationStatus: 'idle',
            } as TestItemResult);
        }
        
        setTestSuiteRunState(suiteId, {
            isRunning: true,
            result: initialResult,
            runningItemIds: new Set(),
        });
        
        const itemResults = new Map<string, TestItemResult>(initialResult.itemResults);
        let totalTime = 0;
        let timeCount = 0;
        
        // Process items with concurrency and delay settings
        const { concurrentCalls, delayBetweenCalls, stopOnFailure } = suite.settings;
        
        while (pendingQueueRef.current.length > 0 && !isCancelledRef.current) {
            // Get batch of items to execute
            const batchSize = Math.min(concurrentCalls, pendingQueueRef.current.length);
            const batch = pendingQueueRef.current.splice(0, batchSize);
            
            // Mark items as running
            for (const item of batch) {
                activeItemIdsRef.current.add(item.id);
                itemResults.set(item.id, {
                    itemId: item.id,
                    type: item.type,
                    status: 'running',
                    validationStatus: 'pending',
                } as TestItemResult);
            }
            
            // Update state
            setTestSuiteRunState(suiteId, {
                isRunning: true,
                result: {
                    ...initialResult,
                    itemResults: new Map(itemResults),
                },
                runningItemIds: new Set(activeItemIdsRef.current),
            });
            
            // Execute batch in parallel
            const batchPromises = batch.map(async (item): Promise<TestItemResult> => {
                if (isRequestTestItem(item)) {
                    return executeRequestItem(item);
                } else {
                    return executeFlowItem(item);
                }
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            // Process results
            let hasFailure = false;
            for (const result of batchResults) {
                activeItemIdsRef.current.delete(result.itemId);
                itemResults.set(result.itemId, result);
                
                if (result.status === 'failed') {
                    hasFailure = true;
                }
                
                // Calculate elapsed time
                if (result.type === 'request' && result.response?.elapsedTime) {
                    totalTime += result.response.elapsedTime;
                    timeCount++;
                } else if (result.type === 'flow' && result.flowResult) {
                    // Sum up flow node times
                    result.flowResult.nodeResults.forEach(nodeResult => {
                        if (nodeResult.response?.elapsedTime) {
                            totalTime += nodeResult.response.elapsedTime;
                            timeCount++;
                        }
                    });
                }
            }
            
            // Calculate progress
            const completed = Array.from(itemResults.values()).filter(
                r => r.status === 'success' || r.status === 'failed' || r.status === 'skipped'
            ).length;
            const passed = Array.from(itemResults.values()).filter(
                r => r.status === 'success' && r.validationStatus !== 'fail'
            ).length;
            const failed = Array.from(itemResults.values()).filter(
                r => r.status === 'failed' || r.validationStatus === 'fail'
            ).length;
            
            // Update state
            const currentResult: TestSuiteRunResult = {
                suiteId: suite.id,
                status: 'running',
                itemResults: new Map(itemResults),
                startedAt: initialResult.startedAt,
                progress: {
                    total: enabledItems.length,
                    completed,
                    passed,
                    failed,
                    skipped: 0,
                },
                averageTime: timeCount > 0 ? Math.round(totalTime / timeCount) : 0,
            };
            
            setTestSuiteRunState(suiteId, {
                isRunning: true,
                result: currentResult,
                runningItemIds: new Set(activeItemIdsRef.current),
            });
            
            // Check stop on failure
            if (stopOnFailure && hasFailure) {
                // Mark remaining items as skipped
                for (const item of pendingQueueRef.current) {
                    itemResults.set(item.id, {
                        itemId: item.id,
                        type: item.type,
                        status: 'skipped',
                        validationStatus: 'idle',
                    } as TestItemResult);
                }
                pendingQueueRef.current = [];
                break;
            }
            
            // Apply delay between batches
            if (delayBetweenCalls > 0 && pendingQueueRef.current.length > 0 && !isCancelledRef.current) {
                await new Promise<void>(resolve => {
                    delayTimerRef.current = setTimeout(() => {
                        delayTimerRef.current = null;
                        resolve();
                    }, delayBetweenCalls);
                });
            }
        }
        
        // Calculate final stats
        const finalCompleted = Array.from(itemResults.values()).filter(
            r => r.status === 'success' || r.status === 'failed' || r.status === 'skipped'
        ).length;
        const finalPassed = Array.from(itemResults.values()).filter(
            r => r.status === 'success' && r.validationStatus !== 'fail'
        ).length;
        const finalFailed = Array.from(itemResults.values()).filter(
            r => r.status === 'failed' || r.validationStatus === 'fail'
        ).length;
        const finalSkipped = Array.from(itemResults.values()).filter(
            r => r.status === 'skipped'
        ).length;
        
        const wasCancelled = isCancelledRef.current;
        const hasFailed = finalFailed > 0;
        
        const finalResult: TestSuiteRunResult = {
            suiteId: suite.id,
            status: wasCancelled ? 'cancelled' : (hasFailed ? 'failed' : 'success'),
            itemResults,
            startedAt: initialResult.startedAt,
            completedAt: new Date().toISOString(),
            error: wasCancelled 
                ? 'Test suite was cancelled' 
                : (hasFailed ? `${finalFailed} test(s) failed` : undefined),
            progress: {
                total: enabledItems.length,
                completed: finalCompleted,
                passed: finalPassed,
                failed: finalFailed,
                skipped: finalSkipped,
            },
            averageTime: timeCount > 0 ? Math.round(totalTime / timeCount) : 0,
        };
        
        setTestSuiteRunState(suiteId, {
            isRunning: false,
            result: finalResult,
            runningItemIds: new Set(),
        });
        
        return finalResult;
    }, [suiteId, setTestSuiteRunState, executeRequestItem, executeFlowItem]);
    
    // ========================================================================
    // Cancel test suite run
    // ========================================================================
    
    const cancelTestSuite = useCallback(() => {
        isCancelledRef.current = true;
        pendingQueueRef.current = [];
        
        // Cancel any in-flight requests
        activeItemIdsRef.current.forEach(id => {
            httpAdapter.cancelRequest?.(id);
        });
        activeItemIdsRef.current.clear();
        
        // Clear delay timer
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }
        
        const currentState = useAppStateStore.getState().testSuiteRunStates[suiteId];
        setTestSuiteRunState(suiteId, {
            ...currentState,
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
    
    // ========================================================================
    // Reset test suite runner state
    // ========================================================================
    
    const resetTestSuite = useCallback(() => {
        isCancelledRef.current = false;
        pendingQueueRef.current = [];
        activeItemIdsRef.current.clear();
        
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }
        
        clearTestSuiteRunState(suiteId);
    }, [suiteId, clearTestSuiteRunState]);
    
    // ========================================================================
    // Get result for specific item
    // ========================================================================
    
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

export default useTestSuiteRunner;
