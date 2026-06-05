<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/abranjith/wave-client/main/packages/vscode/assets/logos/wave-client-logo-dark-32.png">
    <img src="https://raw.githubusercontent.com/abranjith/wave-client/main/packages/vscode/assets/logos/wave-client-logo-light-32.png" alt="Wave Client logo" width="28" height="28" align="absmiddle">
  </picture>
  &nbsp;@wave-client/vscode
</h1>

The Wave Client **VS Code extension** — runs the shared Wave Client UI inside VS Code.

## Purpose

This package delivers Wave Client as a native VS Code extension, so you can build and send API requests right next to your code. It reuses the platform‑agnostic UI from [`@wave-client/core`](../core/README.md) and bridges it to VS Code through a platform adapter.

## Responsibilities

- **Extension host**: activation, the `waveclient.open` command (keybinding `Ctrl+Alt+W` / `Cmd+Alt+W`), webview panel creation, and the message handler that routes webview calls to services.
- **VS Code adapter** (`vsCodeAdapter`): implements `IPlatformAdapter` over `postMessage`, with `requestId`‑correlated request/response and push events.
- **Platform services & storage**: file I/O, proxy/cert‑enabled HTTP, encryption (Node `crypto`), and secrets via VS Code `SecretStorage`.

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — start with the [VS Code platform guide](../../docs/platforms/vscode.md). For how the adapter works, see [Design & Architecture](../../docs/design.md).
