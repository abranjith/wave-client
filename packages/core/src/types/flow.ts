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

/**
 * Generate a unique ID for flow entities
 */
export function generateFlowId(): string {
    return `flow-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique ID for flow nodes
 */
export function generateNodeId(): string {
    return `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique ID for connectors
 */
export function generateConnectorId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an empty flow
 */
export function createEmptyFlow(name: string = 'New Flow'): Flow {
    const now = new Date().toISOString();
    return {
        id: generateFlowId(),
        name,
        nodes: [],
        connectors: [],
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Create initial run result for a flow
 */
export function createInitialFlowRunResult(flow: Flow): FlowRunResult {
    const nodeResults = new Map<string, FlowNodeResult>();
    
    for (const node of flow.nodes) {
        nodeResults.set(node.id, {
            nodeId: node.id,
            requestId: node.requestId,
            alias: node.alias,
            status: 'idle',
        });
    }
    
    return {
        flowId: flow.id,
        status: 'idle',
        nodeResults,
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
    };
}

/**
 * Check if a node has no incoming connectors (is a starting node)
 */
export function isStartingNode(flow: Flow, nodeId: string): boolean {
    return !flow.connectors.some(c => c.targetNodeId === nodeId);
}

/**
 * Get all starting nodes in a flow (nodes with no incoming connectors)
 */
export function getStartingNodes(flow: Flow): FlowNode[] {
    return flow.nodes.filter(node => isStartingNode(flow, node.id));
}

/**
 * Get outgoing connectors for a node
 */
export function getOutgoingConnectors(flow: Flow, nodeId: string): FlowConnector[] {
    return flow.connectors.filter(c => c.sourceNodeId === nodeId);
}

/**
 * Get incoming connectors for a node
 */
export function getIncomingConnectors(flow: Flow, nodeId: string): FlowConnector[] {
    return flow.connectors.filter(c => c.targetNodeId === nodeId);
}

/**
 * Check if a connector condition is satisfied based on node result
 */
export function isConditionSatisfied(
    condition: ConnectorCondition,
    nodeResult: FlowNodeResult
): boolean {
    switch (condition) {
        case 'any':
            return true;
        case 'success':
            return nodeResult.status === 'success' && 
                   nodeResult.response !== undefined && 
                   nodeResult.response.status >= 200 && 
                   nodeResult.response.status < 400;
        case 'failure':
            return nodeResult.status === 'failed' || 
                   (nodeResult.response !== undefined && 
                    (nodeResult.response.status < 200 || nodeResult.response.status >= 400));
        case 'validation_pass':
            return nodeResult.response?.validationResult?.allPassed === true;
        case 'validation_fail':
            return nodeResult.response?.validationResult !== undefined && 
                   nodeResult.response.validationResult.allPassed === false;
        default:
            return false;
    }
}

/**
 * Validate flow structure (no cycles, valid connectors, etc.)
 * Returns array of validation errors, empty if valid
 */
export function validateFlow(flow: Flow): string[] {
    const errors: string[] = [];
    
    // Check for empty flow
    if (flow.nodes.length === 0) {
        errors.push('Flow must have at least one node');
        return errors;
    }
    
    // Check for duplicate node aliases
    const aliases = new Set<string>();
    for (const node of flow.nodes) {
        if (aliases.has(node.alias.toLowerCase())) {
            errors.push(`Duplicate node alias: ${node.alias}`);
        }
        aliases.add(node.alias.toLowerCase());
    }
    
    // Check for duplicate connectors (same source → target)
    const connectorPairs = new Set<string>();
    for (const connector of flow.connectors) {
        const pair = `${connector.sourceNodeId}->${connector.targetNodeId}`;
        if (connectorPairs.has(pair)) {
            errors.push(`Duplicate connector between same nodes`);
        }
        connectorPairs.add(pair);
    }
    
    // Check for self-referencing connectors
    for (const connector of flow.connectors) {
        if (connector.sourceNodeId === connector.targetNodeId) {
            errors.push('Connector cannot reference the same node');
        }
    }
    
    // Check for invalid node references in connectors
    const nodeIds = new Set(flow.nodes.map(n => n.id));
    for (const connector of flow.connectors) {
        if (!nodeIds.has(connector.sourceNodeId)) {
            errors.push(`Connector references non-existent source node: ${connector.sourceNodeId}`);
        }
        if (!nodeIds.has(connector.targetNodeId)) {
            errors.push(`Connector references non-existent target node: ${connector.targetNodeId}`);
        }
    }
    
    // Check for cycles using DFS
    const hasCycle = detectCycle(flow);
    if (hasCycle) {
        errors.push('Flow contains a cycle (circular dependency)');
    }
    
    return errors;
}

/**
 * Detect if flow has cycles using DFS
 */
function detectCycle(flow: Flow): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    function dfs(nodeId: string): boolean {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        
        const outgoing = getOutgoingConnectors(flow, nodeId);
        for (const connector of outgoing) {
            if (!visited.has(connector.targetNodeId)) {
                if (dfs(connector.targetNodeId)) {
                    return true;
                }
            } else if (recursionStack.has(connector.targetNodeId)) {
                return true;
            }
        }
        
        recursionStack.delete(nodeId);
        return false;
    }
    
    for (const node of flow.nodes) {
        if (!visited.has(node.id)) {
            if (dfs(node.id)) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Compute topological order of nodes for execution
 * Returns null if cycle detected
 */
export function getTopologicalOrder(flow: Flow): FlowNode[] | null {
    const inDegree = new Map<string, number>();
    const nodeMap = new Map<string, FlowNode>();
    
    // Initialize
    for (const node of flow.nodes) {
        inDegree.set(node.id, 0);
        nodeMap.set(node.id, node);
    }
    
    // Calculate in-degrees
    for (const connector of flow.connectors) {
        const current = inDegree.get(connector.targetNodeId) || 0;
        inDegree.set(connector.targetNodeId, current + 1);
    }
    
    // Queue nodes with no incoming edges
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
        if (degree === 0) {
            queue.push(nodeId);
        }
    }
    
    const result: FlowNode[] = [];
    
    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = nodeMap.get(nodeId);
        if (node) {
            result.push(node);
        }
        
        // Reduce in-degree of neighbors
        const outgoing = getOutgoingConnectors(flow, nodeId);
        for (const connector of outgoing) {
            const newDegree = (inDegree.get(connector.targetNodeId) || 0) - 1;
            inDegree.set(connector.targetNodeId, newDegree);
            if (newDegree === 0) {
                queue.push(connector.targetNodeId);
            }
        }
    }
    
    // If not all nodes are in result, there's a cycle
    if (result.length !== flow.nodes.length) {
        return null;
    }
    
    return result;
}

/**
 * Calculate depth of each node for auto-layout (left-to-right by depth)
 */
export function calculateNodeDepths(flow: Flow): Map<string, number> {
    const depths = new Map<string, number>();
    
    // Initialize starting nodes at depth 0
    const startingNodes = getStartingNodes(flow);
    for (const node of startingNodes) {
        depths.set(node.id, 0);
    }
    
    // BFS to calculate depths
    const queue = [...startingNodes.map(n => n.id)];
    
    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const currentDepth = depths.get(nodeId) || 0;
        
        const outgoing = getOutgoingConnectors(flow, nodeId);
        for (const connector of outgoing) {
            const existingDepth = depths.get(connector.targetNodeId);
            const newDepth = currentDepth + 1;
            
            // Use maximum depth if node has multiple incoming paths
            if (existingDepth === undefined || newDepth > existingDepth) {
                depths.set(connector.targetNodeId, newDepth);
                queue.push(connector.targetNodeId);
            }
        }
    }
    
    return depths;
}

/**
 * Auto-layout flow nodes left-to-right by depth
 */
export function autoLayoutFlow(flow: Flow): Flow {
    const depths = calculateNodeDepths(flow);
    const nodesByDepth = new Map<number, FlowNode[]>();
    
    // Group nodes by depth
    for (const node of flow.nodes) {
        const depth = depths.get(node.id) || 0;
        if (!nodesByDepth.has(depth)) {
            nodesByDepth.set(depth, []);
        }
        nodesByDepth.get(depth)!.push(node);
    }
    
    // Layout constants
    const HORIZONTAL_SPACING = 350;
    const VERTICAL_SPACING = 100;
    const START_X = 50;
    const START_Y = 50;
    
    // Update node positions
    const updatedNodes = flow.nodes.map(node => {
        const depth = depths.get(node.id) || 0;
        const nodesAtDepth = nodesByDepth.get(depth) || [];
        const indexAtDepth = nodesAtDepth.indexOf(node);
        
        return {
            ...node,
            position: {
                x: START_X + depth * HORIZONTAL_SPACING,
                y: START_Y + indexAtDepth * VERTICAL_SPACING,
            },
        };
    });
    
    return {
        ...flow,
        nodes: updatedNodes,
        updatedAt: new Date().toISOString(),
    };
}
