# Design & Architecture

This guide is for the architecture‑curious — contributors and anyone who wants to understand *how* Wave Client is built. It's not required reading to use the app.

The central idea: **write the UI once, run it everywhere.** Wave Client is a monorepo where a platform‑agnostic core UI is shared between a VS Code extension and a web app, with platform differences isolated behind an **adapter** boundary.

---

## Why a monorepo?

Wave Client targets multiple environments (VS Code today; the browser; potentially others later) that should look and behave identically. A monorepo lets all of them depend on a single shared core and shared services, so a feature or fix lands once and every platform benefits — no copy‑paste, no drift.

---

## The packages

| Package | Why it exists | What it hosts |
| --- | --- | --- |
| **`core`** | The platform‑agnostic heart | All React UI components, hooks, the Zustand store, types, and pure utilities. Contains **zero** platform‑specific code. |
| **`vscode`** | Run Wave Client inside VS Code | The extension host (activation, webview panel, message handler, services) and the VS Code adapter that bridges the webview to VS Code APIs. |
| **`web`** | Run Wave Client in the browser | The browser entry point and the web adapter that talks to the local server. |
| **`server`** | Give the web app real I/O | A lightweight Node.js server providing file access, HTTP execution (proxies/certs), encryption, and a push channel. |
| **`shared`** | Logic both backends need | Node‑side services (HTTP, WebSocket, SSE, storage, security, …) used by the VS Code extension host and the server alike. |
| **`arena`** | The AI engine | A LangGraph‑based multi‑agent system powering Wave Arena (web‑expert and workspace agents). |
| **`mcp-server`** | Expose the workspace to external AI | An MCP server with tools to inspect collections/environments and list/run flows and test suites. |

---

## The adapter pattern

The core UI never performs I/O directly. Instead it calls an **`IPlatformAdapter`**, and each platform provides its own implementation. This is what keeps `core` pure and portable.

```
┌──────────────────────── @wave-client/core ───────────────────────┐
│  Components → Hooks → useAdapter()                                 │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ IPlatformAdapter (interface)
                ┌────────────────┴────────────────┐
                ▼                                  ▼
        vsCodeAdapter                         webAdapter
   (postMessage ↔ extension)           (HTTP/WebSocket ↔ server)
```

### The sub‑adapters
`IPlatformAdapter` is composed of focused sub‑adapters plus an event emitter:

| Sub‑adapter | Responsibility |
| --- | --- |
| `storage` | Collections, environments, history, cookies, auth, proxies, certs, validation rules, settings |
| `http` | Execute (and cancel) HTTP requests |
| `file` | File dialogs and read/write/import/download |
| `secret` | Secure key storage |
| `security` | Encryption enable/disable, password change, recovery key |
| `notification` | User notifications and dialogs |
| `events` | Push‑event emitter (see below) |

Plus a `platform` discriminator (`'vscode' | 'web' | …`) and optional `initialize()` / `dispose()`.

### Two communication styles
1. **Request/response** — a component calls an adapter method and awaits a `Result`.
2. **Push events** — the platform emits events the UI subscribes to (banners, "data changed" signals, encryption status). Components subscribe with `useAdapterEvent` / `useAdapterEvents`.

### Request/response correlation (VS Code)
The webview can't share memory with the extension host, so the `vsCodeAdapter` uses a **`requestId`‑correlated promise** pattern: each call stores a pending promise keyed by a unique `requestId`, posts a message, and resolves the matching promise when a response with that `requestId` arrives. Correlation is by `requestId`, not by message‑type name — so many requests can be in flight safely. The web adapter, talking to an HTTP server, mostly resolves directly; it uses a WebSocket channel for push events and real‑time updates.

---

## The Result pattern

Every fallible adapter operation returns a typed `Result<T, E>` instead of throwing:

```ts
type Result<T, E> =
  | { isOk: true;  value: T }
  | { isOk: false; error: E };

const result = await storage.loadCollections();
if (result.isOk) {
  setCollections(result.value);
} else {
  notification.showNotification('error', result.error);
}
```

This makes error handling explicit and uniform across platforms, and keeps both the success and failure paths type‑checked.

---

## The services pattern

Node‑side behavior lives in **services** in `shared` (and the VS Code extension's own services): `HttpService`, `WebSocketService`, `SseService`, storage/collection services, security services, and so on. Services are the single implementation of "how things actually happen" on a backend; both the VS Code extension host and the web server call into them, which is why protocol behavior is identical across platforms. Services are written to be testable in isolation (I/O is mocked), and several accept injectable factories for that purpose.

---

## The store pattern (Zustand)

UI state lives in a single Zustand store (`useAppStateStore`) composed of **slices** — request tabs, realtime (WS/SSE) state, collections, environments, banners, and more. Slices keep related state and actions together while sharing one store. Some state is intentionally **ephemeral** (e.g. per‑tab realtime message timelines and the "Sent" request snapshot are never persisted), while domain data is loaded through the storage adapter.

---

## Hooks

Components reach platform capabilities and state exclusively through hooks, never through globals or platform APIs:

- `useAdapter()` and the focused variants (`useStorageAdapter`, `useHttpAdapter`, `useFileAdapter`, `useSecretAdapter`, `useSecurityAdapter`, `useNotificationAdapter`, `usePlatform`).
- `useAdapterEvent` / `useAdapterEvents` for push‑event subscriptions.
- `useAppStateStore` (and selectors) for UI state.
- Feature hooks such as `useWsConnection`, `useSseConnection`, and `useConfirmDialog`.

The rule that makes this work: **core components contain no `vsCodeApi`, `localStorage`, `fetch`, or Node APIs** — only adapter calls and hooks. Platform code lives in the `vscode`/`web` packages.

---

## How a request flows (end to end)

1. A core component calls `adapter.http.executeRequest(config)`.
2. **VS Code:** `vsCodeAdapter` posts the request with a `requestId`; the extension's message handler routes it to `HttpService` (in `shared`), which runs it via Node (proxies, certs, cancellation) and posts back a correlated response.
   **Web:** `webAdapter` sends the request to the local server, which runs the same `HttpService` and returns the result.
3. The adapter resolves a `Result`, the component updates the store, and the response viewer renders.

The same shape applies to WebSocket and SSE, with the backend services streaming messages/events back as push events.

---

## Summary

- **Portability** — one core UI, many platforms.
- **Isolation** — all I/O behind `IPlatformAdapter`; `core` stays pure.
- **Type‑safe errors** — `Result<T, E>` everywhere.
- **Shared behavior** — backend logic lives once, in services.
- **Predictable state** — a single sliced Zustand store, with ephemeral vs. persisted state clearly separated.
