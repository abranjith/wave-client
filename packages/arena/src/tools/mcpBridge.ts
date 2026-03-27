/**
 * MCP Bridge
 * 
 * Wraps MCP server tools as LangChain tools for use with agents.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';

// ============================================================================
// Types
// ============================================================================

export interface McpBridgeConfig {
  /** Function to execute MCP tool calls */
  executeToolCall: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Tool definitions supplied by the MCP runtime (single source of truth). */
  toolDefinitions: McpToolDefinition[];
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

// ============================================================================
// MCP Bridge Implementation
// ============================================================================

/**
 * Create MCP tools as LangChain tools
 */
export function createMcpBridge(config: McpBridgeConfig): any[] {
  const { executeToolCall, toolDefinitions } = config;

  return toolDefinitions.map((toolDef) => 
    new DynamicStructuredTool({
      name: toolDef.name,
      description: toolDef.description,
      schema: toolDef.inputSchema,
      func: async (args: Record<string, unknown>) => {
        try {
          const result = await executeToolCall(toolDef.name, args);
          return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error executing ${toolDef.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      },
    }) as any
  );
}

/**
 * Get list of available MCP tool names
 */
export function getMcpToolNames(toolDefinitions: McpToolDefinition[]): string[] {
  return toolDefinitions.map(t => t.name);
}

/**
 * Get MCP tool definition by name
 */
export function getMcpToolDefinition(
  toolDefinitions: McpToolDefinition[],
  name: string,
): McpToolDefinition | undefined {
  return toolDefinitions.find(t => t.name === name);
}
