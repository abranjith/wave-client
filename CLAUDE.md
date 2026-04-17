# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wave Client is a modern REST API client that runs as both a VS Code extension and a standalone web app. It uses a monorepo with an adapter pattern to share 100% of the UI logic across platforms while delegating system operations (file I/O, HTTP, storage, security) to platform-specific adapters.

## Monorepo Structure (pnpm workspaces + Turborepo)

- **`packages/core`** - Platform-agnostic React UI, components, hooks, state management, and business logic. Zero platform-specific code. Built with Vite as a library (ES + CJS). This is where most development happens.
- **`packages/shared`** - Backend services (HTTP, storage, collections, environments, cookies, WebSocket, SSE, auth) used by both the VS Code extension and the server. Node.js-only.
- **`packages/vscode`** - VS Code extension. Extension backend (`extension.ts` + `MessageHandler.ts`) runs in Node.js; webview frontend renders core components via `vsCodeAdapter`. Built with webpack.
- **`packages/web`** - Standalone web app. Renders core components via `webAdapter` using browser APIs. Built with Vite.
- **`packages/server`** - Fastify server powering the web app with secure I/O (avoids CORS, provides file system access, encryption).
- **`packages/arena`** - AI agent engine using LangGraph/LangChain with MCP tool integration. Lazy-loaded in VS Code to avoid blocking extension activation.
- **`packages/mcp-server`** - MCP (Model Context Protocol) server exposing Wave Client tools to AI agents.

## Common Commands

```bash
pnpm install                # Install all dependencies
pnpm build                  # Build all packages (via Turborepo, respects dependency order)
pnpm test                   # Run all tests across packages
pnpm lint                   # ESLint across all packages

# Package-specific builds
pnpm build:core             # Build core package only
pnpm build:shared           # Build shared package only
pnpm build:vscode           # Build VS Code extension
pnpm build:web              # Build web app

# Development
pnpm watch                  # Watch-build VS Code extension (extension + webview)
pnpm dev:web                # Vite dev server for web app
pnpm dev:server             # Dev server with hot reload (tsx watch)

# Testing (all use Vitest)
cd packages/core && pnpm test          # Run core tests
cd packages/core && pnpm test:watch    # Watch mode
cd packages/core && pnpm test:coverage # With coverage (v8)
cd packages/core && npx vitest run src/test/utils/transformers/SwaggerTransformer.test.ts  # Single test file
```

## Running the VS Code Extension

1. `pnpm build` (or `pnpm watch` for continuous rebuilds)
2. In VS Code: Run and Debug > "Run Extension" (or "Run Extension (with build)")
3. In the Extension Development Host: `Ctrl+Alt+W` / `Cmd+Alt+W` or command palette > "Wave Client: Open Wave Client"

## Architecture: The Adapter Pattern

The core architectural concept. All platform I/O is abstracted behind adapter interfaces defined in `packages/core/src/types/adapters.ts`:

- **`IPlatformAdapter`** - Top-level adapter composed of sub-adapters
- Sub-adapters: `IStorageAdapter`, `IHttpAdapter`, `IFileAdapter`, `ISecretAdapter`, `ISecurityAdapter`, `INotificationAdapter`, `IArenaAdapter`, `IClipboardAdapter`, `IRealtimeAdapter`
- Components access adapters via hooks: `useAdapter()`, `useStorageAdapter()`, `useHttpAdapter()`, etc.
- Each platform implements its own adapter:
  - `packages/vscode/src/webview/adapters/vsCodeAdapter.ts` - bridges webview postMessage to extension backend
  - `packages/web/src/adapters/webAdapter.ts` - uses browser APIs + server calls

**Key rule:** `packages/core` must never import platform-specific APIs (no `vscode`, no `localStorage`, no `fs`).

## State Management

Global state uses **Zustand** with a slice pattern. The store is composed from ~15 slices in `packages/core/src/hooks/store/useAppStateStore.tsx`:

- `createCollectionsSlice`, `createEnvironmentsSlice`, `createRequestTabsSlice`, `createHistorySlice`, `createFlowsSlice`, `createTestSuitesSlice`, `createArenaSlice`, `createRealtimeSlice`, `createSettingsSlice`, etc.

Access via `useAppStateStore` hook. Prefer global state over prop-drilling; avoid duplicating global state in local component state.

## VS Code Extension: Message-based Communication

The VS Code adapter uses a request/response pattern over `postMessage`:
1. Webview calls adapter method -> sends `postMessage` with a `requestId`
2. `MessageHandler.ts` in the extension host processes the message, calls shared services
3. Extension sends response back with matching `requestId`
4. Adapter resolves the corresponding promise

Push events (banners, state changes) use the adapter event emitter system (no `requestId`).

## Result Pattern

All fallible operations use `Result<T, E>` from `packages/core/src/utils/result.ts`:
```typescript
{ isOk: true, value: data }   // Success
{ isOk: false, error: message } // Error
```
Constructors: `ok(value)` and `err(error)`. Avoid bare try/catch; use Result for consistency.

## Testing

- **Framework:** Vitest with jsdom environment and React Testing Library
- **Test location:** `packages/core/src/test/` mirroring source structure
- **Mock adapter:** `packages/core/src/test/mocks/mockAdapter.ts` - use `createMockAdapter()` for components that need `useAdapter()`
- **Pattern:** Wrap components in `<AdapterProvider adapter={mockAdapter}>`, assert on user-visible behavior
- **Coverage thresholds:** 70% lines/functions/statements, 65% branches (core package)

## Key Conventions

- **TypeScript** across all packages. Strict mode enabled.
- **React + Tailwind CSS** for UI. Component library primitives from Radix UI. Icons from Lucide React.
- **Result pattern** for all fallible adapter/service calls. Show errors via `notification.showNotification('error', message)`.
- Collection import/export uses transformer classes in `packages/core/src/utils/transformers/` (Postman, Swagger/OpenAPI, HTTP file, Wave native format).
- HTTP request execution flows through `packages/core/src/utils/executors/` (`HttpRequestExecutor`, `FlowExecutor`) which delegate to the adapter's `IHttpAdapter`.
- Arena (AI) service is lazy-loaded via dynamic `import()` in `MessageHandler.ts` to keep extension activation fast.
