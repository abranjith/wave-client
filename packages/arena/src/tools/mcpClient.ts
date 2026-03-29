/**
 * MCP Client Manager
 *
 * Wraps the MCP SDK `Client` with lifecycle management, tool discovery,
 * and tool invocation.  Platform-agnostic — the caller provides the
 * transport (InMemory, Stdio, SSE, WebSocket, etc.).
 *
 * Usage:
 * ```ts
 * import { McpClientManager } from '@wave-client/arena';
 * import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
 *
 * const client = new McpClientManager();
 * const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
 * // ... connect server to serverTransport ...
 * await client.connect(clientTransport);
 *
 * const tools = await client.listTools();
 * const result = await client.callTool('list_collections', {});
 * ```
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// ============================================================================
// Types
// ============================================================================

/** Tool definition as returned by the MCP server's `tools/list` method. */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ============================================================================
// McpClientManager
// ============================================================================

/**
 * Manages an MCP client connection with tool discovery and invocation.
 *
 * The client lazily discovers tools on first `listTools()` call and caches
 * them.  Call `refreshTools()` to invalidate the cache after the server
 * adds/removes tools dynamically.
 */
export class McpClientManager {
  private client: Client;
  private connected = false;
  private cachedTools: McpToolDefinition[] | null = null;

  constructor() {
    this.client = new Client(
      { name: '@wave-client/arena', version: '0.0.1' },
      { capabilities: {} },
    );
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /** Connect to an MCP server via the given transport. */
  async connect(transport: Transport): Promise<void> {
    if (this.connected) {
      await this.disconnect();
    }
    await this.client.connect(transport);
    this.connected = true;
    this.cachedTools = null;
  }

  /** Disconnect from the MCP server. */
  async disconnect(): Promise<void> {
    if (!this.connected) { return; }
    try {
      await this.client.close();
    } catch {
      // Swallow close errors — the transport may already be closed.
    }
    this.connected = false;
    this.cachedTools = null;
    // Create a fresh client for potential reconnect
    this.client = new Client(
      { name: '@wave-client/arena', version: '0.0.1' },
      { capabilities: {} },
    );
  }

  /** Whether the client is currently connected to an MCP server. */
  isConnected(): boolean {
    return this.connected;
  }

  // --------------------------------------------------------------------------
  // Tool Discovery
  // --------------------------------------------------------------------------

  /**
   * Lists all tools exposed by the connected MCP server.
   *
   * Results are cached after the first call.  Use `refreshTools()` to
   * invalidate the cache if the server's tool set changes.
   *
   * @throws Error if not connected.
   */
  async listTools(): Promise<McpToolDefinition[]> {
    if (!this.connected) {
      throw new Error('MCP client is not connected');
    }
    if (this.cachedTools) {
      return this.cachedTools;
    }

    const response = await this.client.listTools();
    this.cachedTools = (response.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object' }) as Record<string, unknown>,
    }));
    return this.cachedTools;
  }

  /** Invalidates the cached tool list so the next `listTools()` re-fetches. */
  refreshTools(): void {
    this.cachedTools = null;
  }

  // --------------------------------------------------------------------------
  // Tool Invocation
  // --------------------------------------------------------------------------

  /**
   * Calls a tool on the MCP server and returns the normalized result.
   *
   * The MCP protocol wraps tool results in a `{ content: [{ type, text }] }`
   * envelope.  This method extracts the text payload and attempts to parse it
   * as JSON.  If parsing fails, the raw text is returned.
   *
   * @param name  The tool name (must match a tool from `listTools()`).
   * @param args  The tool arguments as a plain object.
   * @returns     The parsed tool result (object or string).
   * @throws      Error if not connected or the tool call fails.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this.connected) {
      throw new Error('MCP client is not connected');
    }

    const response = await this.client.callTool({ name, arguments: args });

    // Check for tool-level error
    if (response.isError) {
      const errorText = this.extractText(response.content);
      throw new Error(errorText || `Tool '${name}' failed`);
    }

    return this.normalizeContent(response.content);
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /** Extracts the text payload from MCP content blocks. */
  private extractText(content: unknown): string {
    if (!Array.isArray(content) || content.length === 0) { return ''; }
    const first = content[0];
    if (first && typeof first === 'object' && 'text' in first) {
      return String((first as { text: unknown }).text);
    }
    return '';
  }

  /**
   * Normalizes the MCP response content:
   *  - Extracts text from the first content block
   *  - Attempts JSON.parse; returns the parsed object on success
   *  - Returns raw text on parse failure
   */
  private normalizeContent(content: unknown): unknown {
    const text = this.extractText(content);
    if (!text) { return text; }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
