# Wave-Client MCP Server

An MCP (Model Context Protocol) server for [Wave-Client](https://github.com/some/repo), enabling AI agents to interact with your API collections and environments.

## Features

-   **Collections**: List, retrieve, and search API requests and collections.
-   **Environments**: Inspect environment configurations safely (secrets are masked).
-   **Secure**: Read-only access to your local Wave-Client data.

## Installation

This package is part of the Wave-Client monorepo.

1.  **Build**:
    ```bash
    pnpm build
    ```

2.  **Run**:
    ```bash
    node dist/index.js
    ```

## Usage with MCP Inspector

You can verify the server using the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Available Tools

### `list_collections`
Lists all available API collections with summary information (name, ID, request count).

### `get_collection`
Retrieves full details of a specific collection by Name or ID.

### `search_requests`
Searches for requests across all collections matching a query string. Supports filtering by HTTP method.

### `list_environments`
Lists all configured environments.

### `get_environment_variables`
Retrieves variables for a specific environment.
> **Note**: All variable values are masked (`*****`) for security to prevent leaking secrets to LLMs.

## Testing

Run unit tests:

```bash
pnpm test
```
