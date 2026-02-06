/**
 * MCP Bridge
 * 
 * Wraps MCP server tools as LangChain tools for use with agents.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface McpBridgeConfig {
  /** Function to execute MCP tool calls */
  executeToolCall: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

// ============================================================================
// MCP Tool Definitions
// ============================================================================

/**
 * Available MCP tools from @wave-client/mcp-server
 */
const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'list_collections',
    description: 'List all API collections in Wave Client',
    inputSchema: z.object({}),
  },
  {
    name: 'get_collection',
    description: 'Get a specific collection by name or ID',
    inputSchema: z.object({
      nameOrId: z.string().describe('Collection name or ID'),
    }),
  },
  {
    name: 'search_requests',
    description: 'Search for requests across all collections',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      collection: z.string().optional().describe('Optional collection name to search in'),
    }),
  },
  {
    name: 'list_environments',
    description: 'List all environments in Wave Client',
    inputSchema: z.object({}),
  },
  {
    name: 'get_environment_variables',
    description: 'Get variables for a specific environment',
    inputSchema: z.object({
      environmentName: z.string().describe('Environment name'),
    }),
  },
  {
    name: 'list_flows',
    description: 'List all automation flows',
    inputSchema: z.object({}),
  },
  {
    name: 'run_flow',
    description: 'Execute an automation flow',
    inputSchema: z.object({
      flowId: z.string().describe('Flow ID to execute'),
      environment: z.string().optional().describe('Environment to use'),
    }),
  },
  {
    name: 'list_test_suites',
    description: 'List all test suites',
    inputSchema: z.object({}),
  },
  {
    name: 'run_test_suite',
    description: 'Execute a test suite',
    inputSchema: z.object({
      suiteId: z.string().describe('Test suite ID to execute'),
      environment: z.string().optional().describe('Environment to use'),
    }),
  },
];

// ============================================================================
// MCP Bridge Implementation
// ============================================================================

/**
 * Create MCP tools as LangChain tools
 */
export function createMcpBridge(config: McpBridgeConfig): any[] {
  const { executeToolCall } = config;

  return MCP_TOOL_DEFINITIONS.map((toolDef) => 
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
export function getMcpToolNames(): string[] {
  return MCP_TOOL_DEFINITIONS.map(t => t.name);
}

/**
 * Get MCP tool definition by name
 */
export function getMcpToolDefinition(name: string): McpToolDefinition | undefined {
  return MCP_TOOL_DEFINITIONS.find(t => t.name === name);
}
