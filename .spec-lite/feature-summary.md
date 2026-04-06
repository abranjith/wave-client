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
