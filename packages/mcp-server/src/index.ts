import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { initializeServices } from "./config.js";
import {
    ListCollectionsSchema,
    listCollectionsHandler,
    GetCollectionSchema,
    getCollectionHandler,
    SearchRequestsSchema,
    searchRequestsHandler
} from "./tools/collections.js";
import {
    GetEnvironmentVariablesSchema,
    getEnvironmentVariablesHandler
} from "./tools/environments.js";
import {
    ListEnvironmentsSchema,
    listEnvironmentsHandler
} from "./tools/environments.js";
import {
    ListFlowsSchema,
    listFlowsHandler,
    RunFlowSchema,
    runFlowHandler
} from "./tools/flows.js";
import {
    ListTestSuitesSchema,
    listTestSuitesHandler,
    RunTestSuiteSchema,
    runTestSuiteHandler
} from "./tools/test-suites.js";

// Initialize server
const server = new Server(
    {
        name: "@wave-client/mcp-server",
        version: "0.0.1",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_collections",
                description: "List all available API collections with summary information.",
                inputSchema: zodToJsonSchema(ListCollectionsSchema),
            },
            {
                name: "get_collection",
                description: "Retrieve Key details of a specific collection by name or ID, including all requests.",
                inputSchema: zodToJsonSchema(GetCollectionSchema),
            },
            {
                name: "search_requests",
                description: "Search for specific API requests across all collections.",
                inputSchema: zodToJsonSchema(SearchRequestsSchema),
            },
            {
                name: "list_environments",
                description: "List all available environments.",
                inputSchema: zodToJsonSchema(ListEnvironmentsSchema),
            },
            {
                name: "get_environment_variables",
                description: "Retrieve Key variables for a specific environment.",
                inputSchema: zodToJsonSchema(GetEnvironmentVariablesSchema),
            },
            {
                name: "list_flows",
                description: "List all available flows (request orchestration chains).",
                inputSchema: zodToJsonSchema(ListFlowsSchema),
            },
            {
                name: "run_flow",
                description: "Execute a flow by ID.",
                inputSchema: zodToJsonSchema(RunFlowSchema),
            },
            {
                name: "list_test_suites",
                description: "List all available test suites with metadata (supports nameQuery and tagQuery filters).",
                inputSchema: zodToJsonSchema(ListTestSuitesSchema),
            },
            {
                name: "run_test_suite",
                description: "Execute a test suite by ID.",
                inputSchema: zodToJsonSchema(RunTestSuiteSchema),
            }
        ],
    };
});

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        if (request.params.name === "list_collections") {
            const args = ListCollectionsSchema.parse(request.params.arguments);
            return await listCollectionsHandler(args);
        }
        if (request.params.name === "get_collection") {
            const args = GetCollectionSchema.parse(request.params.arguments);
            return await getCollectionHandler(args);
        }
        if (request.params.name === "search_requests") {
            const args = SearchRequestsSchema.parse(request.params.arguments);
            return await searchRequestsHandler(args);
        }
        if (request.params.name === "list_environments") {
            const args = ListEnvironmentsSchema.parse(request.params.arguments);
            return await listEnvironmentsHandler(args);
        }
        if (request.params.name === "get_environment_variables") {
            const args = GetEnvironmentVariablesSchema.parse(request.params.arguments);
            return await getEnvironmentVariablesHandler(args);
        }
        if (request.params.name === "list_flows") {
            const args = ListFlowsSchema.parse(request.params.arguments);
            return await listFlowsHandler(args);
        }
        if (request.params.name === "run_flow") {
            const args = RunFlowSchema.parse(request.params.arguments);
            return await runFlowHandler(args);
        }
        if (request.params.name === "list_test_suites") {
            const args = ListTestSuitesSchema.parse(request.params.arguments);
            return await listTestSuitesHandler(args);
        }
        if (request.params.name === "run_test_suite") {
            const args = RunTestSuiteSchema.parse(request.params.arguments);
            return await runTestSuiteHandler(args);
        }

        throw new Error(`Tool not found: ${request.params.name}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            content: [{ type: "text", text: `Error: ${message}` }],
            isError: true,
        };
    }
});

// Helper to convert Zod schema to JSON Schema for MCP
// Note: In a real app we might use 'zod-to-json-schema' package, 
// but here we'll do a simplified manual conversion for these specific schemas 
// to avoid adding another dependency if possible, OR we should add 'zod-to-json-schema'.
// Let's add 'zod-to-json-schema' to package.json actually, it's safer.
// For now, I'll mock it or use a simple mapping since I cannot run install right now easily without potential 404s.
// actually zod has .shape, let's just inspect it.
function zodToJsonSchema(schema: z.ZodType<any>): any {
    // Very basic Zod to JSON Schema converter for our specific use cases
    if (schema instanceof z.ZodObject) {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(schema.shape)) {
            const description = (value as any).description;
            // Handle optional
            const isOptional = (value as any).isOptional?.() || (value as any)._def.typeName === 'ZodOptional';
            let type = 'string';

            let innerType = isOptional ? (value as any)._def.innerType : value;

            if (innerType instanceof z.ZodNumber) {
                type = 'number';
            }
            if (innerType instanceof z.ZodString) {
                type = 'string';
            }

            properties[key] = { type, description };
            if (!isOptional) {
                required.push(key);
            }
        }

        return {
            type: "object",
            properties,
            required: required.length > 0 ? required : undefined
        };
    }
    return { type: "object" };
}

// Start server
async function run() {
    await initializeServices();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Wave Client MCP Server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
