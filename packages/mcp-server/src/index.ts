import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
    getMcpRuntimeTools,
    executeMcpToolCall,
    startMcpRuntime,
} from "./runtime.js";

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
        tools: getMcpRuntimeTools().map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: zodToJsonSchema(tool.schema),
        })),
    };
});

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
        const result = await executeMcpToolCall(
            request.params.name,
            (request.params.arguments ?? {}) as Record<string, unknown>,
        );
        return {
            content: [
                {
                    type: 'text',
                    text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
            ],
        };
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
    await startMcpRuntime();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Wave Client MCP Server running on stdio");
}

run().catch((error) => {
    console.error("Fatal error running server:", error);
    process.exit(1);
});
