/**
 * Flow Runner Hook
 * 
 * Manages execution of a Flow (DAG of HTTP requests) using the executor pattern.
 * Delegates all DAG execution logic to FlowExecutor for clean separation:
 * - FlowExecutor: Handles topological ordering, parallel/sequential execution, conditions
 * - This hook: Manages React state, cancellation, and UI integration
 * 
 * Uses global state (Zustand) for cross-component state sharing.
 */

import { useCallback, useRef, useMemo } from 'react';
import { useHttpAdapter } from './useAdapter';
import useAppStateStore from './store/useAppStateStore';
import type { Environment, Collection } from '../types/collection';
import type { Auth } from './store/createAuthSlice';
import type { Flow, FlowRunResult, FlowNodeResult, FlowContext, FlowRunState } from '../types/flow';
import { flowExecutor } from '../utils/executors/flowExecutor';
import {
    ExecutionContext,
    FlowExecutionInput,
    FlowExecutionConfig,
} from '../utils/executors/types';
import { createEmptyFlowContext } from '../utils/flowResolver';

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
    /** Available flows (to look up flow details if running by ID) */
    flows?: Flow[];
}

export interface RunFlowOptions {
    /** Environment ID for variable resolution */
    environmentId?: string;
    /** Default auth ID for requests without specific auth */
    defaultAuthId?: string;
    /** Whether to run nodes in parallel where possible (default: true) */
    parallel?: boolean;
}


// ============================================================================
// Default State
// ============================================================================

const DEFAULT_FLOW_RUN_STATE: FlowRunState = {
    isRunning: false,
    result: null,
    runningNodeIds: new Set(),
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Flow runner hook using the executor pattern
 */
export function useFlowRunner({
    flowId,
    environments,
    auths,
    collections,
    flows = [],
}: UseFlowRunnerOptions) {
    const httpAdapter = useHttpAdapter();
    
    // Global state management
    const state = useAppStateStore(
        (s) => s.flowRunStates[flowId] || DEFAULT_FLOW_RUN_STATE
    ) as FlowRunState;
    const setFlowRunState = useAppStateStore((s) => s.setFlowRunState);
    const clearFlowRunState = useAppStateStore((s) => s.clearFlowRunState);
    
    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const flowContextRef = useRef<FlowContext>(createEmptyFlowContext());
    
    // Memoize the flow executor instance
    const executor = useMemo(() => flowExecutor, []);
    
    /**
     * Create execution context from current state
     */
    const createContext = useCallback((
        environmentId: string | null,
        defaultAuthId: string | null
    ): ExecutionContext => ({
        httpAdapter,
        environments,
        auths,
        collections,
        flows,
        environmentId,
        defaultAuthId,
        isCancelled: () => isCancelledRef.current,
        flowContext: flowContextRef.current,
    }), [httpAdapter, environments, auths, collections, flows]);
    
    /**
     * Run a flow using the FlowExecutor
     */
    const runFlow = useCallback(async (
        flow: Flow,
        options: RunFlowOptions = {}
    ): Promise<FlowRunResult> => {
        const { environmentId, defaultAuthId, parallel = true } = options;
        
        // Reset refs
        isCancelledRef.current = false;
        flowContextRef.current = createEmptyFlowContext();
        
        // Set initial running state
        setFlowRunState(flowId, {
            isRunning: true,
            result: {
                flowId: flow.id,
                status: 'running',
                nodeResults: new Map(flow.nodes.map(n => [n.id, {
                    nodeId: n.id,
                    requestId: n.requestId,
                    alias: n.alias,
                    status: 'idle' as const,
                }])),
                activeConnectorIds: [],
                skippedConnectorIds: [],
                startedAt: new Date().toISOString(),
                progress: {
                    total: flow.nodes.length,
                    completed: 0,
                    succeeded: 0,
                    failed: 0,
                    skipped: 0,
                },
            },
            runningNodeIds: new Set(),
        });
        
        // Create execution context
        const context = createContext(
            environmentId || flow.defaultEnvId || null,
            defaultAuthId || flow.defaultAuthId || null
        );
        
        // Build input
        const input: FlowExecutionInput = {
            flowId: flow.id,
            executionId: `flow-${flow.id}-${Date.now()}`,
        };
        
        // Build config
        const config: FlowExecutionConfig = {
            parallel,
            defaultAuthId: defaultAuthId || flow.defaultAuthId || undefined,
        };
        
        // Execute flow using the executor
        // Note: The FlowExecutor looks up the flow by ID from context.flows
        // For direct execution, we need to ensure the flow is in the flows array
        // Alternative: We could add an overload to FlowExecutor that takes a Flow directly
        
        // For now, we'll create a context with the flow included
        const contextWithFlow: ExecutionContext = {
            ...context,
            flows: [flow, ...flows.filter(f => f.id !== flow.id)],
        };
        
        try {
            const execResult = await executor.execute(input, contextWithFlow, config);
            
            // Convert result and update state
            const flowRunResult: FlowRunResult = execResult.flowRunResult || {
                flowId: flow.id,
                status: execResult.status === 'success' ? 'success' :
                       execResult.status === 'cancelled' ? 'cancelled' : 'failed',
                nodeResults: new Map(),
                activeConnectorIds: [],
                skippedConnectorIds: [],
                startedAt: execResult.startedAt,
                completedAt: execResult.completedAt,
                error: execResult.error,
                progress: {
                    total: flow.nodes.length,
                    completed: 0,
                    succeeded: 0,
                    failed: 0,
                    skipped: 0,
                },
            };
            
            setFlowRunState(flowId, {
                isRunning: false,
                result: flowRunResult,
                runningNodeIds: new Set(),
            });
            
            return flowRunResult;
        } catch (err) {
            const errorResult: FlowRunResult = {
                flowId: flow.id,
                status: 'failed',
                nodeResults: new Map(),
                activeConnectorIds: [],
                skippedConnectorIds: [],
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                error: err instanceof Error ? err.message : 'Unknown error',
                progress: {
                    total: flow.nodes.length,
                    completed: 0,
                    succeeded: 0,
                    failed: 0,
                    skipped: 0,
                },
            };
            
            setFlowRunState(flowId, {
                isRunning: false,
                result: errorResult,
                runningNodeIds: new Set(),
            });
            
            return errorResult;
        }
    }, [flowId, flows, executor, createContext, setFlowRunState]);
    
    /**
     * Run a flow by ID (looks up from available flows)
     */
    const runFlowById = useCallback(async (
        targetFlowId: string,
        options: RunFlowOptions = {}
    ): Promise<FlowRunResult> => {
        const flow = flows.find(f => f.id === targetFlowId);
        if (!flow) {
            const errorResult: FlowRunResult = {
                flowId: targetFlowId,
                status: 'failed',
                nodeResults: new Map(),
                activeConnectorIds: [],
                skippedConnectorIds: [],
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                error: `Flow not found: ${targetFlowId}`,
                progress: {
                    total: 0,
                    completed: 0,
                    succeeded: 0,
                    failed: 0,
                    skipped: 0,
                },
            };
            
            setFlowRunState(flowId, {
                isRunning: false,
                result: errorResult,
                runningNodeIds: new Set(),
            });
            
            return errorResult;
        }
        
        return runFlow(flow, options);
    }, [flowId, flows, runFlow, setFlowRunState]);
    
    /**
     * Cancel the current flow run
     */
    const cancelFlow = useCallback(() => {
        isCancelledRef.current = true;
        
        const currentState = useAppStateStore.getState().flowRunStates[flowId];
        setFlowRunState(flowId, {
            ...(currentState || DEFAULT_FLOW_RUN_STATE),
            isRunning: false,
            runningNodeIds: new Set(),
            result: currentState?.result ? {
                ...currentState.result,
                status: 'cancelled',
                completedAt: new Date().toISOString(),
                error: 'Flow was cancelled',
            } : null,
        });
    }, [flowId, setFlowRunState]);
    
    /**
     * Reset the flow runner state
     */
    const resetFlow = useCallback(() => {
        isCancelledRef.current = false;
        flowContextRef.current = createEmptyFlowContext();
        
        clearFlowRunState(flowId);
    }, [flowId, clearFlowRunState]);
    
    /**
     * Get result for a specific node
     */
    const getNodeResult = useCallback((nodeId: string): FlowNodeResult | undefined => {
        return state.result?.nodeResults.get(nodeId);
    }, [state.result]);
    
    return {
        ...state,
        runFlow,
        runFlowById,
        cancelFlow,
        resetFlow,
        getNodeResult,
    };
}

export default useFlowRunner;
