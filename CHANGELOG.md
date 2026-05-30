# Change Log

All notable changes to the "wave-client" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Flow variable references now support JSONPath-based body lookups, including recursive descent, wildcards, filters, and array slices.
- Flow request node aliases are now generated as readable kebab-case names (for example, `get-employee`, `get-employee-2`).
- Flow nodes now provide an interactive hover card with a copy button for quickly copying aliases while wiring request chains.
- Breaking: legacy flow reference syntax like `{{alias.$body.data.id}}` no longer resolves; use `{{alias.$body:$.data.id}}`.
- Breaking: generated alias format changed from opaque suffixing to readable kebab-case with `-N` collision suffixes.