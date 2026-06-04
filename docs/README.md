# Wave Client Documentation

**Wave Client** is a modern, platform‑agnostic REST API client that runs both as a **Visual Studio Code extension** and as a **standalone web app**. It helps you build, send, organize, and validate API requests — and chain them into automated flows and test suites — with the same interface everywhere.

> **Wave Client is currently in public beta.** Features are stable enough for everyday use, but some areas are still evolving. See the [Release Notes](release-notes.md).

---

## Start here

New to Wave Client? Follow these in order:

1. **[Installation](getting-started/installation.md)** — set up the VS Code extension or the web app.
2. **[Quick Start](getting-started/quick-start.md)** — send your first request in a couple of minutes.
3. Browse the feature guides below for anything you want to go deeper on.

> Inside either app, click the **Documentation** icon in the left sidebar to jump back here at any time.

---

## Documentation map

### Getting started
- [Installation](getting-started/installation.md) — prerequisites and setup for VS Code and the web app
- [Quick Start](getting-started/quick-start.md) — your first request, step by step

### Features

| Area | Guide | What it covers |
| --- | --- | --- |
| **Requests & Protocols** | [Requests](features/requests.md) | HTTP, WebSocket, and SSE requests; URL, params, headers, body, response, and the "Sent" view |
| **Collections** | [Collections](features/collections.md) | Organizing requests into folders, import/export, running collections, move & duplicate |
| **Environments** | [Environments](features/environments.md) | Environment variables, global vs. environment scope, selection |
| **Variables** | [Variables](features/variables.md) | `{{variable}}` resolution and dynamic `_fn_` functions |
| **Authentication** | [Auth](features/auth.md) | API Key, Basic, Digest, and OAuth2 auth, and where they apply |
| **Validations** | [Validations](features/validations.md) | Response validation rules, operators, JSONPath and JSON Schema |
| **Wave Store** | [Wave Store](features/wave-store.md) | Reusable cookies, auth, proxies, and client certificates |
| **Flows** | [Flows](features/flows.md) | Chaining requests on a canvas, passing data between steps |
| **Test Lab** | [Tests](features/tests.md) | Building and running test suites with assertions |
| **Reporting** | [Reporting](features/reporting.md) | Run reports for collections, flows, and test suites |
| **Settings** | [Settings](features/settings.md) | Data storage, encryption, and AI settings |
| **AI / Wave Arena** | [AI & Wave Arena](features/ai-arena.md) | The in‑app AI assistant and the MCP server |

### Platform guides
- [VS Code extension](platforms/vscode.md) — command, keybinding, storage, and theme integration
- [Web app](platforms/web-app.md) — running the local server + UI, ports, and troubleshooting

### Reference
- [Design & Architecture](design.md) — how Wave Client is built (for the architecture‑curious)
- [Release Notes](release-notes.md) — what's in each release

---

## Documentation conventions

- All links between docs are **relative**, so the documentation works on GitHub today and can be moved to a dedicated docs site later without rewrites.
- Each folder has a landing page; feature guides live under [features/](features/) and platform guides under [platforms/](platforms/).
- Screenshots referenced in these guides live in [images/](images/). Images still to be captured are tracked in [images/SCREENSHOTS.md](images/SCREENSHOTS.md).
- Shared topics (authentication, environments, variables) are documented once and linked from the guides that use them, rather than repeated.
- **For AI tools / LLMs:** [llms.txt](llms.txt) is a curated, machine-readable map of this documentation (per the [llms.txt convention](https://llmstxt.org)), and [llms-full.txt](llms-full.txt) is every page concatenated into one file for direct ingestion.

---

## What is Wave Client, in one minute?

- **One UI, two platforms.** The same React UI runs in a VS Code webview and in the browser, thanks to an [adapter architecture](design.md).
- **Requests beyond HTTP.** Send classic HTTP requests, or open long‑lived **WebSocket** and **Server‑Sent Events (SSE)** connections.
- **Organize and reuse.** Group requests into [collections](features/collections.md), parameterize them with [environments](features/environments.md) and [variables](features/variables.md), and store reusable [credentials](features/wave-store.md).
- **Automate.** Chain requests into [flows](features/flows.md) and build [test suites](features/tests.md), then export [run reports](features/reporting.md).
- **AI built in.** Ask [Wave Arena](features/ai-arena.md) about web standards or your own workspace.

For a tour of capabilities, see the [Release Notes](release-notes.md). For the "why" behind the design, see [Design & Architecture](design.md).
