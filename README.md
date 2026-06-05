<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/images/logo/png/wave-client-logo-dark-512.png">
  <img src=".github/images/logo/png/wave-client-logo-light-512.png" alt="Wave Client logo" width="140" height="140">
</picture>

# Wave Client

</div>


### A modern, platform‑agnostic REST API client

Build and send requests, organize them into collections, parameterize with environments, validate responses, chain requests into flows and test suites, and even ask a built‑in AI assistant for help.

Available today as a **VS Code extension** and a **web app** — and architected so new clients (a CLI and beyond) can be built on the same core. See [Build Your Own Client](docs/build-your-own-client.md).

**Public beta** · See the [Release Notes](docs/release-notes.md) for what's included.


---

## Documentation

**Full documentation lives in [`docs/`](docs/README.md) — start there.**

Quick links:
- [Installation](docs/getting-started/installation.md) · [Quick Start](docs/getting-started/quick-start.md)
- Features: [Requests](docs/features/requests.md) · [Collections](docs/features/collections.md) · [Environments](docs/features/environments.md) · [Variables](docs/features/variables.md) · [Auth](docs/features/auth.md) · [Validations](docs/features/validations.md) · [Wave Store](docs/features/wave-store.md) · [Flows](docs/features/flows.md) · [Test Lab](docs/features/tests.md) · [Reporting](docs/features/reporting.md) · [Settings](docs/features/settings.md) · [AI & Wave Arena](docs/features/ai-arena.md)
- Platforms: [VS Code](docs/platforms/vscode.md) · [Web app](docs/platforms/web-app.md)
- [Design & Architecture](docs/design.md)

> Inside either app, click the **Documentation** icon in the left sidebar to open these docs.

---

## What you can do

- **Requests beyond HTTP** — HTTP, **WebSocket**, and **SSE**, with rich body editors and a "Sent" view of the exact outgoing request.
- **Organize** — nested [collections](docs/features/collections.md) with import (Postman, OpenAPI/Swagger, HTTP) and export.
- **Parameterize** — [environments](docs/features/environments.md), `{{variables}}`, and dynamic [`_fn_` functions](docs/features/variables.md).
- **Authenticate** — API Key, Basic, Digest, and OAuth2, plus a reusable [Wave Store](docs/features/wave-store.md) for cookies, auth, proxies, and certificates.
- **Validate** — response checks via [JSONPath and JSON Schema](docs/features/validations.md).
- **Automate** — [flows](docs/features/flows.md), [test suites](docs/features/tests.md), and exportable [run reports](docs/features/reporting.md).
- **AI built in** — [Wave Arena](docs/features/ai-arena.md) and an MCP server for external AI tools.

---

## Clients

Wave Client runs as multiple clients over one shared, platform‑agnostic core. Two are available today, and the [adapter architecture](docs/design.md) makes it straightforward to add more.

### VS Code extension
Run **Wave Client: Open Wave Client** from the Command Palette, or press **`Ctrl+Alt+W`** / **`Cmd+Alt+W`**. → [VS Code guide](docs/platforms/vscode.md)

### Web app
```bash
pnpm install
pnpm dev:web   # starts the local server + web UI → http://localhost:5173
```
→ [Web app guide](docs/platforms/web-app.md)

### Build your own
The core isn't tied to these two — a CLI, desktop, or other client is just a new adapter. → [Build Your Own Client](docs/build-your-own-client.md)

---

## Architecture, in brief

Wave Client is a **monorepo** built around the **adapter pattern**: a platform‑agnostic core UI is shared across platforms, and platform‑specific I/O is isolated behind adapters.

| Package | Role |
| --- | --- |
| [`packages/core`](packages/core/README.md) | Platform‑agnostic UI, state, and logic |
| [`packages/vscode`](packages/vscode/README.md) | VS Code extension |
| [`packages/web`](packages/web/README.md) | Browser app |
| [`packages/server`](packages/server/README.md) | Local backend for the web app |
| [`packages/shared`](packages/shared/README.md) | Shared Node‑side services |
| [`packages/arena`](packages/arena/README.md) | AI engine (Wave Arena) |
| [`packages/mcp-server`](packages/mcp-server/README.md) | MCP server for external AI tools |

Because of this, adding a new client (a CLI, a desktop app, …) means implementing one adapter rather than rebuilding the app. Full details in the [Design & Architecture guide](docs/design.md) and the [Build Your Own Client](docs/build-your-own-client.md) guide.

---

## Future peek

Wave Client is actively evolving. On the radar (subject to change):

- More protocols (GraphQL, gRPC) and request‑editor refinements.
- Cloud sync for collections and environments; a credential manager.
- A deeper Test Lab (schema validation, performance plans, history & insights) and richer reporting.
- More AI capabilities and broader provider support.
- Additional client types — a CLI and beyond — on the same shared core.
- Team collaboration and a hosted option.

---

## Credits

Wave Client stands on excellent open‑source work, including:

- **UI**: [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [lucide‑react](https://lucide.dev/), [highlight.js](https://highlightjs.org/), [cmdk](https://cmdk.paco.me/)
- **State**: [Zustand](https://github.com/pmndrs/zustand)
- **Tooling/build**: [Vite](https://vitejs.dev/), [Webpack](https://webpack.js.org/), [Turborepo](https://turbo.build/), [TypeScript](https://www.typescriptlang.org/)
- **HTTP & server**: [axios](https://axios-http.com/), [Fastify](https://fastify.dev/)
- **Parsing & validation**: [@scalar/openapi-parser](https://github.com/scalar/scalar), [jsonpath‑plus](https://github.com/JSONPath-Plus/JSONPath), [ajv](https://ajv.js.org/)
- **AI**: [LangChain.js & LangGraph.js](https://www.langchain.com/), [Google Gemini](https://ai.google.dev/) and [Ollama](https://ollama.com/), [Model Context Protocol SDK](https://modelcontextprotocol.io/), [hnswlib‑node](https://github.com/yoshoku/hnswlib-node)

See each package's `package.json` for the complete dependency list.

---

## License

See the [LICENSE](LICENSE) file for details.
