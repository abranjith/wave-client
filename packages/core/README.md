# @wave-client/core

The platform‑agnostic heart of Wave Client — all UI, state, and logic, with zero platform‑specific code.

## Purpose

`@wave-client/core` exists so Wave Client can be written **once** and run on multiple platforms (the VS Code extension and the web app today). It contains no direct I/O — all platform operations go through the [adapter pattern](../../docs/design.md), which keeps this package portable.

## Responsibilities

- All React **UI components** (request editor, response viewer, collections, environments, flows, test lab, Wave Store, settings, Wave Arena).
- The **Zustand store** (`useAppStateStore`) and feature **hooks** (`useAdapter`, `useWsConnection`, `useSseConnection`, …).
- **Types** shared across the app, including the `IPlatformAdapter` interface and the `Result<T, E>` pattern.
- Pure **utilities**: parsing/transforming collections, variable and `_fn_` function resolution, JSONPath helpers, validation helpers.

## Documentation

See the full documentation at [`docs/`](../../docs/README.md) — in particular the [Design & Architecture guide](../../docs/design.md).
