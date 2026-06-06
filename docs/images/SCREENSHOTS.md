# Screenshot Capture Checklist

This file tracks every screenshot referenced by the documentation. Each guide references images by filename (e.g. `![Request editor](../images/quickstart-send-request.png)`); capture each one and drop it into this `docs/images/` folder using the exact filename listed below.

**Tips for consistent screenshots**
- Use a clean window at a comfortable zoom; crop to the relevant panel.
- Capture both light and dark only if a guide specifically calls for it (none currently require both).
- Prefer PNG. Keep widths reasonable (~1200px) so GitHub renders them well.

Legend: `[ ]` to capture · `[x]` captured

---

## Quick Start (`getting-started/quick-start.md`)
- [x] `quickstart-new-request.png` — empty request editor with a new HTTP tab
- [x] `quickstart-send-request.png` — request with method, URL, and the Send button highlighted
- [x] `quickstart-response.png` — response viewer showing a successful 200 response body
- [x] `quickstart-save-request.png` — the Save Request dialog choosing a collection

## Installation (`getting-started/installation.md`)
- [x] `install-vscode-command.png` — the Command Palette showing "Wave Client: Open Wave Client"
- [ ] `install-web-running.png` — terminal output after `pnpm dev:web` with both URLs

## Requests (`features/requests.md`)
- [x] `requests-protocol-selector.png` — the protocol selector dropdown (HTTP / WebSocket / SSE)
- [x] `requests-body-types.png` — the request body editor showing body type options
- [x] `requests-response-viewer.png` — response viewer with headers/body tabs
- [x] `requests-sent-view.png` — the "Sent" tab showing the exact outgoing request
- [x] `requests-ws-messages.png` — a WebSocket connection with the Messages panel
- [x] `requests-sse-events.png` — an SSE connection with the Events timeline

## Collections (`features/collections.md`)
- [x] `collections-tree.png` — the Collections pane with nested folders and requests
- [x] `collections-import.png` — the import dialog with format options
- [x] `collections-run.png` — a collection run with the result explorer

## Environments (`features/environments.md`)
- [x] `environments-pane.png` — the Environments pane
- [x] `environments-editor.png` — the environment editor grid with variables

## Variables (`features/variables.md`)
- [x] `variables-in-url.png` — a `{{variable}}` used in the URL with a resolved-value tooltip

## Auth (`features/auth.md`)
- [x] `auth-store.png` — the Auth store with several saved credentials

## Validations (`features/validations.md`)
- [x] `validations-rule-editor.png` — the validation rule editor for a body rule
- [x] `validations-result.png` — a response showing validation pass/fail

## Wave Store (`features/wave-store.md`)
- [x] `wave-store-panes.png` — the Wave Store tab listing Cookies / Auth / Proxy / Cert

## Flows (`features/flows.md`)
- [x] `flows-canvas.png` — a flow with several request nodes connected
- [x] `flows-connector-condition.png` — a connector with a condition chip
- [x] `flows-alias-copy.png` — the node alias hover card with the Copy button

## Test Lab (`features/tests.md`)
- [x] `tests-suite-editor.png` — a test suite with requests and assertions
- [x] `tests-run.png` — a test suite run result

## Reporting (`features/reporting.md`)
- [x] `reporting-html-report.png` — an exported HTML run report with the summary tiles

## Settings (`features/settings.md`)
- [x] `settings-wizard.png` — the settings wizard with its collapsible sections

## AI / Wave Arena (`features/ai-arena.md`)
- [x] `arena-chat.png` — the Wave Arena chat panel with a command in the input
- [x] `arena-settings.png` — the Arena/AI settings section

## Platform — VS Code (`platforms/vscode.md`)
- [ ] `vscode-sidebar.png` — the Wave Client sidebar inside VS Code, Documentation icon visible

## Platform — Web app (`platforms/web-app.md`)
- [x] `web-app-overview.png` — the web app running in a browser
