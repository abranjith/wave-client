# @wave-client/vscode

VS Code extension for Wave Client—a modern REST client that runs inside VS Code using the same platform-agnostic UI from `@wave-client/core`.

## Purpose

Deliver the full Wave Client experience directly in VS Code, leveraging native capabilities (file system, secret storage, proxy-aware HTTP, certificates) while sharing UI and logic with other platforms through the adapter pattern.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ extension.ts (Node)                                   │  │
│  │ • activation (waveclient.open)                        │  │
│  │ • webview panel creation                              │  │
│  │ • MessageHandler routes requests ↔ services           │  │
│  └───────────────┬───────────────────────────────────────┘  │
│                  │                                           │
│                  │ postMessage (request/response + events)   │
│                  │                                           │
│  ┌───────────────▼────────────────────────────────────────┐  │
│  │ Webview (React)                                        │  │
│  │ AppWithAdapter.tsx                                     │  │
│  │ • acquireVsCodeApi() once                              │  │
│  │ • AdapterProvider (vsCodeAdapter)                      │  │
│  │ • Theme context (light/dark)                           │  │
│  └───────────────┬────────────────────────────────────────┘  │
│                  │                                           │
│  ┌───────────────▼────────────────────────────────────────┐  │
│  │ vsCodeAdapter.ts                                       │  │
│  │ • Implements IPlatformAdapter                          │  │
│  │ • requestId-correlated promises                        │  │
│  │ • Emits push events (banner, collectionsChanged, etc.) │  │
│  └───────────────┬────────────────────────────────────────┘  │
│                  │                                           │
│  ┌───────────────▼────────────────────────────────────────┐  │
│  │ @wave-client/core (shared UI)                          │  │
│  │ • React components, hooks, utilities                   │  │
│  │ • Zero VS Code-specific code                           │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Design Highlights

- **Adapter Pattern**: Webview uses `vsCodeAdapter` to access VS Code capabilities while keeping core UI platform-agnostic.
- **Request/Response Correlation**: Every adapter call sends a `requestId`; responses resolve the matching promise regardless of message type naming.
- **Push Events**: Extension can push events (banners, data-changed signals, encryption status) that propagate through `adapter.events` to core components.
- **Secure Storage**: Secrets flow through VS Code `SecretStorage` (see [packages/vscode/src/services](packages/vscode/src/services)).
- **File & HTTP Support**: Extension backend performs file I/O, proxy/cert-enabled HTTP, and crypto using Node APIs—exposed via adapter methods.
- **Theme Awareness**: Webview toggles light/dark and aligns with VS Code styling via Tailwind + CSS vars.

## Key Features

- **Native VS Code Integration**: Command `waveclient.open` with keybinding `Ctrl+Shift+W` / `Cmd+Shift+W` opens the client.
- **Platform-Agnostic UI**: Reuses `@wave-client/core` components in the webview; no VS Code specifics in core code.
- **Rich HTTP Execution**: Proxy, custom CA, client certs, and request cancellation handled by the extension backend.
- **Persistent Stores**: Collections, environments, history, cookies, auth, proxies, certs, and settings stored via extension services.
- **Notifications & Events**: Banner notifications and data-change events pushed from backend to UI.
- **Security**: Encryption support (enable/disable, recovery key export) using Node `crypto` and VS Code secret storage.

## Package Structure

```
packages/vscode/
├── src/
│   ├── extension.ts            # Extension activation & webview creation
│   ├── handlers/               # Message routing from webview to services
│   ├── services/               # File, HTTP, security, settings, storage
│   ├── webview/                # React webview bundle
│   │   ├── AppWithAdapter.tsx  # AdapterProvider + theme + init
│   │   ├── adapters/vsCodeAdapter.ts # IPlatformAdapter impl
│   │   ├── App.tsx, ConfigPanel.tsx, RequestEditor.tsx, etc.
│   │   └── index.css           # Tailwind entry
│   ├── utils/, types/, test/   # Shared utilities, typings, tests
│   └── webpack.config.js       # Extension bundle
├── postcss.config.js
├── tailwind.config.js
└── package.json
```

## Developer Guide

### Prerequisites
- VS Code 1.103+
- Node.js 18+
- pnpm (recommended)

### Install Dependencies
```bash
pnpm install
```

### Build & Watch
```bash
# Build extension + webview bundle
pnpm build

# Watch mode (extension + webview)
pnpm watch

# Webview-only watch (CSS + webpack)
pnpm watch:webview
```

### Package for Release
```bash
pnpm package   # webpack production build with hidden source maps
```
Produces VS Code-ready assets in `dist/` (use `vsce` or `@vscode/test-electron` to package if needed).

### Run Tests
```bash
pnpm test          # vitest run
pnpm test:watch    # vitest watch
pnpm test:coverage # coverage report
pnpm test:ui       # vitest UI
```

### Lint & Typecheck
```bash
pnpm lint
pnpm typecheck
```

## How Messaging Works (Adapter ↔ Extension)

1. **Adapter call** (webview) → `vsCodeAdapter` sends `{ type, requestId, payload }` via `postMessage`.
2. **MessageHandler** (extension) routes to services (file, http, security, etc.) and responds with `{ requestId, ...data }`.
3. **vsCodeAdapter** matches `requestId`, resolves the pending promise, and emits push events when needed.
4. **Core components** consume results via `useAdapter` hooks without VS Code-specific code.

## Extension Capabilities Exposed via Adapter

- **Storage**: Collections, environments, history, cookies, auth, proxies, certs, validation rules, settings.
- **HTTP**: Execute requests with proxy, mTLS, custom CA, cancellation.
- **File**: Open/save dialogs, import/export, binary read/write.
- **Secret/Security**: Secret storage, encryption enable/disable, password change, recovery key export.
- **Notifications/Events**: Banner notifications, data-change events, encryption status updates.

## Usage (User Perspective)
- Run command **Wave Client: Open Wave Client** or press **Ctrl+Shift+W / Cmd+Shift+W**.
- UI loads in a webview panel; all data and network operations go through the extension backend.
- Settings, collections, environments, and history persist in the workspace context.

## Contributing Guidelines
- Keep `@wave-client/core` free of VS Code specifics; platform code stays in this package.
- Use the adapter for all webview ↔ extension communication; no direct `postMessage` in core components.
- When adding new capabilities, update both: webview adapter (`vsCodeAdapter`) and corresponding handler/service.
- Maintain request/response correlation via `requestId`; ensure timeouts and error cases are handled.
- Add tests in `src/test/` for new handlers/services and adapter behavior.

## License
See [LICENSE](../../LICENSE) in the repository root.
