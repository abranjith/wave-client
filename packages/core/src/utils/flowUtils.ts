import { Flow, FlowNode, FlowConnector, ConnectorCondition, FlowNodeResult, FlowRunResult } from '../types/flow';


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
 * Get all upstream node IDs that a node depends on (transitive closure)
 * This includes direct dependencies and all their dependencies recursively
 */
export function getUpstreamNodeIds(flow: Flow, nodeId: string): Set<string> {
    const upstream = new Set<string>();
    const visited = new Set<string>();
    
    function traverse(currentNodeId: string) {
        if (visited.has(currentNodeId)) {
            return; // Prevent cycles
        }
        visited.add(currentNodeId);
        
        const incoming = getIncomingConnectors(flow, currentNodeId);
        for (const connector of incoming) {
            const sourceId = connector.sourceNodeId;
            if (sourceId !== nodeId) { // Don't include self
                upstream.add(sourceId);
                traverse(sourceId); // Recursive traversal
            }
        }
    }
    
    traverse(nodeId);
    return upstream;
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
    const HORIZONTAL_SPACING = 300;
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
    
    // Check for duplicate node requests
    const aliasSet = new Set<string>();
    for (const node of flow.nodes) {
        if (aliasSet.has(node.alias.toLowerCase())) {
            errors.push(`Duplicate node request: ${node.alias}`);
        }
        aliasSet.add(node.alias.toLowerCase());
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