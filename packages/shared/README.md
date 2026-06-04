# @wave-client/shared

The **shared Node‑side services** used by Wave Client's backends.

## Purpose

This package holds the logic that both backends — the VS Code extension host and the [web server](../server/README.md) — need to run identically. Centralizing it here is why protocol and storage behavior is the same on every platform.

## Responsibilities

- **Protocol execution services**: `HttpService`, `WebSocketService`, `SseService` (auth, proxies/TLS, streaming, cancellation).
- **Storage/collection services** and **security services** (encryption, secrets).
- The **validation engine** (JSONPath via `jsonpath-plus`, JSON Schema via `ajv`).
- Shared, testable building blocks consumed by `@wave-client/vscode`, `@wave-client/server`, and `@wave-client/mcp-server`.

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — for how services fit the overall design, see [Design & Architecture](../../docs/design.md).
