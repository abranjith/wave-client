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
// Helpers
// ============================================================================

/**
 * Strips `null` values from a plain object, replacing them with `undefined`.
 *
 * LLMs (especially Ollama/Llama) frequently emit `null` for optional tool
 * parameters.  Zod's `.optional()` accepts `undefined` but rejects `null`,
 * causing LangGraph's `ToolNode` to return a schema-mismatch error.  This
 * pre-processing step normalizes `null → undefined` so the Zod parse succeeds.
 */
function stripNullValues(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

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
        schema: wrapSchemaWithNullStripping(jsonSchemaToZod(toolDef.inputSchema)),
        func: async (args: Record<string, unknown>) => {
          try {
            const cleaned = stripNullValues(args);
            const result = await client.callTool(toolDef.name, cleaned);
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

// ============================================================================
// Direct Tool Bridge (fallback — no MCP protocol overhead)
// ============================================================================

/**
 * Wraps a Zod schema with preprocessing that strips `null` values.
 *
 * LLMs send `null` for optional fields, but `z.optional()` only accepts
 * `undefined`.  This wrapper runs `stripNullValues` before the inner
 * schema validates, avoiding ToolNode schema-mismatch errors.
 *
 * The result is cast to `ZodObject` because `DynamicStructuredTool`
 * requires that type — the preprocessing layer is transparent.
 */
function wrapSchemaWithNullStripping(
  schema: z.ZodTypeAny,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  return z.preprocess(
    (val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return stripNullValues(val as Record<string, unknown>);
      }
      return val;
    },
    schema,
  ) as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>;
}

/**
 * Creates LangChain tools **directly** from the mcp-server tool registry,
 * bypassing the MCP server → transport → client chain entirely.
 *
 * This is used as a fallback when the full MCP bridge fails to initialize
 * (e.g. due to InMemoryTransport issues, dynamic import problems, or SDK
 * version mismatches).  The tools execute the same handlers — just without
 * the MCP protocol envelope.
 *
 * Platform-agnostic: works identically in VS Code, web server, and any
 * future platform because it only depends on `@wave-client/mcp-server`.
 *
 * @returns Array of LangChain tools ready for `llm.bindTools()`.
 * @throws  If the mcp-server module cannot be imported or the runtime fails
 *          to start.
 */
export async function createDirectToolBridge(): Promise<DynamicStructuredTool[]> {
  const { getMcpRuntimeTools, startMcpRuntime, executeMcpToolCall } =
    await import('@wave-client/mcp-server/server');

  // Ensure shared services (storage, settings, etc.) are initialized
  const status = await startMcpRuntime();
  if (status !== 'connected') {
    throw new Error(`MCP runtime failed to start (status: ${status})`);
  }

  const registryTools = getMcpRuntimeTools();

  return registryTools.map(
    (tool) =>
      new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: wrapSchemaWithNullStripping(tool.schema),
        func: async (args: Record<string, unknown>) => {
          try {
            const cleaned = stripNullValues(args);
            const result = await executeMcpToolCall(tool.name, cleaned);
            return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          } catch (error) {
            return `Error executing ${tool.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          }
        },
      }),
  );
}
