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

import { useState, useCallback, useRef } from 'react';
import { useHttpAdapter } from './useAdapter';
import type { Environment, CollectionItem, Collection } from '../types/collection';
import type { Auth } from './store/createAuthSlice';
import type { HttpRequestConfig } from '../types/adapters';
import type {
    Flow,
    FlowNode,
    FlowRunResult,
    FlowNodeResult,
    FlowRunState,
    FlowNodeStatus,
    FlowContext,
} from '../types/flow';
import {
    getTopologicalOrder,
    getOutgoingConnectors,
    getIncomingConnectors,
    isConditionSatisfied,
    createInitialFlowRunResult,
    validateFlow,
} from '../types/flow';
import {
    resolveFlowVariables,
    createEmptyFlowContext,
    addToFlowContext,
    hasUnresolvedVariables,
} from '../utils/flowResolver';
import { buildEnvVarsMap, getDictFromHeaderRows, getURLSearchParamsFromParamRows } from '../utils/requestBuilder';
import { resolveParameterizedValue } from '../utils/common';

// ============================================================================
// Types
// ============================================================================

export interface UseFlowRunnerOptions {
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

export function useFlowRunner({ environments, auths, collections }: UseFlowRunnerOptions) {
    const httpAdapter = useHttpAdapter();
    
    // State
    const [state, setState] = useState<FlowRunState>({
        isRunning: false,
        result: null,
        runningNodeIds: new Set(),
    });
    
    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const flowContextRef = useRef<FlowContext>(createEmptyFlowContext());
    const envVarsMapRef = useRef<Map<string, string>>(new Map());
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
            [collectionFilename, itemId] = requestId.split(':');
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
     * Builds HTTP request config for a node, resolving flow variables
     */
    const buildNodeRequest = useCallback(async (
        node: FlowNode,
        envVarsMap: Map<string, string>,
        flowContext: FlowContext,
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
        
        const { request: item, collection } = found;
        const request = item.request!;
        const unresolved = new Set<string>();
        
        // Get URL
        let url = typeof request.url === 'string' 
            ? request.url 
            : request.url?.raw || '';
        
        // Resolve URL with flow context
        const urlResult = resolveFlowVariables(url, envVarsMap, flowContext);
        if (urlResult.unresolved.length > 0) {
            urlResult.unresolved.forEach(u => unresolved.add(u));
        }
        url = urlResult.resolved;
        
        // Add protocol if missing
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://${url}`;
        }
        
        // Resolve headers
        const headerRows = request.header || [];
        const headers = getDictFromHeaderRows(headerRows, envVarsMap, unresolved);
        
        // Resolve headers with flow context for any remaining placeholders
        for (const [key, value] of Object.entries(headers)) {
            if (typeof value === 'string' && hasUnresolvedVariables(value)) {
                const result = resolveFlowVariables(value, envVarsMap, flowContext);
                result.unresolved.forEach(u => unresolved.add(u));
                headers[key] = result.resolved;
            }
        }
        
        // Resolve params
        const queryParams = typeof request.url === 'object' && request.url?.query 
            ? request.url.query 
            : [];
        const params = getURLSearchParamsFromParamRows(queryParams, envVarsMap, unresolved);
        
        // Extract and resolve body
        let body: string | null = null;
        if (request.body) {
            // Handle raw body (most common for JSON APIs)
            if (request.body.raw) {
                const bodyResult = resolveParameterizedValue(request.body.raw, envVarsMap);
                bodyResult.unresolved.forEach(u => unresolved.add(u));
                body = bodyResult.resolved;
            }
            // Handle urlencoded
            else if (request.body.urlencoded && Array.isArray(request.body.urlencoded)) {
                const bodyParams = new URLSearchParams();
                request.body.urlencoded.forEach(field => {
                    if (field.key && !field.disabled) {
                        const keyResult = resolveParameterizedValue(field.key, envVarsMap);
                        keyResult.unresolved.forEach(u => unresolved.add(u));
                        const valueResult = resolveParameterizedValue(field.value || '', envVarsMap);
                        valueResult.unresolved.forEach(u => unresolved.add(u));
                        bodyParams.append(keyResult.resolved, valueResult.resolved);
                    }
                });
                body = bodyParams.toString();
            }
        }
        
        // Resolve body with flow context for any remaining placeholders
        if (body && hasUnresolvedVariables(body)) {
            const result = resolveFlowVariables(body, envVarsMap, flowContext);
            result.unresolved.forEach(u => unresolved.add(u));
            body = result.resolved;
        }
        
        // Get auth
        const authId = request.authId || defaultAuthId;
        const auth = authId ? auths.find(a => a.id === authId) : undefined;
        
        // Check for unresolved variables
        if (unresolved.size > 0) {
            return {
                config: null as unknown as HttpRequestConfig,
                error: `Unresolved variables: ${Array.from(unresolved).join(', ')}`,
                unresolved: Array.from(unresolved),
            };
        }
        
        // Build config
        const config: HttpRequestConfig = {
            id: `${node.id}-${Date.now()}`,
            method: request.method,
            url,
            headers,
            params: params.toString(),
            body,
            auth,
            envVars: Object.fromEntries(envVarsMap),
            validation: request.validation,
        };
        
        return { config };
    }, [findRequest, auths]);
    
    /**
     * Executes a single node
     */
    const executeNode = useCallback(async (
        node: FlowNode,
        defaultAuthId?: string
    ): Promise<FlowNodeResult> => {
        const startedAt = new Date().toISOString();
        
        // Build request with flow context
        const { config, error, unresolved } = await buildNodeRequest(
            node,
            envVarsMapRef.current,
            flowContextRef.current,
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
        setState(prev => {
            if (!prev.result) {
                return prev;
            }
            return {
                ...prev,
                result: updater(prev.result),
            };
        });
    }, []);
    
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
            const result = createInitialFlowRunResult(flow);
            result.status = 'failed';
            result.error = `Invalid flow: ${validationErrors.join('; ')}`;
            result.completedAt = new Date().toISOString();
            return result;
        }
        
        // Get topological order
        const executionOrder = getTopologicalOrder(flow);
        if (!executionOrder) {
            const result = createInitialFlowRunResult(flow);
            result.status = 'failed';
            result.error = 'Flow contains a cycle';
            result.completedAt = new Date().toISOString();
            return result;
        }
        
        // Reset refs
        isCancelledRef.current = false;
        flowContextRef.current = createEmptyFlowContext();
        envVarsMapRef.current = buildEnvVarsMap(environments, environmentId || flow.defaultEnvId || null);
        runningRef.current = new Set();
        
        // Initialize result
        const initialResult = createInitialFlowRunResult(flow);
        initialResult.status = 'running';
        
        setState({
            isRunning: true,
            result: initialResult,
            runningNodeIds: new Set(),
        });
        
        // Create node map for quick lookup
        const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));
        const nodeResults = new Map<string, FlowNodeResult>(initialResult.nodeResults);
        const activeConnectorIds: string[] = [];
        const skippedConnectorIds: string[] = [];
        
        // Process nodes in topological order
        // We'll use a queue-based approach to handle parallel execution of independent nodes
        const pendingNodes = new Set(executionOrder.map(n => n.id));
        const completedNodes = new Set<string>();
        
        while (pendingNodes.size > 0 && !isCancelledRef.current) {
            // Find nodes ready to execute (all dependencies satisfied and condition met)
            const readyNodes: FlowNode[] = [];
            
            for (const nodeId of pendingNodes) {
                const { satisfied, canExecute } = areDependenciesSatisfied(flow, nodeId, nodeResults);
                
                if (satisfied) {
                    if (canExecute) {
                        readyNodes.push(nodeMap.get(nodeId)!);
                    } else {
                        // All dependencies completed but no condition was met - skip this node
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
            
            if (readyNodes.length === 0 && pendingNodes.size > 0) {
                // No ready nodes but still pending - waiting for something
                // This shouldn't happen with proper topological order
                // but let's prevent infinite loop
                await new Promise(resolve => setTimeout(resolve, 10));
                continue;
            }
            
            // Execute ready nodes in parallel
            const nodePromises = readyNodes.map(async (node) => {
                pendingNodes.delete(node.id);
                
                // Mark as running
                nodeResults.set(node.id, {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'running',
                });
                
                runningRef.current.add(node.id);
                
                setState(prev => ({
                    ...prev,
                    runningNodeIds: new Set(runningRef.current),
                    result: prev.result ? {
                        ...prev.result,
                        nodeResults: new Map(nodeResults),
                    } : null,
                }));
                
                // Execute
                const result = await executeNode(node, defaultAuthId || flow.defaultAuthId);
                
                runningRef.current.delete(node.id);
                nodeResults.set(node.id, result);
                completedNodes.add(node.id);
                
                // Add response to flow context if successful
                if (result.response) {
                    flowContextRef.current = addToFlowContext(
                        flowContextRef.current,
                        node.alias,
                        result.response
                    );
                }
                
                // Mark activated connectors
                const outgoing = getOutgoingConnectors(flow, node.id);
                for (const conn of outgoing) {
                    if (isConditionSatisfied(conn.condition, result)) {
                        activeConnectorIds.push(conn.id);
                    }
                }
                
                // Update state with progress
                const completed = completedNodes.size;
                const succeeded = Array.from(nodeResults.values()).filter(r => r.status === 'success').length;
                const failed = Array.from(nodeResults.values()).filter(r => r.status === 'failed').length;
                const skipped = Array.from(nodeResults.values()).filter(r => r.status === 'skipped').length;
                
                updateResult(prev => ({
                    ...prev,
                    nodeResults: new Map(nodeResults),
                    activeConnectorIds: [...activeConnectorIds],
                    progress: {
                        ...prev.progress,
                        completed,
                        succeeded,
                        failed,
                        skipped,
                    },
                }));
                
                // Check for failure - stop flow
                if (result.status === 'failed') {
                    isCancelledRef.current = true;
                }
                
                return result;
            });
            
            // Wait for all parallel nodes to complete
            await Promise.all(nodePromises);
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
        
        setState({
            isRunning: false,
            result: finalResult,
            runningNodeIds: new Set(),
        });
        
        return finalResult;
    }, [environments, executeNode, areDependenciesSatisfied, updateResult]);
    
    /**
     * Cancels the current flow run
     */
    const cancelFlow = useCallback(() => {
        isCancelledRef.current = true;
        runningRef.current.clear();
        
        setState(prev => ({
            ...prev,
            isRunning: false,
            runningNodeIds: new Set(),
            result: prev.result ? {
                ...prev.result,
                status: 'cancelled',
                completedAt: new Date().toISOString(),
                error: 'Flow was cancelled',
            } : null,
        }));
    }, []);
    
    /**
     * Resets the flow runner state
     */
    const resetFlow = useCallback(() => {
        isCancelledRef.current = false;
        flowContextRef.current = createEmptyFlowContext();
        runningRef.current.clear();
        
        setState({
            isRunning: false,
            result: null,
            runningNodeIds: new Set(),
        });
    }, []);
    
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
