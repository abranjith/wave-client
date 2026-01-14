/**
 * Flow Runner Hook
 * 
 * Manages execution of a Flow - a dependency-aware chain of HTTP requests.
 * Similar to useCollectionRunner but with:
 * - DAG-based execution order (topological sort)
 * - Condition-based connector evaluation
 * - Flow variable resolution from completed node responses
 * - Fail-fast on errors or unresolved parameters
 * 
 * Uses the platform adapter pattern for HTTP execution, making it platform-agnostic.
 */

import { useCallback, useRef } from 'react';
import { useHttpAdapter } from './useAdapter';
import useAppStateStore from './store/useAppStateStore';
import type { Environment, CollectionItem, Collection } from '../types/collection';
import type { Auth } from './store/createAuthSlice';
import type { HttpRequestConfig } from '../types/adapters';
import type {
    Flow,
    FlowNode,
    FlowRunResult,
    FlowNodeResult,
    FlowContext,
} from '../types/flow';
import {
    getTopologicalOrder,
    getOutgoingConnectors,
    getIncomingConnectors,
    getUpstreamNodeIds,
    isConditionSatisfied,
    createInitialFlowRunResult,
    validateFlow,
} from '../utils/flowUtils';
import {
    createEmptyFlowContext,
    addToFlowContext,
    flowContextToDynamicEnvVars,
} from '../utils/flowResolver';
import { buildEnvVarsMap, buildHttpRequest } from '../utils/requestBuilder';

// ============================================================================
// Types
// ============================================================================

export interface UseFlowRunnerOptions {
    /** Flow ID being executed (required for global state tracking) */
    flowId: string;
    /** Available environments for variable resolution */
    environments: Environment[];
    /** Available auth configurations */
    auths: Auth[];
    /** Available collections (to look up request details) */
    collections: Collection[];
}

export interface RunFlowOptions {
    /** Environment ID for variable resolution */
    environmentId?: string;
    /** Default auth ID for requests without specific auth */
    defaultAuthId?: string;
}

// ============================================================================
// Hook
// ============================================================================

// Default empty state (stable reference)
const DEFAULT_FLOW_RUN_STATE = {
    isRunning: false,
    result: null,
    runningNodeIds: new Set(),
} as const;

export function useFlowRunner({ flowId, environments, auths, collections }: UseFlowRunnerOptions) {
    const httpAdapter = useHttpAdapter();
    
    // Global state management - subscribe directly to flowRunStates[flowId]
    const state = useAppStateStore((state) => state.flowRunStates[flowId] || DEFAULT_FLOW_RUN_STATE);
    const setFlowRunState = useAppStateStore((state) => state.setFlowRunState);
    const clearFlowRunState = useAppStateStore((state) => state.clearFlowRunState);
    
    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const flowContextRef = useRef<FlowContext>(createEmptyFlowContext());
    const envVarsMapRef = useRef<Map<string, string>>(new Map());
    const environmentIdRef = useRef<string | null>(null);
    const runningRef = useRef<Set<string>>(new Set());
    
    /**
     * Finds a collection request by requestId
     * requestId format: "collectionFilename:itemId" or just "itemId"
     */
    const findRequest = useCallback((requestId: string): { request: CollectionItem; collection: Collection } | null => {
        // Parse requestId - may include collection prefix
        let collectionFilename: string | undefined;
        let itemId: string;
        
        if (requestId.includes(':')) {
            [collectionFilename, itemId] = requestId.split(':', 2);
        } else {
            itemId = requestId;
        }
        
        // Search function for nested items
        const findInItems = (items: CollectionItem[]): CollectionItem | null => {
            for (const item of items) {
                if (item.id === itemId) {
                    return item;
                }
                if (item.item) {
                    const found = findInItems(item.item);
                    if (found) {
                        return found;
                    }
                }
            }
            return null;
        };
        
        // Search in specified collection or all collections
        const collectionsToSearch = collectionFilename
            ? collections.filter(c => c.filename === collectionFilename)
            : collections;
        
        for (const collection of collectionsToSearch) {
            const found = findInItems(collection.item);
            if (found) {
                return { request: found, collection };
            }
        }
        
        return null;
    }, [collections]);
    
    /**
     * Builds HTTP request config for a node, resolving flow variables.
     * Only variables from upstream dependencies are available for resolution.
     */
    const buildNodeRequest = useCallback(async (
        flow: Flow,
        node: FlowNode,
        flowContext: FlowContext,
        environmentId: string | null,
        defaultAuthId?: string
    ): Promise<{ config: HttpRequestConfig; error?: string; unresolved?: string[] }> => {
        // Find the request definition
        const found = findRequest(node.requestId);
        
        if (!found || !found.request.request) {
            return { 
                config: null as unknown as HttpRequestConfig, 
                error: `Request not found: ${node.requestId}` 
            };
        }
        
        const { request: item } = found;
        const request = item.request!;
        
        // Get upstream node IDs that this node depends on
        const upstreamNodeIds = getUpstreamNodeIds(flow, node.id);
        
        // Create node ID to alias map for flow context filtering
        const nodeIdToAliasMap = new Map(
            flow.nodes.map(n => [n.id, n.alias])
        );
        
        // Convert flow context to dynamic env vars (only from upstream dependencies)
        // Only extracts values that are actually referenced in the request
        const dynamicEnvVars = flowContextToDynamicEnvVars(
            flowContext,
            upstreamNodeIds,
            nodeIdToAliasMap,
            request
        );
        
        // Build request using buildHttpRequest with dynamic env vars
        const result = await buildHttpRequest(
            {
                id: `${node.id}-${Date.now()}`,
                name: item.name,
                method: request.method,
                url: typeof request.url === 'string' ? request.url : request.url?.raw || '',
                headers: request.header || [],
                params: typeof request.url === 'object' ? request.url?.query || [] : [],
                authId: request.authId,
                request: request,
            },
            environmentId, // Use flow's environment for base variables
            environments,
            auths,
            defaultAuthId || flow.defaultAuthId,
            dynamicEnvVars // Pass dynamic vars from flow context (highest priority)
        );
        
        if (result.error || result.unresolved) {
            return {
                config: null as unknown as HttpRequestConfig,
                error: result.error,
                unresolved: result.unresolved,
            };
        }
        
        if (!result.request) {
            return {
                config: null as unknown as HttpRequestConfig,
                error: 'Failed to build request',
            };
        }
        
        // Convert PreparedHttpRequest to HttpRequestConfig
        const config: HttpRequestConfig = {
            id: result.request.id,
            method: result.request.method,
            url: result.request.url,
            headers: result.request.headers,
            params: result.request.params || '',
            body: result.request.body,
            auth: result.request.auth,
            envVars: result.request.envVars,
            validation: request.validation,
        };
        
        return { config };
    }, [findRequest, auths, environments]);
    
    /**
     * Executes a single node
     */
    const executeNode = useCallback(async (
        flow: Flow,
        node: FlowNode,
        defaultAuthId?: string
    ): Promise<FlowNodeResult> => {
        const startedAt = new Date().toISOString();
        
        // Build request with flow context
        const { config, error } = await buildNodeRequest(
            flow,
            node,
            flowContextRef.current,
            environmentIdRef.current,
            defaultAuthId
        );
        
        if (error || !config) {
            return {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'failed',
                error: error || 'Failed to build request',
                startedAt,
                completedAt: new Date().toISOString(),
            };
        }
        
        try {
            // Execute request via adapter
            const result = await httpAdapter.executeRequest(config);
            
            if (isCancelledRef.current) {
                return {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'failed',
                    error: 'Cancelled',
                    startedAt,
                    completedAt: new Date().toISOString(),
                };
            }
            
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
    }, [httpAdapter, buildNodeRequest]);
    
    /**
     * Updates the run result state
     */
    const updateResult = useCallback((
        updater: (prev: FlowRunResult) => FlowRunResult
    ) => {
        // Use inline selector to get current state
        const currentState = useAppStateStore.getState().getFlowRunState(flowId);
        if (currentState.result) {
            setFlowRunState(flowId, {
                ...currentState,
                result: updater(currentState.result),
            });
        }
    }, [flowId, setFlowRunState]);
    
    /**
     * Updates state for a single node completion
     * Called per-node to keep UI responsive
     */
    const updateStateForNodeCompletion = useCallback((
        nodeResults: Map<string, FlowNodeResult>,
        activeConnectorIds: string[],
        completedNodes: Set<string>
    ) => {
        const completed = completedNodes.size;
        const succeeded = Array.from(nodeResults.values()).filter(r => r.status === 'success').length;
        const failed = Array.from(nodeResults.values()).filter(r => r.status === 'failed').length;
        const skipped = Array.from(nodeResults.values()).filter(r => r.status === 'skipped').length;
        
        const currentState = useAppStateStore.getState().getFlowRunState(flowId);
        if (currentState.result) {
            setFlowRunState(flowId, {
                ...currentState,
                runningNodeIds: new Set(runningRef.current),
                result: {
                    ...currentState.result,
                    nodeResults: new Map(nodeResults),
                    activeConnectorIds: [...activeConnectorIds],
                    progress: {
                        ...currentState.result.progress,
                        completed,
                        succeeded,
                        failed,
                        skipped,
                    },
                },
            });
        }
    }, [flowId, setFlowRunState]);
    
    /**
     * Checks if all incoming dependencies for a node are satisfied
     */
    const areDependenciesSatisfied = useCallback((
        flow: Flow,
        nodeId: string,
        nodeResults: Map<string, FlowNodeResult>
    ): { satisfied: boolean; canExecute: boolean } => {
        const incoming = getIncomingConnectors(flow, nodeId);
        
        // No dependencies - can execute
        if (incoming.length === 0) {
            return { satisfied: true, canExecute: true };
        }
        
        // Check each incoming connector
        let anyConditionMet = false;
        
        for (const connector of incoming) {
            const sourceResult = nodeResults.get(connector.sourceNodeId);
            
            // If source hasn't completed, dependencies not satisfied
            if (!sourceResult || sourceResult.status === 'idle' || sourceResult.status === 'pending' || sourceResult.status === 'running') {
                return { satisfied: false, canExecute: false };
            }
            
            // Check if condition is met
            if (isConditionSatisfied(connector.condition, sourceResult)) {
                anyConditionMet = true;
            }
        }
        
        // All sources completed, but did any condition pass?
        return { satisfied: true, canExecute: anyConditionMet };
    }, []);
    
    /**
     * Runs a flow
     */
    const runFlow = useCallback(async (
        flow: Flow,
        options: RunFlowOptions = {}
    ): Promise<FlowRunResult> => {
        const { environmentId, defaultAuthId } = options;
        
        // Validate flow
        const validationErrors = validateFlow(flow);
        if (validationErrors.length > 0) {
            const errorMessage = validationErrors.join('; ');
            
            const result = createInitialFlowRunResult(flow);
            result.status = 'failed';
            result.error = `Invalid flow: ${errorMessage}`;
            result.completedAt = new Date().toISOString();
            
            setFlowRunState(flowId, {
                isRunning: false,
                result: result,
                runningNodeIds: new Set(),
            });
            
            return result;
        }
        
        // Get topological order
        const executionOrder = getTopologicalOrder(flow);
        if (!executionOrder) {
            const result = createInitialFlowRunResult(flow);
            result.status = 'failed';
            result.error = 'Flow contains a cycle';
            result.completedAt = new Date().toISOString();
            
            setFlowRunState(flowId, {
                isRunning: false,
                result: result,
                runningNodeIds: new Set(),
            });
            
            return result;
        }
        
        // Reset refs
        isCancelledRef.current = false;
        flowContextRef.current = createEmptyFlowContext();
        environmentIdRef.current = environmentId || flow.defaultEnvId || null;
        envVarsMapRef.current = buildEnvVarsMap(environments, environmentIdRef.current);
        runningRef.current = new Set();
        
        // Initialize result
        const initialResult = createInitialFlowRunResult(flow);
        initialResult.status = 'running';
        
        setFlowRunState(flowId, {
            isRunning: true,
            result: initialResult,
            runningNodeIds: new Set(),
        });
        
        // Create node map for quick lookup
        const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));
        const nodeResults = new Map<string, FlowNodeResult>(initialResult.nodeResults);
        const activeConnectorIds: string[] = [];
        const skippedConnectorIds: string[] = [];
        
        // Refs for tracking promises across iterations (not just current batch)
        const activePromises = new Map<string, Promise<FlowNodeResult>>();
        const inFlightNodeIds = new Set<string>();
        
        // Process nodes in topological order
        // Use continuous loop that processes nodes as they complete (Promise.race pattern)
        const pendingNodes = new Set(executionOrder.map(n => n.id));
        const completedNodes = new Set<string>();
        
        while (pendingNodes.size > 0 || activePromises.size > 0) {
            if (isCancelledRef.current) {
                break;
            }
            
            // STEP 1: Queue new ready nodes (find dependencies satisfied)
            const readyNodes: FlowNode[] = [];
            
            for (const nodeId of pendingNodes) {
                const { satisfied, canExecute } = areDependenciesSatisfied(flow, nodeId, nodeResults);
                
                if (satisfied) {
                    if (canExecute && !inFlightNodeIds.has(nodeId)) {
                        // Node is ready and not already in-flight
                        readyNodes.push(nodeMap.get(nodeId)!);
                        pendingNodes.delete(nodeId);
                        inFlightNodeIds.add(nodeId);
                    } else if (!canExecute) {
                        // All dependencies completed but condition not met - skip this node
                        const node = nodeMap.get(nodeId)!;
                        nodeResults.set(nodeId, {
                            nodeId,
                            requestId: node.requestId,
                            alias: node.alias,
                            status: 'skipped',
                        });
                        completedNodes.add(nodeId);
                        pendingNodes.delete(nodeId);
                        
                        // Mark incoming connectors as skipped
                        const incoming = getIncomingConnectors(flow, nodeId);
                        for (const conn of incoming) {
                            if (!activeConnectorIds.includes(conn.id)) {
                                skippedConnectorIds.push(conn.id);
                            }
                        }
                    }
                }
            }

            //console.log('Ready nodes:', readyNodes.map(n => n.alias).join(', '), 'In-flight:', Array.from(inFlightNodeIds).map(id => nodeMap.get(id)?.alias).join(', '));
            
            // STEP 2: Start new node executions and track promises
            for (const node of readyNodes) {
                // Mark as running
                nodeResults.set(node.id, {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'running',
                });
                
                runningRef.current.add(node.id);
                
                // Create and track promise without awaiting yet
                const promise = (async () => {
                    const result = await executeNode(flow, node, defaultAuthId || flow.defaultAuthId);
                    return result;
                })();
                
                // Store promise for later racing
                activePromises.set(node.id, promise);
                
                // Add cleanup logic via .finally()
                // Note: We only clean up runningRef and inFlightNodeIds here.
                // The promise will be removed from activePromises after we retrieve its result.
                promise.finally(() => {
                    runningRef.current.delete(node.id);
                    inFlightNodeIds.delete(node.id);
                });
            }
            
            // STEP 3: Wait for ANY in-flight promise to complete (not all)
            if (activePromises.size > 0) {
                const promisesArray = Array.from(activePromises.entries());
                
                // Race all active promises - resolve with first completion
                const [completedNodeId] = await Promise.race(
                    promisesArray.map(async ([nodeId, promise]) => {
                        await promise;
                        return [nodeId] as const;
                    })
                );
                
                // Get the completed result (promise already settled from race)
                const completedPromise = activePromises.get(completedNodeId)!;
                const result = await completedPromise;
                
                // NOW remove from activePromises after we've retrieved the result
                activePromises.delete(completedNodeId);
                
                // Update node result
                nodeResults.set(completedNodeId, result);
                completedNodes.add(completedNodeId);
                
                // Add response to flow context if successful
                if (result.response) {
                    flowContextRef.current = addToFlowContext(
                        flowContextRef.current,
                        result.alias,
                        result.response
                    );
                }
                
                // Mark activated connectors
                const outgoing = getOutgoingConnectors(flow, completedNodeId);
                for (const conn of outgoing) {
                    if (isConditionSatisfied(conn.condition, result)) {
                        activeConnectorIds.push(conn.id);
                    }
                }
                
                // Check for failure - stop flow
                if (result.status === 'failed') {
                    isCancelledRef.current = true;
                }
                
                // Update state with progress for this completed node
                updateStateForNodeCompletion(nodeResults, activeConnectorIds, completedNodes);
            } else if (pendingNodes.size > 0) {
                // No ready nodes and no in-flight promises - waiting for something
                // Small delay to prevent busy-waiting
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        // Build final result
        const finalSucceeded = Array.from(nodeResults.values()).filter(r => r.status === 'success').length;
        const finalFailed = Array.from(nodeResults.values()).filter(r => r.status === 'failed').length;
        const finalSkipped = Array.from(nodeResults.values()).filter(r => r.status === 'skipped').length;
        
        const hasFailed = finalFailed > 0;
        const wasCancelled = isCancelledRef.current && !hasFailed;
        
        const finalResult: FlowRunResult = {
            flowId: flow.id,
            status: hasFailed ? 'failed' : (wasCancelled ? 'cancelled' : 'success'),
            nodeResults,
            activeConnectorIds,
            skippedConnectorIds,
            startedAt: initialResult.startedAt,
            completedAt: new Date().toISOString(),
            error: hasFailed 
                ? `${finalFailed} node(s) failed` 
                : (wasCancelled ? 'Flow was cancelled' : undefined),
            progress: {
                total: flow.nodes.length,
                completed: completedNodes.size,
                succeeded: finalSucceeded,
                failed: finalFailed,
                skipped: finalSkipped,
            },
        };
        
        setFlowRunState(flowId, {
            isRunning: false,
            result: finalResult,
            runningNodeIds: new Set(),
        });
        
        return finalResult;
    }, [flowId, environments, executeNode, areDependenciesSatisfied, updateResult, setFlowRunState]);
    
    /**
     * Cancels the current flow run
     */
    const cancelFlow = useCallback(() => {
        isCancelledRef.current = true;
        runningRef.current.clear();
        
        const currentState = useAppStateStore.getState().getFlowRunState(flowId);
        setFlowRunState(flowId, {
            ...currentState,
            isRunning: false,
            runningNodeIds: new Set(),
            result: currentState.result ? {
                ...currentState.result,
                status: 'cancelled',
                completedAt: new Date().toISOString(),
                error: 'Flow was cancelled',
            } : null,
        });
    }, [flowId, setFlowRunState]);
    
    /**
     * Resets the flow runner state
     */
    const resetFlow = useCallback(() => {
        isCancelledRef.current = false;
        flowContextRef.current = createEmptyFlowContext();
        runningRef.current.clear();
        
        clearFlowRunState(flowId);
    }, [flowId, clearFlowRunState]);
    
    /**
     * Gets the result for a specific node
     */
    const getNodeResult = useCallback((nodeId: string): FlowNodeResult | undefined => {
        return state.result?.nodeResults.get(nodeId);
    }, [state.result]);
    
    return {
        ...state,
        runFlow,
        cancelFlow,
        resetFlow,
        getNodeResult,
    };
}

export default useFlowRunner;
