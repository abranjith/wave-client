/**
 * MCP Server Factory
 *
 * Creates and returns a configured MCP `Server` instance with all Wave Client
 * tool handlers registered — but **without** connecting any transport.
 *
 * Platform layers attach the appropriate transport:
 *  - Standalone CLI: `StdioServerTransport` (see `index.ts`)
 *  - VS Code extension: `InMemoryTransport` (in-process, zero overhead)
 *  - Web / remote: SSE, WebSocket, or Streamable HTTP transports
 *
 * Usage:
 * ```ts
 * import { createMcpServer } from '@wave-client/mcp-server/server';
 * import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
 *
 * const server = createMcpServer();
 * const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
 * await server.connect(serverTransport);
 * ```
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  getMcpRuntimeTools,
  executeMcpToolCall,
  startMcpRuntime,
} from './toolRegistry.js';

// ---------------------------------------------------------------------------
// Zod → JSON Schema converter
// ---------------------------------------------------------------------------

/**
 * Converts a Zod schema to a JSON Schema object suitable for MCP tool
 * `inputSchema` definitions.
 *
 * Handles `ZodObject` with optional/required fields, `ZodString`, `ZodNumber`,
 * and `ZodRecord`.  Falls back to `{ type: "object" }` for unsupported types.
 */
function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(schema.shape)) {
      const description = (value as z.ZodTypeAny).description;
      const isOptional =
        (value as z.ZodTypeAny).isOptional?.() ||
        (value as z.ZodTypeAny)._def.typeName === 'ZodOptional';

      const innerType = isOptional
        ? (value as z.ZodOptional<z.ZodTypeAny>)._def.innerType
        : value;

      let type = 'string';
      if (innerType instanceof z.ZodNumber) { type = 'number'; }
      if (innerType instanceof z.ZodRecord) { type = 'object'; }

      const prop: Record<string, unknown> = { type };
      if (description) { prop.description = description; }
      properties[key] = prop;

      if (!isOptional) { required.push(key); }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required }),
    };
  }
  return { type: 'object' };
}

// ---------------------------------------------------------------------------
// Server Factory
// ---------------------------------------------------------------------------

export interface CreateMcpServerOptions {
  /** Server name reported to clients. Defaults to `"@wave-client/mcp-server"`. */
  name?: string;
  /** Server version reported to clients. Defaults to `"0.0.1"`. */
  version?: string;
  /**
   * Whether to call `startMcpRuntime()` to initialize shared services
   * before the server starts handling requests.  Defaults to `true`.
   *
   * Set to `false` if the runtime is already initialized by the host process
   * (e.g. VS Code extension that pre-initializes shared services).
   */
  initializeRuntime?: boolean;
}

/**
 * Creates a fully configured MCP `Server` with all Wave Client tools
 * registered.  The returned server has **no transport attached** — the
 * caller is responsible for connecting a transport before use.
 *
 * @param options  Optional configuration overrides.
 * @returns An object containing the `server` and an `initialize()` helper
 *          that should be called before the first tool invocation to ensure
 *          shared services are loaded.
 */
export function createMcpServer(options: CreateMcpServerOptions = {}) {
  const {
    name = '@wave-client/mcp-server',
    version = '0.0.1',
    initializeRuntime = true,
  } = options;

  const server = new Server(
    { name, version },
    { capabilities: { tools: {} } },
  );

  // ── List Tools ──────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getMcpRuntimeTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.schema),
    })),
  }));

  // ── Call Tool ───────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await executeMcpToolCall(
        request.params.name,
        (request.params.arguments ?? {}) as Record<string, unknown>,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text:
              typeof result === 'string'
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  /**
   * Initializes the MCP runtime (shared services like `settingsService`,
   * `collectionService`, etc.).  Must be awaited before tool invocations
   * can succeed.
   */
  async function initialize(): Promise<void> {
    if (initializeRuntime) {
      await startMcpRuntime();
    }
  }

  return { server, initialize };
}
