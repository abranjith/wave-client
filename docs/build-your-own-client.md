# Build Your Own Client

Wave Client is designed so the **client** — VS Code, the browser, or anything else — is a thin shell around a shared, platform‑agnostic core. The VS Code extension and the web app are simply the first two clients; the architecture is **not limited to them**. This guide is for anyone who wants to build a new one: a CLI, a desktop (Electron) app, a mobile client, a different editor integration, or something we haven't thought of.

Read the [Design & Architecture guide](design.md) first for the big picture; this page focuses on the practical steps.

---

## The core idea

Everything platform-independent — UI components, state, business logic, types, and pure utilities — lives in [`@wave-client/core`](../packages/core/README.md). Anything that touches the outside world (storage, HTTP, files, secrets, encryption, notifications, clipboard, real-time connections) is expressed as an **interface**, `IPlatformAdapter`. A client provides one concrete implementation of that interface for its environment.

```
@wave-client/core (UI + logic)  ──uses──▶  IPlatformAdapter (interface)
                                                  ▲
                                   your client provides the implementation
```

So "building a client" mostly means **implementing `IPlatformAdapter`** for your platform and wiring it in.

---

## Two kinds of clients

**1. UI clients** reuse the core React UI (like VS Code and the web app). You implement the adapter, then wrap the shared UI with it. Best when you want the full Wave Client experience in a new host.

**2. Headless clients** (for example, a CLI) may skip the React UI entirely. Instead they reuse:
- [`@wave-client/shared`](../packages/shared/README.md) — the Node-side **services** (`HttpService`, `WebSocketService`, `SseService`, collection/environment/validation logic), and
- [`@wave-client/core`](../packages/core/README.md) — **types** and pure **utilities** (collection parsing, variable/`_fn_` resolution, JSONPath helpers).

…and present results however you like (terminal output, JSON, etc.).

---

## The contract: `IPlatformAdapter`

Defined in [`packages/core/src/types/adapters.ts`](../packages/core/src/types/adapters.ts). A client implements these:

| Member | Kind | Responsibility |
| --- | --- | --- |
| `storage` | required | Collections, environments, history, cookies, auth, proxies, certs, validation rules, settings |
| `http` | required | Execute (and cancel) HTTP requests |
| `file` | required | File dialogs and read/write/import/download |
| `secret` | required | Secure key storage |
| `security` | required | Encryption enable/disable, password change, recovery key |
| `notification` | required | User notifications and dialogs |
| `arena` | required | AI assistant storage/streaming integration |
| `clipboard` | required | Read/write the platform clipboard |
| `events` | required | Push-event emitter (banners, "data changed" signals, …) |
| `realtime` | optional | WebSocket/SSE connections (UI guards against its absence) |
| `platform` | required | Identifier: `'vscode' | 'web' | 'test'` |
| `initialize?()` / `dispose?()` | optional | Lifecycle hooks |

Every fallible method returns a typed [`Result<T, E>`](design.md#the-result-pattern) instead of throwing.

> **Adding a new platform id:** the `platform` field is currently typed `'vscode' | 'web' | 'test'`. A brand-new client (e.g. `'cli'`) needs that union extended in `packages/core/src/types/adapters.ts`. Until then, a new client can reuse `'web'` or `'test'` while prototyping.

---

## Building a UI client

### 1. Implement the adapter

Create one object that satisfies `IPlatformAdapter`. Each sub-adapter delegates to your platform's capabilities and returns `Result` values.

```ts
import {
  createAdapterEventEmitter,
  type IPlatformAdapter,
} from '@wave-client/core';

export function createMyAdapter(): IPlatformAdapter {
  const events = createAdapterEventEmitter();

  return {
    platform: 'web', // until your platform id is added to the union

    storage: {
      async loadCollections() {
        // ...read from your platform...
        return { isOk: true, value: collections };
        // on failure: return { isOk: false, error: 'message' };
      },
      // ...the rest of IStorageAdapter...
    },

    http: {
      async executeRequest(config) {
        // ...run the request on your platform...
        return { isOk: true, value: response };
      },
    },

    // file, secret, security, notification, arena, clipboard ...

    events,

    // realtime is optional — omit it and the UI hides WS/SSE features
    async initialize() {/* warm up connections, load config */},
    dispose() {/* clean up */},
  };
}
```

> Tip: study [`packages/web/src/adapters/webAdapter.ts`](../packages/web/src/adapters/webAdapter.ts) (HTTP-to-server) and [`packages/vscode/src/webview/adapters/vsCodeAdapter.ts`](../packages/vscode/src/webview/adapters/vsCodeAdapter.ts) (postMessage with `requestId` correlation) as reference implementations.

### 2. Wire the UI to your adapter

Wrap the shared app with `AdapterProvider`:

```tsx
import { AdapterProvider } from '@wave-client/core';
import { createMyAdapter } from './myAdapter';

const adapter = createMyAdapter();

root.render(
  <AdapterProvider adapter={adapter}>
    <App />
  </AdapterProvider>
);
```

Core components access the adapter through `useAdapter()` and the focused hooks (`useStorageAdapter`, `useHttpAdapter`, …) and subscribe to push events with `useAdapterEvent`. You write none of that — it already exists in core.

---

## Building a headless client (e.g. a CLI)

A non-UI client doesn't need `AdapterProvider` or React. Compose the shared pieces directly:

```ts
import { HttpService } from '@wave-client/shared';
import { resolveParameterizedValue } from '@wave-client/core';

// 1. Resolve {{variables}} and _fn_ functions in the request
// 2. Execute via the shared HTTP service
// 3. Validate the response with the shared validation engine
// 4. Print / write the result however your client presents output
```

This reuses the exact request execution, variable resolution, and validation logic the GUI clients use — so behavior stays consistent across every client.

---

## Testing your client

Core ships a mock adapter so you can render and test UI without a real platform:

```tsx
import { AdapterProvider, createMockAdapter } from '@wave-client/core';

const mock = createMockAdapter();
render(
  <AdapterProvider adapter={mock}>
    <App />
  </AdapterProvider>
);
```

For your real adapter, test each sub-adapter in isolation — they're plain async functions returning `Result` values, so they mock and assert cleanly.

---

## Guidelines

- **Keep core pure.** Never add platform-specific code (`fs`, `vscode`, browser-only APIs) to `@wave-client/core`. All platform behavior belongs in your adapter.
- **Always return `Result`.** Don't throw across the adapter boundary; return `{ isOk: false, error }` so the shared UI/logic can handle failures uniformly.
- **Reuse shared services** for anything network/IO-heavy rather than reimplementing protocols.
- **Emit push events** (via `events`) for state changes and banners so the UI stays in sync.

---

## Related guides
- [Design & Architecture](design.md) — the adapter pattern, services, store, and Result pattern in depth
- [`@wave-client/core`](../packages/core/README.md) — what the core package provides
- [`@wave-client/shared`](../packages/shared/README.md) — the reusable Node-side services
