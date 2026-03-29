import { z } from 'zod';
import { initializeServices } from './config.js';
import {
  ListCollectionsSchema,
  listCollectionsHandler,
  GetCollectionSchema,
  getCollectionHandler,
  SearchRequestsSchema,
  searchRequestsHandler,
} from './tools/collections.js';
import {
  ListEnvironmentsSchema,
  listEnvironmentsHandler,
  GetEnvironmentVariablesSchema,
  getEnvironmentVariablesHandler,
} from './tools/environments.js';
import {
  ListFlowsSchema,
  listFlowsHandler,
  RunFlowSchema,
  runFlowHandler,
} from './tools/flows.js';
import {
  ListTestSuitesSchema,
  listTestSuitesHandler,
  RunTestSuiteSchema,
  runTestSuiteHandler,
} from './tools/testSuites.js';

export type McpRuntimeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type McpToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

export interface McpRuntimeTool {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: McpToolHandler;
}

const MCP_RUNTIME_TOOLS: McpRuntimeTool[] = [
  {
    name: 'list_collections',
    description: 'List all available API collections with summary information.',
    schema: ListCollectionsSchema,
    handler: (args) => listCollectionsHandler(args as z.infer<typeof ListCollectionsSchema>),
  },
  {
    name: 'get_collection',
    description: 'Retrieve key details of a specific collection by name or ID, including all requests.',
    schema: GetCollectionSchema,
    handler: (args) => getCollectionHandler(args as z.infer<typeof GetCollectionSchema>),
  },
  {
    name: 'search_requests',
    description: 'Search for specific API requests across all collections.',
    schema: SearchRequestsSchema,
    handler: (args) => searchRequestsHandler(args as z.infer<typeof SearchRequestsSchema>),
  },
  {
    name: 'list_environments',
    description: 'List all available environments.',
    schema: ListEnvironmentsSchema,
    handler: (args) => listEnvironmentsHandler(args as z.infer<typeof ListEnvironmentsSchema>),
  },
  {
    name: 'get_environment_variables',
    description: 'Retrieve key variables for a specific environment.',
    schema: GetEnvironmentVariablesSchema,
    handler: (args) => getEnvironmentVariablesHandler(args as z.infer<typeof GetEnvironmentVariablesSchema>),
  },
  {
    name: 'list_flows',
    description: 'List all available flows (request orchestration chains).',
    schema: ListFlowsSchema,
    handler: (args) => listFlowsHandler(args as z.infer<typeof ListFlowsSchema>),
  },
  {
    name: 'run_flow',
    description: 'Execute a flow by ID.',
    schema: RunFlowSchema,
    handler: (args) => runFlowHandler(args as z.infer<typeof RunFlowSchema>),
  },
  {
    name: 'list_test_suites',
    description: 'List all available test suites with metadata (supports search filters).',
    schema: ListTestSuitesSchema,
    handler: (args) => listTestSuitesHandler(args as z.infer<typeof ListTestSuitesSchema>),
  },
  {
    name: 'run_test_suite',
    description: 'Execute a test suite by ID.',
    schema: RunTestSuiteSchema,
    handler: (args) => runTestSuiteHandler(args as z.infer<typeof RunTestSuiteSchema>),
  },
];

let runtimeStatus: McpRuntimeStatus = 'disconnected';
let initialized = false;

export async function startMcpRuntime(): Promise<McpRuntimeStatus> {
  if (runtimeStatus === 'connected') {
    return runtimeStatus;
  }

  runtimeStatus = 'connecting';

  try {
    if (!initialized) {
      await initializeServices();
      initialized = true;
    }
    runtimeStatus = 'connected';
  } catch (error) {
    runtimeStatus = 'error';
    console.error('[mcp-runtime] failed to initialize services', error);
  }

  return runtimeStatus;
}

export function getMcpRuntimeStatus(): McpRuntimeStatus {
  return runtimeStatus;
}

export function stopMcpRuntime(): McpRuntimeStatus {
  runtimeStatus = 'disconnected';
  return runtimeStatus;
}

export function getMcpRuntimeTools(): ReadonlyArray<McpRuntimeTool> {
  return MCP_RUNTIME_TOOLS;
}

function normalizeToolResponse(value: unknown): unknown {
  if (
    value &&
    typeof value === 'object' &&
    'content' in value &&
    Array.isArray((value as { content?: unknown[] }).content)
  ) {
    const first = (value as { content: Array<{ text?: unknown }> }).content[0];
    if (first && typeof first.text === 'string') {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
  }
  return value;
}

export async function executeMcpToolCall(
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  if (runtimeStatus !== 'connected') {
    throw new Error('MCP server is not connected');
  }

  const tool = MCP_RUNTIME_TOOLS.find((t) => t.name === toolName);
  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }

  const parsedArgs = tool.schema.parse(args ?? {});
  const response = await tool.handler(parsedArgs as Record<string, unknown>);
  return normalizeToolResponse(response);
}
