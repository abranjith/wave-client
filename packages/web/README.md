<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logos/wave-client-logo-dark-32.png">
    <img src="public/logos/wave-client-logo-light-32.png" alt="Wave Client logo" width="28" height="28" align="absmiddle">
  </picture>
  &nbsp;@wave-client/web
</h1>

The Wave Client **web app** — runs the shared Wave Client UI in the browser.

## Purpose

This package delivers Wave Client as a standalone browser application. It reuses the platform‑agnostic UI from [`@wave-client/core`](../core/README.md) and bridges it to a local backend ([`@wave-client/server`](../server/README.md)) through a web platform adapter, so the browser app has the same capabilities as the VS Code extension.

## Responsibilities

- The **browser entry point** and app shell (theme, layout, server‑connection monitoring).
- The **web adapter** (`webAdapter`): implements `IPlatformAdapter` by delegating I/O to the server over HTTP, and wires server push events (including realtime WS/SSE updates) into the UI over a WebSocket channel.

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — start with the [Web app guide](../../docs/platforms/web-app.md). For how the adapter works, see [Design & Architecture](../../docs/design.md).
