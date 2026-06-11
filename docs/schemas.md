# Wave Schemas

Wave Client persists your data as plain JSON files — one file per collection and one per environment, stored under your configured app directory. This page is the **canonical reference** for those persisted shapes: the *Wave Collection Schema* and the *Wave Environment Schema*.

Both schemas are formally defined as [Zod](https://zod.dev) schemas in `packages/core/src/schemas/` and validated at two boundaries:

- **Import** — when you import a collection or environment file, the content is validated before anything is written. Invalid files are rejected with a descriptive error and nothing is persisted.
- **Load** — when files are read from disk, each is normalized (missing ids and versions are stamped) and validated. A structurally invalid file is skipped with a logged error so the rest of your data still loads.

> **Schema version ≠ app version.** Each schema carries its own version (currently `0.0.1` for both), independent of any package or app release. A schema version bumps **only** when the persisted shape changes, and every bump gets a migration note in the [Version history](#version-history) below. See [versioning.md](versioning.md) for how all version tracks relate.

---

## Wave Collection Schema (v0.0.1)

A collection file is a single JSON object:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `info` | object | yes | Collection metadata (below) |
| `item` | `CollectionItem[]` | yes | Tree of folders and requests; may be empty |
| `filename` | string | no | **Runtime-only** — added in memory at load time; tolerated in files but never required |

### `info` (collection metadata)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `info.waveId` | string | yes¹ | Stable logical identity of the collection |
| `info.name` | string | yes | Display name; must be non-empty |
| `info.description` | string | no | Free-form description |
| `info.schema` | string | no | Legacy/reserved field |
| `info.version` | string | yes¹ | **Schema version** of the file (`0.0.1`) |

¹ Loaders stamp missing `waveId` (fresh id) and `version` (current schema version) on legacy files before validation, so older files load fine and are upgraded on next save.

### `CollectionItem` (folder or request)

Items nest arbitrarily deep via `item`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes¹ | Unique id, stable across rename/move |
| `name` | string | yes | Display name |
| `description` | string | no | |
| `request` | request object | no | Present when the item is a request (below) |
| `response` | array | no | Saved responses — **opaque in v0.0.1** (not structurally validated) |
| `item` | `CollectionItem[]` | no | Present when the item is a folder |

### Request object

Three request shapes, discriminated by `protocol`:

| Field | Type | HTTP | WS | SSE | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | string | yes¹ | yes¹ | yes¹ | Stamped on load when missing |
| `name` | string | yes¹ | yes¹ | yes¹ | Stamped from the wrapping item's name when missing |
| `protocol` | `'http' \| 'ws' \| 'sse'` | optional² | `'ws'` | `'sse'` | ² Absent means HTTP (backward compatibility) |
| `method` | string | yes | — | yes | HTTP verb |
| `url` | string \| URL object | yes | yes | yes | URL object: `{ raw, protocol?, host?, path?, query? }` |
| `query` | `ParamRow[]` | no | no | no | |
| `header` | `HeaderRow[]` | no | no | no | |
| `body` | body object | no | — | no | Discriminated union (below) |
| `description` | string | no | no | no | |
| `validation` | object | no | — | — | Response validation rules — **opaque in v0.0.1** |
| `authId` | string | no | no | no | Reference to a stored auth config |
| `sourceRef` | object | no | no | no | Runtime-only; stripped on save |

**Rows** (`ParamRow`, `HeaderRow`): `{ id?, key, value, disabled? }`. The `id` and `disabled` fields are auto-populated at runtime and tolerated as absent in files.

**Body** is a discriminated union on `mode`:

| `mode` | Payload |
| --- | --- |
| `none` | — |
| `raw` | `raw: string`, optional `options.raw.language` (`json`/`xml`/`html`/`text`/`csv`) |
| `urlencoded` | `urlencoded: FormField[]` (`{ id?, key, value \| null, disabled? }`) |
| `formdata` | `formdata: MultiPartFormField[]` (adds `fieldType: 'text' \| 'file'`, value may be a file reference) |
| `file` | optional `file` reference: `{ path, fileName, contentType, size, pathType, storageType, fileData? }` |

### Opaque fields in v0.0.1

`request.validation` and `item.response` are accepted without structural validation in this schema version. Tightening them is a future schema version bump.

---

## Wave Environment Schema (v0.0.1)

An environment file is a single JSON object (imports also accept an **array** of these):

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | string | yes | Logical identity (`'global'` is reserved for the Global environment) |
| `name` | string | yes | Display name; must be non-empty; also drives the filename |
| `version` | string | yes¹ | **Schema version** of the file (`0.0.1`) |
| `values` | `EnvironmentVariable[]` | yes | May be empty |
| `filename` | string | no | Runtime-only |

¹ Loaders stamp a missing `version` before validation; every save writes it.

### `EnvironmentVariable`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `key` | string | yes | Variable name used in `{{key}}` references |
| `value` | string | yes | |
| `type` | `'default' \| 'secret'` | yes¹ | ¹ Defaulted to `'default'` on load when missing/invalid |
| `notes` | string | no | |
| `enabled` | boolean | yes¹ | ¹ Defaulted to `true` on load when missing |

---

## Where validation happens

| Boundary | Collections | Environments |
| --- | --- | --- |
| Import | `CollectionService.import` / `saveFromContent` — invalid input rejected, nothing written | `EnvironmentService.import` — **all-or-nothing**: if any entry is invalid, none are persisted |
| Load | `CollectionService.loadOne` — invalid file logged & skipped; others still load | `EnvironmentService.loadAll` — invalid file logged & skipped; others still load |

Validation failures surface in the UI as error notifications with the failing field paths (up to the first five issues).

---

## Version history

| Version | Date | Changes |
| --- | --- | --- |
| `0.0.1` | 2026-06 | Initial formalized schemas for collections and environments. Captures the previously implicit persisted shapes; adds the required `version` field to environments. No migration needed — legacy files are normalized on load. |

**Rule going forward:** any change to a persisted shape bumps the relevant schema version and adds a row here describing the change and its migration path.
