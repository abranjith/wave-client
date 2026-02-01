
import { z } from "zod";
import {
    flowService,
    collectionService,
    environmentService,
    storeService
} from "@wave-client/shared";
import type {
    FlowExecutionInput,
    FlowExecutionConfig,
    ExecutionContext,
    Flow as CoreFlow
} from "@wave-client/core";
import { McpHttpAdapter } from "../adapters/mcpAdapter.js";



// Schema for list_flows
export const ListFlowsSchema = z.object({
    limit: z.number().optional().describe("Limit the number of flows returned"),
    offset: z.number().optional().describe("Offset for pagination"),
});

export type ListFlowsArgs = z.infer<typeof ListFlowsSchema>;

export async function listFlowsHandler(args: ListFlowsArgs) {
    const allFlows = await flowService.loadAll();

    let result = allFlows.map(f => ({
        id: f.id,
        name: f.name,
        description: f.description,
        nodeCount: f.nodes.length,
        updatedAt: f.updatedAt
    }));

    if (args.offset !== undefined || args.limit !== undefined) {
        const offset = args.offset || 0;
        const limit = args.limit || result.length;
        result = result.slice(offset, offset + limit);
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2)
            }
        ]
    };
}

// Schema for run_flow
export const RunFlowSchema = z.object({
    flowId: z.string().describe("The ID of the flow to execute"),
    environmentId: z.string().optional().describe("Environment ID to use for variables"),
    authId: z.string().optional().describe("Auth Configuration ID to use"),
    variables: z.record(z.string()).optional().describe("Override variables for execution"),
});

export type RunFlowArgs = z.infer<typeof RunFlowSchema>;

export async function runFlowHandler(args: RunFlowArgs) {
    // 1. Load Flow
    const flow = await flowService.getById(args.flowId);
    if (!flow) {
        throw new Error(`Flow not found: ${args.flowId}`);
    }

    // 2. Load Context Data
    const [environments, auths, collections, allFlows] = await Promise.all([
        environmentService.loadAll(),
        storeService.loadAuths(), // AuthEntry[] matches Auth interface structure compatibly enough for execution
        collectionService.loadAll(),
        flowService.loadAll()
    ]);

    // 3. Create HTTP Adapter
    const httpAdapter = new McpHttpAdapter();

    // 4. Use FlowExecutor directly
    const { FlowExecutor, createEmptyFlowContext } = await import('@wave-client/core');
    const flowExecutor = new FlowExecutor();

    const coreFlow = flow as unknown as CoreFlow;
    const context: ExecutionContext = {
        httpAdapter,
        environments,
        auths: auths as any,
        collections,
        flows: allFlows as unknown as CoreFlow[],
        environmentId: args.environmentId || coreFlow.defaultEnvId || null,
        defaultAuthId: args.authId || coreFlow.defaultAuthId || null,
        isCancelled: () => false,
        flowContext: createEmptyFlowContext(),
        initialVariables: args.variables,
    };

    // 5. Execution Input & Config
    const input: FlowExecutionInput = {
        flowId: flow.id,
        executionId: `mcp-run-${Date.now()}`,
    };

    const config: FlowExecutionConfig = {
        parallel: true,
        defaultAuthId: context.defaultAuthId || undefined,
        initialVariables: args.variables
    };

    // 5. Execute
    try {
        const result = await flowExecutor.execute(input, context, config);

        // Log to stderr for debugging
        console.error('[run_flow] Execution completed:', {
            flowId: args.flowId,
            status: result.status,
            nodeCount: result.nodeResults?.size || 0,
            error: result.error
        });

        // Convert Map to Object and clean up response
        const nodeResultsObj = result.nodeResults
            ? Object.fromEntries(result.nodeResults.entries())
            : {};

        const cleanedResult = {
            flowId: result.flowId,
            status: result.status,
            nodeResults: nodeResultsObj,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
            error: result.error,
            progress: result.progress,
        };

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(cleanedResult, null, 2)
                }
            ]
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error running flow: ${message}` }],
            isError: true,
        };
    }
}
