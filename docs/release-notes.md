# Release Notes

> Wave Client is in **public beta**. This page highlights what each release brings. For exact change history, see source control.

---

## Beta — Initial public release

The first public beta of Wave Client, available as both a **VS Code extension** and a **standalone web app** with feature parity between them.

### Requests & Protocols
- HTTP requests with all common methods, visual editors for **params, headers, and body**.
- Body types: **None, Raw** (JSON / XML / HTML / Text / CSV), **URL‑encoded, multipart Form‑data** (text + file fields), and **File**.
- **WebSocket** and **Server‑Sent Events (SSE)** connections with live Messages/Events panels.
- A request‑side **"Sent"** view showing the exact on‑wire request (final URL, headers, display‑safe body).
- A default `User-Agent` is added when you don't supply one.
- See [Requests](features/requests.md).

### Collections & Import
- Nested **collections/folders**, with **rename, delete (confirmed), move, and duplicate**.
- Import from **Postman (v2.1.0)**, **OpenAPI 3.x / Swagger 2.0** (JSON or YAML), and **HTTP** files; export support.
- Run collections with a **result explorer**.
- See [Collections](features/collections.md).

### Environments & Variables
- **Environments** with global and environment‑specific values, import/export.
- `{{variable}}` resolution plus **dynamic `_fn_` functions** (UUIDs, random numbers/strings, dates/times, names, addresses, contacts).
- See [Environments](features/environments.md) and [Variables](features/variables.md).

### Authentication & Wave Store
- Auth types: **API Key, Basic, Digest, OAuth2 (refresh token)**, with domain filters.
- **Wave Store** for reusable **cookies, auth, proxies, and client certificates (mTLS)**.
- See [Auth](features/auth.md) and [Wave Store](features/wave-store.md).

### Validations
- Response validation by **status, headers, and body**, using full **JSONPath** and **JSON Schema (draft‑07)**; defaults to 2xx success when no rules are set.
- See [Validations](features/validations.md).

### Flows
- Visual **flow canvas** chaining requests, with **conditional connectors** (including validation pass/fail) and **readable aliases** for JSONPath data passing between steps.
- See [Flows](features/flows.md).

### Test Lab
- **Test suites** that run multiple requests with assertions and report pass/fail.
- See [Test Lab](features/tests.md).

### Reporting
- Interactive, self‑contained **HTML run reports** for collections, flows, and test suites (search, status filtering, expand/collapse).
- See [Reporting](features/reporting.md).

### AI / Wave Arena
- In‑app **AI assistant** for web‑standards questions and tool‑backed workspace help, with slash commands and confirmation‑gated run actions.
- An **MCP server** to expose your workspace to external AI tools.
- See [AI & Wave Arena](features/ai-arena.md).

### Settings & Security
- Settings wizard for **data storage**, **encryption** (with recovery key), and **AI** configuration.
- See [Settings](features/settings.md).

---

## How releases are logged

Going forward, each release adds a new section at the top of this page summarizing notable additions and changes, grouped by area. This page reflects highlights, not an exhaustive changelog — use git history for the complete record.
