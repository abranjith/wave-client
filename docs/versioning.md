# Versioning

Wave Client is a monorepo that ships more than one thing: two apps, a reusable platform core, and persisted file formats. A single version number can't describe all of them honestly, so Wave Client uses **four independent version tracks**, each following [semantic versioning](https://semver.org).

This page defines the tracks, what a major/minor/patch bump means on each, and the exact manual checklist for bumping each one. It is the single procedure for releases — if a step isn't written here, it isn't part of the process.

> **Manual for now.** Version bumps and releases are deliberate, hand-executed checklists. Release automation (changesets, CI publishing) is future work, tracked in the project backlog — see [Automation status](#automation-status).

---

## The four tracks

| # | Track | What it versions | Where the version lives |
| --- | --- | --- | --- |
| 1 | **VS Code app** | The `wave-client-vscode` extension — the marketplace‑facing version users see | `packages/vscode/package.json` |
| 2 | **Web app** | The `@wave-client/web` browser app | `packages/web/package.json` |
| 3 | **Core platform** | The shared libraries and backends, versioned **in lockstep** as one platform version | `package.json` of each platform package (list below) |
| 4 | **Wave schemas** | The persisted **collection** and **environment** file formats | `CURRENT_COLLECTION_SCHEMA_VERSION` / `CURRENT_ENVIRONMENT_SCHEMA_VERSION` in `packages/core/src/schemas/` |

Tracks move independently: an app can release without a platform bump, the platform can bump without either app releasing, and **schema versions never move just because a package released** (and vice versa).

### Package‑to‑track assignment

Every package in the repo belongs to exactly one track:

| Package | npm name | Track |
| --- | --- | --- |
| `packages/vscode` | `wave-client-vscode` | 1 — VS Code app |
| `packages/web` | `@wave-client/web` | 2 — Web app |
| `packages/core` | `@wave-client/core` | 3 — Core platform |
| `packages/shared` | `@wave-client/shared` | 3 — Core platform |
| `packages/arena` | `@wave-client/arena` | 3 — Core platform |
| `packages/server` | `@wave-client/server` | 3 — Core platform¹ |
| `packages/mcp-server` | `@wave-client/mcp-server` | 3 — Core platform¹ |

¹ `server` and `mcp-server` follow the core platform track **unless/until they ship independently** (e.g., a standalone hosted server release). If that happens, they graduate to their own tracks and this page gets updated.

The repo‑root `package.json` (`wave-client`, `private: true`) is the workspace root — it is never published and its version is not part of any track.

The Wave schemas (track 4) are **not** a package: they are two exported constants and Zod schemas in `packages/core/src/schemas/`, documented field‑by‑field in [Wave Schemas](schemas.md). A change to `@wave-client/core`'s code bumps track 3; a change to the persisted file *shape* bumps track 4 — these are different events even though both live in the same package.

---

## Semver semantics per track

All tracks use `MAJOR.MINOR.PATCH`. What counts as "breaking" differs by audience:

### Tracks 1 & 2 — apps (audience: end users)

| Bump | When |
| --- | --- |
| **Major** | A change that breaks an existing user workflow — removed features, an incompatible change to settings/keybindings/CLI invocation, dropped platform support |
| **Minor** | New user‑visible features or capabilities |
| **Patch** | Bug fixes, performance work, visual polish — no new features |

### Track 3 — core platform (audience: the apps and [Build Your Own Client](build-your-own-client.md) authors)

| Bump | When |
| --- | --- |
| **Major** | A breaking change to any platform package's public surface: `@wave-client/core` exports (components, hooks, types, `IPlatformAdapter`), `@wave-client/shared` service contracts, server REST routes, or MCP tool contracts |
| **Minor** | Backward‑compatible additions — new exports, new optional adapter methods, new routes/tools |
| **Patch** | Bug fixes and internal refactors with no public‑surface change |

### Track 4 — Wave schemas (audience: every persisted collection/environment file on users' disks)

| Bump | When |
| --- | --- |
| **Major** | An incompatible change to the persisted shape — existing valid files would no longer validate without migration |
| **Minor** | Backward‑compatible shape additions (new optional fields) |
| **Patch** | Documentation‑level clarifications or validation tightening that every existing valid file already satisfies |

Schema versions bump **only** on persisted‑shape changes — never for code refactors, new app features, or package releases. Every schema bump requires a row in the [version history in Wave Schemas](schemas.md#version-history) describing the change and its migration path. The collection and environment schemas are versioned separately and may bump independently.

### Pre‑1.0 convention (applies to all tracks)

While a track is at `0.x`, the major slot stays `0`: **breaking changes bump the minor** (`0.3.x` → `0.4.0`) and everything else bumps the patch. A track moves to `1.0.0` when its surface is declared stable.

---

## The lockstep rule (track 3)

The five platform packages — `core`, `shared`, `arena`, `server`, `mcp-server` — always carry the **same version number** and are bumped **together**, even when only one of them changed. One platform version describes one coherent, tested combination; per‑package drift would force a compatibility matrix nobody wants to maintain.

Internal dependencies use the pnpm `workspace:*` protocol, so lockstep bumps never require editing dependency ranges — only each package's own `version` field.

---

## How to bump — checklists

> **Before any bump**: work is merged to `main`, and `pnpm build` and `pnpm test` pass from the repo root.

### Track 1 — VS Code app

1. Decide the bump type using the [app semantics](#tracks-1--2--apps-audience-end-users) above.
2. Edit `version` in `packages/vscode/package.json`.
3. Add a release section at the **top** of [Release Notes](release-notes.md) (`## <version> — <short title>`), summarizing user‑facing changes by area.
4. Build the extension: `pnpm build:vscode` from the repo root.
5. Package and publish to the marketplace with [vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) (`vsce package`, then `vsce publish`) from `packages/vscode`.
6. Commit with message `release(vscode): v<version>` and tag `vscode-v<version>`.

### Track 2 — Web app

1. Decide the bump type using the [app semantics](#tracks-1--2--apps-audience-end-users) above.
2. Edit `version` in `packages/web/package.json`.
3. Add or extend the release section at the top of [Release Notes](release-notes.md) (shared with track 1 when both apps release together).
4. Build: `pnpm build:web` from the repo root.
5. Commit with message `release(web): v<version>` and tag `web-v<version>`.

### Track 3 — Core platform (lockstep)

1. Decide the bump type using the [platform semantics](#track-3--core-platform-audience-the-apps-and-build-your-own-client-authors) above — judge by the most severe change across **all five** packages.
2. Edit `version` to the **same new value** in all five `package.json` files: `packages/core`, `packages/shared`, `packages/arena`, `packages/server`, `packages/mcp-server` — including packages with no changes.
3. Do **not** touch internal dependency ranges (`workspace:*` — see [the lockstep rule](#the-lockstep-rule-track-3)).
4. If the changes are user‑visible through an app, note them in the next app release's [Release Notes](release-notes.md) entry; platform‑internal changes need no release‑notes entry.
5. Build and test everything: `pnpm build` and `pnpm test` from the repo root.
6. Commit with message `release(platform): v<version>` and tag `platform-v<version>`.

### Track 4 — Wave schemas

1. Confirm the change really alters a **persisted shape** (a field added/removed/retyped in collection or environment files). If not, stop — no schema bump.
2. Decide the bump type using the [schema semantics](#track-4--wave-schemas-audience-every-persisted-collectionenvironment-file-on-users-disks) above.
3. Update the affected constant in `packages/core/src/schemas/` — `CURRENT_COLLECTION_SCHEMA_VERSION` (`collectionSchema.ts`) and/or `CURRENT_ENVIRONMENT_SCHEMA_VERSION` (`environmentSchema.ts`) — alongside the Zod schema change itself.
4. For anything beyond a backward‑compatible addition, implement load‑time normalization/migration so existing files keep loading (the loaders already stamp missing `version`/ids — extend that path).
5. Update [Wave Schemas](schemas.md): the field tables **and** a new row in the [version history](schemas.md#version-history) with the change description and migration path. This row is mandatory for every bump.
6. Update/add schema tests, then run `pnpm test` from the repo root.
7. Commit with message `release(schema): collection v<version>` / `release(schema): environment v<version>` as applicable. A schema bump ships with whatever package release carries the code — it never requires one.

---

## Automation status

Releases are **manual** today by design — the process above is young, and automating it before it stabilizes would bake in the wrong shape. Adopting release tooling (changesets or similar CI publishing) once the manual process settles is tracked in the project backlog (`.spec-lite/TODO.md`).
