# Feature Documentation: Flow Discovery and Execution for MCP Server

## 1. Feature Goal
The objective was to extend the MCP (Model Context Protocol) Server to support **Flow Discovery** and **Execution**. 
This allows AI agents and other MCP clients to:
- **Discover** available flows (orchestrated request sequences) defined in the Wave Client.
- **Execute** these flows remotely, leveraging the existing execution logic and environment configurations.

## 2. Technical Approach / Architecture

### Key Decisions
1.  **Reuse Existing Logic**: Instead of rewriting the flow execution engine, we reused the robust `FlowExecutor` from `@wave-client/core`. This ensures parity between the UI execution and MCP execution.
2.  **Shared Services**: We utilized `@wave-client/shared` for data access (loading flows, collections, environments, and auth data) from the file system.
3.  **Environment Adaptation**: The `@wave-client/core` package is platform-agnostic but requires a platform-specific `IHttpAdapter`. Since the MCP server runs in a Node.js environment (unlike the VS Code extension or Web App), we implemented a **Node.js-specific HTTP Adapter** using `axios`.

### Architecture Diagram
```mermaid
graph TD
    Client[MCP Client/Agent] -->|list_flows / run_flow| Server[MCP Server]
    
    subgraph "MCP Server Package"
        Server --> Tools[Tools Handlers]
        Tools --> NodeAdapter[NodeHttpAdapter (axios)]
    end
    
    subgraph "@wave-client/shared"
        Services[FlowService, EnvService, etc.]
    end
    
    subgraph "@wave-client/core"
        Executor[FlowExecutor]
    end
    
    Tools -->|Load Data| Services
    Tools -->|Execute| Executor
    Executor -->|Make Requests| NodeAdapter
```

## 3. Detailed Tasks & Implementation Steps

The implementation was broken down into the following distinct tasks:

### Task 1: Dependency Management
*   **Goal**: Ensure `mcp-server` has access to necessary packages.
*   **Action**: Added `@wave-client/core` and `axios` to `packages/mcp-server/package.json`.
    *   `@wave-client/core`: For `FlowExecutor`, `ExecutionContext` types.
    *   `axios`: For making HTTP requests in Node.js.

### Task 2: Infrastructure - Node HTTP Adapter
*   **Goal**: Bridge the gap between Core's `IHttpAdapter` interface and Node.js.
*   **Implementation**: Created `src/utils/NodeHttpAdapter.ts`.
    *   Implements `executeRequest(config)`.
    *   Maps `HttpRequestConfig` (Core) -> `AxiosRequestConfig` (Axios).
    *   Executes request using `axios`.
    *   Maps `AxiosResponse` -> `HttpResponseResult` (Core).
    *   *Note*: Handles both simple text and binary/base64 responses.

### Task 3: Tool Implementation
*   **Goal**: Expose functionality via MCP Tools.
*   **File**: `src/tools/flows.ts`
*   **Tool 1: `list_flows`**
    *   Uses `flowService.loadAll()` to fetch flows.
    *   Returns simplified metadata (id, name, description, node count).
    *   Supports pagination (`limit`, `offset`).
*   **Tool 2: `run_flow`**
    *   Accepts `flowId`, optional `environmentId`, `authId`, and `variables` overrides.
    *   Loads all necessary context (Environments, Collections, Auths) using Shared services.
    *   Instantiates `FlowExecutor` with the `NodeHttpAdapter`.
    *   Executes the flow and returns the full `FlowRunResult`.

### Task 4: Server Registration
*   **Goal**: Make tools available to clients.
*   **File**: `src/index.ts`
*   **Action**: Registered `list_flows` and `run_flow` in the tool definitions and RequestHandler.

## 4. Implementation Details & Code Reference

### NodeHttpAdapter (`src/utils/NodeHttpAdapter.ts`)
This adapter is the critical integration point. It normalizes headers and parameters to ensure the `FlowExecutor` logic works seamlessly in Node.

```typescript
export class NodeHttpAdapter implements IHttpAdapter {
    async executeRequest(config: HttpRequestConfig): Promise<Result<HttpResponseResult, string>> {
        // ... (Axios configuration and execution) ...
        const response = await axios(axiosConfig);
        // ... (Response mapping) ...
        return ok(result);
    }
}
```

### Flow Execution Handler (`src/tools/flows.ts`)
The handler orchestrates the setup required for `FlowExecutor`.

```typescript
export async function runFlowHandler(args: RunFlowArgs) {
    // 1. Load all context data from FS
    const [environments, auths, collections, allFlows] = await Promise.all([ ... ]);

    // 2. Setup Context with Node Adapter
    const httpAdapter = new NodeHttpAdapter();
    const context: ExecutionContext = {
        httpAdapter,
        environments,
        // ... other context
    };

    // 3. Execute
    const result = await flowExecutor.execute(input, context, config);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
}
```

## 5. Future Considerations
*   **Cookie Support**: The current adapter does not fully implement cookie jar management.
*   **Cancellation**: MCP tools are currently blocking requests, so cancellation mid-flow is not yet exposed effectively.
*   **Security Service**: Ensure the `SimpleSecurityService` in config is adequate for decrypting any sensitive auth data required by flows.
