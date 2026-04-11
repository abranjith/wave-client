<!-- Maintained by spec-lite v0.0.7 | updated by: implement, fix sub-agents -->

# Feature Summary

> **Current state only.** This document reflects what each feature does *right now* — not what it used to do.
> Maintained by the Implement and Fix sub-agents after every code change that affects feature behavior.
> For change history, use source control (e.g., git).

---

## Validation

**FEAT-001: Validation Engine Enhancement** *(updated: 2026-04-05 by implement)*
The validation engine in `packages/shared/src/utils/validationEngine.ts` now uses `jsonpath-plus` for full JSONPath expression evaluation (recursive descent `$..`, wildcards `[*]`, array slicing, filter expressions) and `ajv` for real JSON Schema validation (draft-07 compatible). The old naive dot-notation splitter and parse-only stub have been replaced. A new `validateJsonSchemaString(schemaString)` helper is exported from `@wave-client/shared` — it returns `{ valid: boolean; errors?: string[] }` and is intended for UI-side pre-validation of user-provided schema strings before saving a rule. All JSONPath evaluation uses `eval: false` to block script injection. The `ajv` instance is a module-level singleton (`allErrors: true`) for performance. All existing tests continue to pass; 28 new test cases cover jsonpath-plus features, ajv schema validation, and `validateJsonSchemaString` edge cases (237 tests total).

**FEAT-003: Validation UX Polish — Tooltips, Placeholders & Schema Validation** *(updated: 2026-04-05 by implement)*
`ValidationRuleEditor` (the unified rule-editing form from FEAT-002) now has three layers of UX polish: (1) **Field-level tooltips** — a `FieldTooltip` internal helper component wraps a Radix UI `Tooltip` around an `InfoIcon`; body rules show a tooltip on the category selector explaining the content-type/JSONPath/operator relationship; `BodyFields` also shows tooltips on the JSON Path label ("Use JSONPath expressions…") and the JSON Schema label ("Enter a valid JSON Schema draft-07 object…"). (2) **Operator-aware placeholders** — in `HeaderFields`, the `Expected Value` input shows a regex-specific example placeholder (`e.g., ^[0-9a-f]{8}-...`) when the operator is `matches_regex`, and a generic example otherwise. (3) **Real-time JSON Schema validation indicator** — in `BodyFields` when the operator is `json_schema_matches`, the schema textarea is followed by a live indicator: a green `CheckIcon` + "Valid JSON Schema" when the schema compiles, or a red `XIcon` + the first ajv error message when it does not. The indicator updates on every keystroke via `useEffect`. A local `validateJsonSchemaString` utility was added to `packages/core/src/utils/schemaValidation.ts` (using `ajv ^8.17.1` added to `packages/core` deps) rather than importing from `@wave-client/shared`, to avoid a circular dependency (`shared → core → shared`). 10 new component tests (T1–T10) and 9 utility tests cover all new behaviour.

---

## Collections Import

**FEAT-FP-001: Scalar OpenAPI Parser Migration** *(updated: 2026-04-05 by implement)*
OpenAPI/Swagger import now uses `@scalar/openapi-parser` for robust parsing and inline `$ref` dereferencing instead of hand-rolled schema types. The Swagger transformer now accepts both JSON and YAML inputs, supports OpenAPI 3.x and Swagger 2.0 documents, and preserves request grouping/body/header/query mapping into Wave collections. The web and VS Code app import handlers now run non-Wave formats through `transformCollection` before persistence, so Swagger, Postman, and HTTP imports are transformed consistently instead of being sent raw to storage. Transformer contracts are async end-to-end, and the new Swagger transformer test suite validates JSON, YAML, Swagger 2.0, `$ref` resolution, export mapping, and error paths.

---

## Collections UI

**FEAT-002: Collections Pane — Menu Icons, Working Delete with Confirmation, Rename** *(updated: 2026-04-09 by implement)*
Collection, folder, and request rows in the Collections pane now all expose consistent iconized action menus (Run / Rename / Delete). Inline rename is supported at every level with sibling-level uniqueness checks and Enter/Escape shortcuts. Delete actions are guarded by a shared `ConfirmDialog`. All mutations are persisted through the adapter boundary (`saveCollection` / `deleteCollection` / `deleteRequestFromCollection`) and reflected in Zustand state via `updateCollection` / `removeCollection`. Adapter parity gaps closed: `deleteRequestFromCollection` in `vsCodeAdapter` now uses `sendAndWait` with `responseDataMap` correlation; `MessageHandler` handles the new `deleteCollection` and `deleteRequestFromCollection` message types; `webAdapter` calls the new `DELETE /api/collections/:filename/items/:itemId` server route; `CollectionService.deleteItem` and the server route were added in `packages/shared` and `packages/server`. New tree utilities (`renameItemInTree`, `removeItemFromTree`, `getSiblingsAtPath`) were added to `collectionParser.ts`. Covered by 22 new component tests across `CollectionsPane.test.tsx` (9 tests) and `CollectionTreeItem.test.tsx` (13 tests).

**FEAT-005: Environments Pane — Add Context Menu with Rename and Delete** *(updated: 2026-04-09 by implement)*
Each environment row now exposes a hover-visible three-dots (`MoreVertical`) dropdown menu with Rename and Delete actions. Clicking Rename opens an inline `<Input>` seeded with the environment's current name; pressing Enter or blurring commits, Escape cancels. On commit, the handler trims the input, skips the adapter call when the name is unchanged, and enforces case-insensitive uniqueness against all other environments — duplicate names surface an error notification and abort without touching the adapter. On success, `storageAdapter.saveEnvironment` is called first, and the Zustand store is updated via `updateEnvironment` only after the adapter confirms. Adapter failures surface via `notification.showNotification('error', ...)` without mutating the store. Delete is confirm-gated via the shared `useConfirmDialog` hook: `storageAdapter.deleteEnvironment` is called only after explicit user confirmation; the store is mutated via `removeEnvironment` only on adapter success; errors surface without removing the row. `<ConfirmDialogComponent />` is rendered in all four branches (loading, error, empty, populated). Covered by 14 component tests in `EnvironmentsPane.test.tsx`.

**FEAT-004: Flows Pane — Add Delete Confirmation** *(updated: 2026-04-09 by implement)*
Flow deletion in the Flows pane is now guarded by the shared `useConfirmDialog` hook: clicking Delete opens a titled confirmation dialog; the adapter call (`deleteFlow`) only proceeds on explicit user confirmation; the Zustand store is mutated (`removeFlow`) only on adapter success; adapter errors surface via `notification.showNotification('error', ...)`. All existing row behaviors are preserved: the hover Run button remains present for flows with nodes, inline rename with uniqueness validation continues to work, and the `Running...` label hides the action controls for flows mid-run. Covered by 15 component tests in `FlowsPane.test.tsx`.

**FEAT-003: Test Lab Pane — Remove Run Hover Button, Add Delete Confirmation** *(updated: 2026-04-09 by implement)*
Test suite rows in the Test Lab pane no longer render a per-row hover run shortcut button (PlayIcon). The `onTestSuiteRun` prop has been removed from `TestLabPane` and its callers (`ConfigPanel` in both vscode and web packages). Delete is now guarded by the shared `useConfirmDialog` hook: clicking Delete opens a titled confirmation dialog; the adapter call (`deleteTestSuite`) only proceeds on explicit user confirmation; the Zustand store is mutated (`removeTestSuite`) only on adapter success; adapter errors surface via `notification.showNotification('error', ...)`. The `Running...` status label and inline rename behavior are preserved. Covered by 13 new component tests in `TestLabPane.test.tsx`.
