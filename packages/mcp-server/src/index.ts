/**
 * Standalone MCP Server entry point (stdio transport).
 *
 * Uses the `createMcpServer()` factory from `./server.ts` and connects it
 * to a `StdioServerTransport`.  This file is the CLI entry point for running
 * the Wave Client MCP server as a standalone process.
 *
 * For in-process usage (VS Code extension, web app), import `createMcpServer`
 * from `@wave-client/mcp-server/server` instead and attach your own transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function run() {
    const { server, initialize } = createMcpServer();
    await initialize();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Wave Client MCP Server running on stdio');
}

run().catch((error) => {
    console.error('Fatal error running server:', error);
    process.exit(1);
});
