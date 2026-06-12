# Collections

A **collection** is a named group of saved requests, organized into nested folders. Collections are how you keep an API project tidy, reuse requests, and run many requests at once.

---

## Structure

A collection contains **folders** and **requests** in a tree:

```text
My API (collection)
├── Auth
│   ├── Login        (request)
│   └── Refresh      (request)
└── Users
    ├── List Users   (request)
    └── Get User     (request)
```

Open the **Collections** tab in the sidebar to browse the tree. Collections can hold HTTP, WebSocket, and SSE requests side by side — see [Requests](requests.md).

The pane header includes three quick actions:

- **Add Collection (`+`)** — create a new empty Wave collection file from a name.
- **Import** — import collections from Wave, Postman, OpenAPI/Swagger, or `.http` files.
- **Export** — export a collection to file.

![The Collections pane with nested folders and requests](../images/collections-tree.png)

---

## Working with items

Each collection, folder, and request row has an action menu with consistent operations:

- **Run** — run the item (a request, or everything under a collection/folder).
- **Rename** — inline rename, with sibling‑level uniqueness checks (press **Enter** to commit, **Escape** to cancel).
- **Delete** — guarded by a confirmation dialog.

Requests additionally support:

- **Move** — relocate a request to another collection or folder. The dialog offers a single searchable destination picker listing every collection and folder (any depth); you can also create a new collection on the spot.
- **Move conflict protection** — move is blocked when the destination folder already contains an item with the same name (case-insensitive), preventing silent overwrite.
- **Duplicate** — deep‑copy a request with a fresh ID and a collision‑safe name (`Copy`, `Copy 2`, …).

---

## Importing

Wave Client imports several formats and converts them into Wave collections automatically:

- **Postman Collection** (v2.1.0)
- **OpenAPI / Swagger** — OpenAPI 3.x and Swagger 2.0, in **JSON or YAML** (inline `$ref`s are resolved during import)
- **HTTP** files (`.http` / `.rest`) — the [ASP.NET Core / VS Code REST Client format](https://learn.microsoft.com/en-us/aspnet/core/test/http-files), with full syntax support:
  - Requests separated by `###` lines (text after `###` becomes the request name)
  - `#` and `//` comments anywhere outside the body; `# @name requestName` (or `// @name`) directives name a request explicitly
  - Optional method (defaults to `GET`), all standard methods plus `TRACE`/`CONNECT`, trailing `HTTP/x.y` ignored
  - Multi-line URLs — continuation lines starting with `?` or `&` are appended to the URL
  - File variables (`@var=value`) are recognized and skipped; `{{var}}` references pass through **unresolved** (resolve them with Wave [environments](environments.md) after import)
  - Request names are made unique automatically (` 2`, ` 3`, … suffixes); unnamed requests get a name derived from the URL

![The import dialog with format options](../images/collections-import.png)

Native **Wave** collection files import directly. Other formats are transformed on import so requests, grouping, bodies, headers, and query parameters carry over.

**Format auto-detection**: when you select a file the wizard reads its content and detects the format automatically — a Postman export renamed to `collection.json`, an OpenAPI YAML file named `spec.txt`, or an `.http` file with any name all resolve to the right format. The detection priority is: file content first (JSON registry order: OpenAPI → Postman → Wave; YAML `openapi:`/`swagger:` key; HTTP file syntax), then filename as a fallback. The **Collection Type** dropdown shows the detected choice; select a different value to override it before importing.

Imported files are validated against the [Wave Collection Schema](../schemas.md) before anything is written — malformed files are rejected with a descriptive error. The schema reference documents every field of the persisted format.

**Naming rules** (enforced on every save and rename): names must be non-empty, folder and request names must be unique among their siblings (case-insensitive), and collection names must be unique across collections. Renaming a request updates the request itself atomically, and item identity (`id`) is stable across rename, move, and duplicate.

---

## Exporting

Export a collection to share it or back it up. Use the export action on a collection to write it to a file.

---

## Running a collection

Run a whole collection (or a folder) to execute its requests in sequence. Results are summarized in a **result explorer**, and you can generate a shareable report — see [Reporting](reporting.md).

![A collection run with the result explorer](../images/collections-run.png)

---

## Related guides
- [Requests](requests.md) — build the requests you save here
- [Environments](environments.md) — switch base URLs and values per stage
- [Reporting](reporting.md) — export results of a collection run
- [Flows](flows.md) — chain saved requests with data passing between them
