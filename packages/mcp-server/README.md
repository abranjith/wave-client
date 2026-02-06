# @wave-client/mcp-server

An MCP (Model Context Protocol) server for Wave-Client, enabling AI agents to interact with your API collections, environments, flows, and test suites.

## Overview

The `@wave-client/mcp-server` package bridges the gap between AI assistants and the Wave Client ecosystem. It exposes a set of standardized tools via the Model Context Protocol, allowing AI agents to:
- Inspect API collections and requests.
- Search for specific endpoints.
- Read environment configurations (with security masking).
- List and execute workflows and test suites.

This enables advanced use cases where an AI can understand your available APIs and help create workflows or tests based on them.

## Architecture

### High-Level Architecture Diagram

```
┌───────────────────────────────────────────┐
│              AI Agent / Client            │
└─────────────────────┬─────────────────────┘
                      │ MCP Protocol (JSON-RPC)
                      ▼
┌───────────────────────────────────────────┐
│          @wave-client/mcp-server          │
│                                           │
│  ┌───────────┐      ┌─────────────────┐   │
│  │ MCP Server│◄────►│ Tool Handlers   │   │
│  └───────────┘      └────────┬────────┘   │
│                              │            │
└──────────────────────────────┼────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │          @wave-client/shared        │
            │          (Services Layer)           │
            └──────────────────┬──────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │           @wave-client/core         │
            │           (Business Logic)          │
            └─────────────────────────────────────┘
```

### Package Structure

```
packages/mcp-server/
├── src/
│   ├── adapters/            # Adapters implementation
│   │   └── mcpAdapter.ts
│   ├── tools/               # Tool handlers definitions
│   │   ├── collections.ts
│   │   ├── environments.ts
│   │   ├── flows.ts
│   │   └── testSuites.ts
│   ├── config.ts            # Configuration and initialization
│   └── index.ts             # Server entry point and tool registration
├── tsconfig.json
└── package.json
```

## Key Features

### Collections & Requests Access
Inspect and search through your API collections. Agents can retrieve details about request parameters, headers, and bodies.

**Benefits:**
- Allows AI to understand the API contract.
- Enables semantic search across large API collections.

### Environment Management
Securely access environment variables to understand configuration contexts.

**Benefits:**
- Provides context for API execution.
- Security features ensure sensitive secrets are masked when exposed to LLMs.

### Automation & Testing
Interact with Wave Client's automation features like Flows and Test Suites.

**Benefits:**
- AI can list available workflows.
- Enables execution of complex orchestration chains and validation logic.

## Usage Examples

### Running with MCP Inspector
You can verify the server using the MCP Inspector tool to interactively test the available tools.

```bash
npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```

### Tool Usage

Each tool provides specific capabilities to the connected AI agent.

#### `list_collections`
Returns a summary of all loaded collections.
```json
// Result
[
  {
    "id": "col_123",
    "name": "My API",
    "requestCount": 5
  }
]
```

#### `search_requests`
Finds requests matching a query string.
```json
// Input
{
  "query": "login"
}
```

#### `list_flows`
Lists available automation flows.

#### `run_flow`
Executes a specific flow by ID.

#### `list_test_suites`
Lists available test suites.

#### `run_test_suite`
Executes a specific test suite.

## Developer Guide

### Prerequisites

- Node.js (v20 or higher)
- pnpm

### Installation

```bash
# Install dependencies from root
pnpm install
```

### Development

The `mcp-server` package allows you to run the server in watch mode for development.

```bash
# From workspace root
pnpm --filter @wave-client/mcp-server run dev
```

### Testing

#### Run Tests Once

```bash
# Run unit tests
pnpm test
```

### Project Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile TypeScript to JavaScript |
| `pnpm dev` | Watch mode for development |
| `pnpm start` | Run the compiled server |
| `pnpm test` | Run unit tests with Vitest |

## Dependencies

### Core and Shared Dependencies
- `@modelcontextprotocol/sdk`: The official SDK for building MCP servers.
- `@wave-client/shared`: Shared services and logic from the Wave Client monorepo.
- `@wave-client/core`: Core business logic and types.
- `zod`: Schema declaration and validation library.
- `axios`: Promise based HTTP client (used for some internal operations).

## License

See [LICENSE](../../LICENSE) in the project root.
