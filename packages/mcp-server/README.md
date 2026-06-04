# @wave-client/mcp-server

An **MCP (Model Context Protocol) server** that exposes your Wave Client workspace to AI agents.

## Purpose

This package lets AI assistants — whether Wave Client's own [Wave Arena](../arena/README.md) or an external MCP‑capable client — understand and act on your collections, environments, flows, and test suites through a standardized tool interface.

## Responsibilities

- Expose MCP tools to **inspect and search** collections and requests.
- **Read environments** with sensitive values masked.
- **List and run** flows and test suites.
- Tools include: `list_collections`, `search_requests`, `list_flows`, `run_flow`, `list_test_suites`, `run_test_suite`. It builds on the services in [`@wave-client/shared`](../shared/README.md) and types in [`@wave-client/core`](../core/README.md).

## Usage

Point an MCP‑capable client at the built server, for example with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — start with [AI & Wave Arena](../../docs/features/ai-arena.md).
