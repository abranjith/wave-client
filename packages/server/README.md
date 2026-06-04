# @wave-client/server

The lightweight local **backend** that powers the Wave Client web app.

## Purpose

The browser can't safely do everything Wave Client needs — file access, HTTP execution with proxies/certificates, and encryption. This Fastify‑based server provides those capabilities locally so [`@wave-client/web`](../web/README.md) has the same power as the VS Code extension.

## Responsibilities

- **REST API** for storage (collections, environments, history, cookies, stores, settings) and **HTTP/WS/SSE execution**.
- **Node‑side I/O**: file system access, proxy/cert‑enabled requests, and AES‑256‑GCM encryption.
- A **WebSocket push channel** for real‑time updates and state synchronization to connected clients.
- Delegates protocol/storage behavior to the shared services in [`@wave-client/shared`](../shared/README.md).

> Intended for **local use** (binds to localhost). It is not hardened for public deployment.

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — start with the [Web app guide](../../docs/platforms/web-app.md). For architecture, see [Design & Architecture](../../docs/design.md).
