/**
 * Flow Executor
 * 
 * Executes flows (DAG of HTTP requests) with:
 * - Topological ordering for dependency-aware execution
 * - Parallel execution option (Promise.race pattern) or sequential
 * - Connector condition evaluation
 * - Flow context accumulation for variable resolution
 * 
 * Used by useFlowRunner and useTestSuiteRunner.
 */

import type { Flow, FlowNode, FlowContext, FlowRunResult, FlowNodeResult } from '../../types/flow';
import type { ExecutionContext, FlowExecutionInput, FlowExecutionResult, FlowExecutionConfig } from './types';
import { HttpRequestExecutor, httpRequestExecutor } from './httpRequestExecutor';
import { findFlowById } from '../collectionLookup';
import {
    validateFlow,
    getTopologicalOrder,
    getIncomingConnectors,
    isConditionSatisfied,
} from '../flowUtils';
import { createEmptyFlowContext } from '../flowResolver';

// ============================================================================
// Flow Executor Class
// ============================================================================

/**
 * Executor for flows (DAG of HTTP requests)
 */
export class FlowExecutor {
    private httpExecutor: HttpRequestExecutor;

    constructor(httpExecutor: HttpRequestExecutor = httpRequestExecutor) {
        this.httpExecutor = httpExecutor;
    }

    /**
     * Executes a flow
     * 
     * @param input - Input containing flow ID
     * @param context - Execution context with dependencies
     * @param config - Flow execution configuration
     */
    async execute(
        input: FlowExecutionInput,
        context: ExecutionContext,
        config: FlowExecutionConfig = {}
    ): Promise<FlowExecutionResult> {
        const startedAt = new Date().toISOString();
        const executionId = input.executionId || `flow-${input.flowId}-${Date.now()}`;
        const parallel = config.parallel !== false; // Default to parallel

        // Find the flow
        const flows = context.flows || [];
        const flow = findFlowById(input.flowId, flows);
        if (!flow) {
            return this.createErrorResult(
                executionId,
                input.flowId,
                `Flow not found: ${input.flowId}`,
                startedAt
            );
        }

        // Validate flow structure
        const validationErrors = validateFlow(flow);
        if (validationErrors.length > 0) {
            return this.createErrorResult(
                executionId,
                input.flowId,
                `Invalid flow: ${validationErrors.join('; ')}`,
                startedAt
            );
        }

        // Get topological order
        const executionOrder = getTopologicalOrder(flow);
        if (!executionOrder) {
            return this.createErrorResult(
                executionId,
                input.flowId,
                'Flow contains a cycle',
                startedAt
            );
        }

        // Execute based on mode
        const flowRunResult = parallel
            ? await this.executeParallel(flow, executionOrder, context, config)
            : await this.executeSequential(flow, executionOrder, context, config);

        // Derive validation status from node validations
        const validationStatus = this.deriveValidationStatus(flowRunResult.nodeResults);

        return {
            id: executionId,
            flowId: input.flowId,
            status: flowRunResult.status === 'success' ? 'success' :
                flowRunResult.status === 'cancelled' ? 'cancelled' : 'failed',
            validationStatus,
            flowRunResult,
            error: flowRunResult.error,
            startedAt,
            completedAt: flowRunResult.completedAt || new Date().toISOString(),
        };
    }

    // ========================================================================
    // Sequential Execution
    // ========================================================================

    /**
     * Executes flow nodes sequentially in topological order
     */
    private async executeSequential(
        flow: Flow,
        executionOrder: FlowNode[],
        context: ExecutionContext,
        config: FlowExecutionConfig
    ): Promise<FlowRunResult> {
        const startedAt = new Date().toISOString();
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

        // Create execution context with flow context
        const flowExecutionContext: ExecutionContext = {
            ...context,
            flowContext,
            defaultAuthId: config.defaultAuthId || context.defaultAuthId || flow.defaultAuthId || null,
            initialVariables: config.initialVariables,
        };

        // Execute nodes in order
        for (const node of executionOrder) {
            if (context.isCancelled()) {
                break;
            }

            // Check if dependencies are satisfied
            const { canExecute, activeConns, skippedConns } = this.checkDependencies(
                flow, node.id, nodeResults
            );
            activeConnectorIds.push(...activeConns);
            skippedConnectorIds.push(...skippedConns);

            if (!canExecute) {
                nodeResults.set(node.id, {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'skipped',
                });
                continue;
            }

            // Mark as running
            nodeResults.set(node.id, {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: 'running',
            });

            // Execute node
            const result = await this.httpExecutor.executeFlowNode(node, flow, flowExecutionContext);

            // Convert HTTP result to FlowNodeResult
            const nodeResult: FlowNodeResult = {
                nodeId: node.id,
                requestId: node.requestId,
                alias: node.alias,
                status: result.status === 'success' ? 'success' :
                    result.status === 'cancelled' ? 'skipped' : 'failed',
                response: result.response,
                error: result.error,
                startedAt: result.startedAt,
                completedAt: result.completedAt,
            };
            nodeResults.set(node.id, nodeResult);

            // Update flow context with response
            if (result.response) {
                flowContext.responses.set(node.alias, result.response);
                flowContext.executionOrder.push(node.alias);
            }

            // Stop on failure (flows always stop on failure)
            if (nodeResult.status === 'failed') {
                break;
            }
        }

        return this.buildFlowRunResult(
            flow, nodeResults, activeConnectorIds, skippedConnectorIds, startedAt, context.isCancelled()
        );
    }

    // ========================================================================
    // Parallel Execution
    // ========================================================================

    /**
     * Executes flow nodes in parallel where dependencies allow
     * Uses Promise.race pattern for early completion detection
     */
    private async executeParallel(
        flow: Flow,
        executionOrder: FlowNode[],
        context: ExecutionContext,
        config: FlowExecutionConfig
    ): Promise<FlowRunResult> {
        const startedAt = new Date().toISOString();
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

        // Create execution context with flow context
        const flowExecutionContext: ExecutionContext = {
            ...context,
            flowContext,
            defaultAuthId: config.defaultAuthId || context.defaultAuthId || flow.defaultAuthId || null,
            initialVariables: config.initialVariables,
        };

        // Node tracking
        const nodeMap = new Map(flow.nodes.map(n => [n.id, n]));
        const pendingNodes = new Set(executionOrder.map(n => n.id));
        const completedNodes = new Set<string>();
        const activePromises = new Map<string, Promise<{ nodeId: string; result: FlowNodeResult }>>();
        const inFlightNodeIds = new Set<string>();

        // Process nodes
        while (pendingNodes.size > 0 || activePromises.size > 0) {
            if (context.isCancelled()) {
                break;
            }

            // Find ready nodes (dependencies satisfied, not in-flight)
            const readyNodes: FlowNode[] = [];
            for (const nodeId of pendingNodes) {
                if (inFlightNodeIds.has(nodeId)) {
                    continue;
                }

                const { canExecute, activeConns } = this.checkDependencies(
                    flow, nodeId, nodeResults
                );

                if (canExecute) {
                    const node = nodeMap.get(nodeId);
                    if (node) {
                        readyNodes.push(node);
                        activeConnectorIds.push(...activeConns);
                    }
                } else {
                    // Check if all incoming sources are completed but conditions not met
                    const incoming = getIncomingConnectors(flow, nodeId);
                    const allSourcesCompleted = incoming.every(conn => {
                        const sourceResult = nodeResults.get(conn.sourceNodeId);
                        return sourceResult && (
                            sourceResult.status === 'success' ||
                            sourceResult.status === 'failed' ||
                            sourceResult.status === 'skipped'
                        );
                    });

                    if (allSourcesCompleted && incoming.length > 0) {
                        // Skip this node - no conditions were satisfied
                        pendingNodes.delete(nodeId);
                        completedNodes.add(nodeId);
                        skippedConnectorIds.push(...incoming.map(c => c.id));
                        nodeResults.set(nodeId, {
                            nodeId,
                            requestId: nodeMap.get(nodeId)?.requestId || '',
                            alias: nodeMap.get(nodeId)?.alias || '',
                            status: 'skipped',
                        });
                    }
                }
            }

            // Start execution for ready nodes
            for (const node of readyNodes) {
                pendingNodes.delete(node.id);
                inFlightNodeIds.add(node.id);

                // Mark as running
                nodeResults.set(node.id, {
                    nodeId: node.id,
                    requestId: node.requestId,
                    alias: node.alias,
                    status: 'running',
                });

                // Create execution promise
                const promise = this.httpExecutor.executeFlowNode(node, flow, flowExecutionContext)
                    .then(result => ({
                        nodeId: node.id,
                        result: {
                            nodeId: node.id,
                            requestId: node.requestId,
                            alias: node.alias,
                            status: result.status === 'success' ? 'success' :
                                result.status === 'cancelled' ? 'skipped' : 'failed',
                            response: result.response,
                            error: result.error,
                            startedAt: result.startedAt,
                            completedAt: result.completedAt,
                        } as FlowNodeResult,
                    }));

                activePromises.set(node.id, promise);
            }

            // Wait for any promise to complete
            if (activePromises.size > 0) {
                const { nodeId, result } = await Promise.race(activePromises.values());

                activePromises.delete(nodeId);
                inFlightNodeIds.delete(nodeId);
                completedNodes.add(nodeId);
                nodeResults.set(nodeId, result);

                // Update flow context
                if (result.response) {
                    const node = nodeMap.get(nodeId);
                    if (node) {
                        flowContext.responses.set(node.alias, result.response);
                        flowContext.executionOrder.push(node.alias);
                    }
                }

                // Stop on failure
                if (result.status === 'failed') {
                    // Mark remaining in-flight nodes as skipped (they're still executing but we're stopping)
                    for (const nodeId of inFlightNodeIds) {
                        nodeResults.set(nodeId, {
                            nodeId,
                            requestId: nodeMap.get(nodeId)?.requestId || '',
                            alias: nodeMap.get(nodeId)?.alias || '',
                            status: 'skipped',
                        });
                    }
                    inFlightNodeIds.clear();
                    activePromises.clear();

                    // Mark pending nodes as skipped
                    for (const pendingId of pendingNodes) {
                        nodeResults.set(pendingId, {
                            nodeId: pendingId,
                            requestId: nodeMap.get(pendingId)?.requestId || '',
                            alias: nodeMap.get(pendingId)?.alias || '',
                            status: 'skipped',
                        });
                    }
                    pendingNodes.clear();
                    break;
                }
            } else if (pendingNodes.size > 0) {
                // No ready nodes and no active promises - deadlock or all skipped
                // Mark remaining pending nodes with final status to prevent stuck states
                for (const pendingId of pendingNodes) {
                    const result = nodeResults.get(pendingId);
                    if (result && (result.status === 'idle' || result.status === 'running')) {
                        nodeResults.set(pendingId, {
                            ...result,
                            status: 'skipped',
                        });
                    }
                }
                break;
            }
        }

        return this.buildFlowRunResult(
            flow, nodeResults, activeConnectorIds, skippedConnectorIds, startedAt, context.isCancelled()
        );
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    /**
     * Checks if a node's dependencies are satisfied
     */
    private checkDependencies(
        flow: Flow,
        nodeId: string,
        nodeResults: Map<string, FlowNodeResult>
    ): { canExecute: boolean; activeConns: string[]; skippedConns: string[] } {
        const incoming = getIncomingConnectors(flow, nodeId);
        const activeConns: string[] = [];
        const skippedConns: string[] = [];

        // No dependencies - can execute
        if (incoming.length === 0) {
            return { canExecute: true, activeConns, skippedConns };
        }

        // Check each incoming connector
        let anyConditionMet = false;

        for (const conn of incoming) {
            const sourceResult = nodeResults.get(conn.sourceNodeId);

            // Source not completed yet
            if (!sourceResult || sourceResult.status === 'idle' || sourceResult.status === 'running' || sourceResult.status === 'pending') {
                return { canExecute: false, activeConns, skippedConns };
            }

            // Check condition
            if (isConditionSatisfied(conn.condition, sourceResult)) {
                anyConditionMet = true;
                activeConns.push(conn.id);
            } else {
                skippedConns.push(conn.id);
            }
        }

        return { canExecute: anyConditionMet, activeConns, skippedConns };
    }

    /**
     * Builds the final FlowRunResult
     */
    private buildFlowRunResult(
        flow: Flow,
        nodeResults: Map<string, FlowNodeResult>,
        activeConnectorIds: string[],
        skippedConnectorIds: string[],
        startedAt: string,
        wasCancelled: boolean
    ): FlowRunResult {
        const succeeded = Array.from(nodeResults.values()).filter(r => r.status === 'success').length;
        const failed = Array.from(nodeResults.values()).filter(r => r.status === 'failed').length;
        const skipped = Array.from(nodeResults.values()).filter(r => r.status === 'skipped').length;

        const hasFailed = failed > 0;

        return {
            flowId: flow.id,
            status: hasFailed ? 'failed' : (wasCancelled ? 'cancelled' : 'success'),
            nodeResults,
            activeConnectorIds,
            skippedConnectorIds,
            startedAt,
            completedAt: new Date().toISOString(),
            error: hasFailed
                ? `${failed} node(s) failed`
                : (wasCancelled ? 'Flow was cancelled' : undefined),
            progress: {
                total: flow.nodes.length,
                completed: succeeded + failed + skipped,
                succeeded,
                failed,
                skipped,
            },
        };
    }

    /**
     * Derives validation status from all node results
     */
    private deriveValidationStatus(
        nodeResults: Map<string, FlowNodeResult>
    ): 'idle' | 'pending' | 'pass' | 'fail' {
        const nodeValidationResults = Array.from(nodeResults.values())
            .filter(r => r.response?.validationResult)
            .map(r => r.response!.validationResult!);

        if (nodeValidationResults.length === 0) {
            return 'idle';
        }

        const allPassed = nodeValidationResults.every(v => v.allPassed);
        return allPassed ? 'pass' : 'fail';
    }

    /**
     * Creates an error result
     */
    private createErrorResult(
        id: string,
        flowId: string,
        error: string,
        startedAt: string
    ): FlowExecutionResult {
        return {
            id,
            flowId,
            status: 'failed',
            validationStatus: 'idle',
            error,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Shared instance of the flow executor
 */
export const flowExecutor = new FlowExecutor();
