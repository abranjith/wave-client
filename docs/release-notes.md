# Release Notes

> Wave Client is in **public beta**. This page highlights what each release brings. For exact change history, see source control.

---

## Beta update — import fidelity, cancellation & collection integrity

A stabilization pass across collections, environments, requests, and history, plus formalized file schemas and versioning docs.

### Requests
- **Cancel in-flight requests** — while a request is processing, **Send** becomes **Cancel**; aborting stops the actual outbound call on both apps and settles the viewer in a distinct "Request cancelled" state.
- **Ctrl+S / Cmd+S** saves the active request from the request editor (direct save, or the Save dialog for unsaved requests) — see [keyboard shortcuts](features/requests.md#keyboard-shortcuts).
- **Response download fixed** on both apps — downloads now honor the real response bytes, a sensible filename, and the response content type.
- **History refreshes in real time** — the History pane updates immediately after each send, no reload needed.
- Tighter request-editor spacing, with Params/Headers **Copy/Paste** buttons relocated into the table header.

### Collections
- **Full `.http` / `.rest` import syntax** — `###` separators, `#` and `//` comments, `# @name` directives, file-variable lines, optional methods, multi-line URLs, and automatic unique request naming. See [Collections](features/collections.md).
- **Content-based format auto-detection** on import — Postman, OpenAPI/Swagger, `.http`, and Wave files are recognized from their content, with the dropdown as a manual override.
- **Reliable collection operations** — rename, delete, and move now persist dependably; item identity is stable across rename/move/duplicate; naming rules (non-empty, sibling-unique) are enforced everywhere.
- **Clearer Move & Save dialog** — shows the request's current location, offers a single searchable destination picker listing every collection and folder (any depth), and blocks moves that would overwrite an existing item.

### Environments
- **Postman environment import** with an auto-detected, overridable **Environment Type** dropdown; secret-typed Postman variables import as Wave secrets. See [Environments](features/environments.md).

### Schemas & versioning
- The persisted collection and environment formats are now formal, versioned schemas (both `0.0.1`), validated at import and load — documented field by field in [Wave Schemas](schemas.md).
- How Wave Client versions evolve is now documented in [Versioning](versioning.md): four independent tracks with per-track semver semantics and bump checklists.

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
