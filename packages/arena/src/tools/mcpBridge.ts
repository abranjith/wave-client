/**
 * MCP Bridge
 *
 * Converts MCP server tools (discovered via McpClientManager) into
 * LangChain DynamicStructuredTool instances that can be bound to an LLM.
 *
 * Flow: McpClientManager.listTools() → jsonSchemaToZod() → DynamicStructuredTool
 *       each tool's `func` delegates to McpClientManager.callTool()
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { McpClientManager } from './mcpClient';

// Re-export the canonical McpToolDefinition from mcpClient
export type { McpToolDefinition } from './mcpClient';

// ============================================================================
// JSON Schema → Zod conversion
// ============================================================================

/**
 * Converts an MCP tool's JSON Schema input definition to a Zod object schema.
 *
 * Handles common primitive types (`string`, `number`, `integer`, `boolean`,
 * `array`, `object`) and preserves `description` fields so the LLM sees
 * useful parameter documentation via `bindTools()`.
 *
 * For types not explicitly handled, falls back to `z.any()`.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries(properties)) {
    let field: z.ZodTypeAny;

    switch (prop.type) {
      case 'string':
        field = z.string();
        break;
      case 'number':
      case 'integer':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array':
        field = z.array(z.any());
        break;
      case 'object':
        field = z.record(z.any());
        break;
      default:
        field = z.any();
    }

    if (prop.description && typeof prop.description === 'string') {
      field = field.describe(prop.description);
    }

    if (!required.includes(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return z.object(shape);
}

// ============================================================================
// MCP Bridge
// ============================================================================

/**
 * Creates LangChain tools from a connected McpClientManager.
 *
 * Calls `client.listTools()` to dynamically discover available tools,
 * then wraps each one as a `DynamicStructuredTool` whose `func` delegates
 * execution to `client.callTool()`.
 *
 * @param client  A connected McpClientManager instance.
 * @returns       Array of LangChain tools ready for `llm.bindTools()`.
 */
export async function createMcpBridge(
  client: McpClientManager,
): Promise<DynamicStructuredTool[]> {
  const toolDefs = await client.listTools();

  return toolDefs.map(
    (toolDef) =>
      new DynamicStructuredTool({
        name: toolDef.name,
        description: toolDef.description,
        schema: jsonSchemaToZod(toolDef.inputSchema),
        func: async (args: Record<string, unknown>) => {
          try {
            const result = await client.callTool(toolDef.name, args);
            return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error executing ${toolDef.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),
  );
}

/**
 * Get list of available MCP tool names from a connected client.
 */
export async function getMcpToolNames(client: McpClientManager): Promise<string[]> {
  const tools = await client.listTools();
  return tools.map((t) => t.name);
}
