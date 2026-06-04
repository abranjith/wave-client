# Reporting

When you run a [collection](collections.md), [flow](flows.md), or [test suite](tests.md), Wave Client can produce an **HTML run report** you can save and share.

![An exported HTML run report with summary tiles](../images/reporting-html-report.png)

---

## What's in a report

- **Summary tiles** — Total / Passed / Failed / Skipped counts. Counts reflect the same classification used per request (e.g. an HTTP 200 with a failed validation counts as **Failed**).
- **Per‑request detail** — each request as an expandable card showing request and response details, with validation status surfaced for successful runs.
- **Response rendering** — response and validation payloads render in horizontally scrollable code blocks, so long single‑line JSON stays readable. Base64‑encoded text responses are decoded before formatting.

---

## Interacting with a report

The HTML report is self‑contained and interactive:

- **Search** top‑level cards by name, method, URL, and folder.
- **Filter** by status by clicking a summary tile; click the same tile again to clear the filter.
- **Expand All / Collapse All** toggles every request card at once.
- Long names and URLs show full text via native tooltips when truncated.

---

## Related guides
- [Collections](collections.md) — run a collection
- [Flows](flows.md) — run a flow
- [Test Lab](tests.md) — run a test suite
