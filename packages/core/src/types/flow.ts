/**
 * Flow Types for Wave Client
 * 
 * Flow is a visual request orchestration feature where users can create
 * dependency-aware chains of HTTP requests. Output from one request can
 * feed as input to subsequent requests using dot-path JSON access.
 */

import type { HttpResponseResult } from './adapters';

// ============================================================================
// Core Flow Types
// ============================================================================

/**
 * Condition types for connectors between flow nodes.
 * Determines when a downstream request should execute.
 */
export type ConnectorCondition = 
    | 'success'           // HTTP 2xx status
    | 'failure'           // HTTP 4xx/5xx or error
    | 'validation_pass'   // Validation rules all passed
    | 'validation_fail'   // Any validation rule failed
    | 'any';              // Always execute (unconditional)

/**
 * A node in the flow canvas representing a request.
 * Nodes reference existing requests by requestId from collections.
 */
export interface FlowNode {
    /** Unique identifier for this node in the flow */
    id: string;
    /** User-defined alias for referencing this node's output in variables (e.g., {{getUser.body.id}}) */
    alias: string;
    /** Reference to the collection request (collectionFilename:requestId format or just requestId) */
    requestId: string;
    /** Display name (cached from request for quick display) */
    name: string;
    /** HTTP method (cached from request for quick display) */
    method: string;
    /** Position on the canvas */
    position: {
        x: number;
        y: number;
    };
}

/**
 * A connector (edge) between two flow nodes.
 * Defines the dependency and execution condition.
 */
export interface FlowConnector {
    /** Unique identifier for this connector */
    id: string;
    /** Source node ID (the node that must complete first) */
    sourceNodeId: string;
    /** Target node ID (the node that executes after source completes) */
    targetNodeId: string;
    /** Condition that must be met for the target to execute */
    condition: ConnectorCondition;
}

/**
 * Main Flow type - represents a complete flow definition.
 * Stored on disk and used directly in UI.
 */
export interface Flow {
    /** Unique identifier for this flow */
    id: string;
    /** User-defined name */
    name: string;
    /** Optional description */
    description?: string;
    /** Nodes (requests) in this flow */
    nodes: FlowNode[];
    /** Connectors (edges) between nodes */
    connectors: FlowConnector[];
    /** Default auth configuration ID for all requests */
    defaultAuthId?: string;
    /** Default environment ID for variable resolution */
    defaultEnvId?: string;
    /** Whether this flow is currently running (supports parallel execution) */
    isRunning?: boolean;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
}

// ============================================================================
// Flow Execution Types
// ============================================================================

/**
 * Status of a flow run
 */
export type FlowRunStatus = 
    | 'idle'      // Not started
    | 'running'   // In progress
    | 'success'   // All executed nodes succeeded
    | 'failed'    // At least one node failed or unresolved params
    | 'cancelled'; // User cancelled

/**
 * Status of an individual node during flow execution
 */
export type FlowNodeStatus = 
    | 'idle'      // Not yet processed
    | 'pending'   // Waiting for dependencies
    | 'running'   // Currently executing
    | 'success'   // Completed successfully (2xx)
    | 'failed'    // Failed (error or non-2xx)
    | 'skipped';  // Skipped due to condition not met

/**
 * Result of a single node execution
 */
export interface FlowNodeResult {
    /** Node ID */
    nodeId: string;
    /** Request ID (reference to collection request) */
    requestId: string;
    /** Node alias for easy identification */
    alias: string;
    /** Execution status */
    status: FlowNodeStatus;
    /** HTTP response if request was executed */
    response?: HttpResponseResult;
    /** Error message if failed */
    error?: string;
    /** Parameters that were resolved from flow context */
    resolvedFlowParams?: Record<string, string>;
    /** Execution start time */
    startedAt?: string;
    /** Execution end time */
    completedAt?: string;
}

/**
 * Result of a complete flow run
 */
export interface FlowRunResult {
    /** Flow ID */
    flowId: string;
    /** Overall run status */
    status: FlowRunStatus;
    /** Results for each node (keyed by nodeId) */
    nodeResults: Map<string, FlowNodeResult>;
    /** IDs of connectors that were activated (condition was met and target executed) */
    activeConnectorIds: string[];
    /** IDs of connectors that were skipped (condition not met) */
    skippedConnectorIds: string[];
    /** Run start time */
    startedAt: string;
    /** Run completion time */
    completedAt?: string;
    /** Overall error message if flow failed */
    error?: string;
    /** Progress tracking */
    progress: {
        total: number;
        completed: number;
        succeeded: number;
        failed: number;
        skipped: number;
    };
}

// ============================================================================
// Flow State (for React hooks)
// ============================================================================

/**
 * State managed by useFlowRunner hook
 */
export interface FlowRunState {
    /** Whether a flow is currently running */
    isRunning: boolean;
    /** Current run result (updated as flow progresses) */
    result: FlowRunResult | null;
    /** Currently running node IDs */
    runningNodeIds: Set<string>;
}

// ============================================================================
// Flow Resolution Types
// ============================================================================

/**
 * Result of resolving flow variables in a string
 */
export interface FlowResolveResult {
    /** The resolved string */
    resolved: string;
    /** Variables that couldn't be resolved */
    unresolved: string[];
    /** Variables that were successfully resolved from flow context */
    resolvedFromFlow: string[];
}

/**
 * Context passed to the flow resolver containing completed node responses
 */
export interface FlowContext {
    /** Map of node alias -> response data for completed nodes */
    responses: Map<string, HttpResponseResult>;
    /** Execution order of nodes (for "most recent first" lookup) */
    executionOrder: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================
