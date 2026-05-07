/**
 * Self-contained CSS theme for Wave Client HTML reports.
 *
 * **Security contract**: This constant must never interpolate dynamic data.
 * It is embedded verbatim inside a `<style>` block by `renderShell()`.
 * Any change that introduces `</style>` or other injection sequences is a
 * security defect.
 *
 * Design notes:
 * - Dark-friendly palette via CSS custom properties on `:root`
 * - No `@import` — fully self-contained
 * - No external fonts — uses system UI font stack
 */
export const THEME_CSS = `
/* ============================================================
   Wave Client Report — self-contained theme
   ============================================================ */

/* ----- Reset ------------------------------------------------ */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* ----- Palette ---------------------------------------------- */
:root {
  --wc-bg: #0f172a;
  --wc-surface: #1e293b;
  --wc-surface-2: #263348;
  --wc-border: #334155;
  --wc-text: #e2e8f0;
  --wc-muted: #94a3b8;
  --wc-accent: #38bdf8;

  /* status colours */
  --wc-success: #22c55e;
  --wc-success-bg: #052e16;
  --wc-error: #ef4444;
  --wc-error-bg: #2d0a0a;
  --wc-warning: #f59e0b;
  --wc-warning-bg: #2d1a00;
  --wc-skipped: #a78bfa;
  --wc-skipped-bg: #1e1040;
  --wc-idle: #64748b;
  --wc-idle-bg: #1e293b;
  --wc-running: #38bdf8;
  --wc-running-bg: #082f49;

  /* method badge colours */
  --wc-get: #22c55e;
  --wc-post: #38bdf8;
  --wc-put: #f59e0b;
  --wc-patch: #a78bfa;
  --wc-delete: #ef4444;
  --wc-other: #64748b;
}

/* ----- Typography ------------------------------------------- */
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont,
               'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--wc-text);
  background: var(--wc-bg);
  padding: 24px 32px;
  max-width: 1100px;
  margin: 0 auto;
}

h1, h2, h3 { line-height: 1.2; color: var(--wc-text); }
h1 { font-size: 1.5rem; font-weight: 700; }
h2 { font-size: 1.1rem; font-weight: 600; }
h3 { font-size: 0.9rem; font-weight: 600; }

a { color: var(--wc-accent); text-decoration: none; }
a:hover { text-decoration: underline; }

/* ----- Report header --------------------------------------- */
.wc-report-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--wc-border);
}

.wc-wordmark {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--wc-accent);
}

.wc-run-type-label {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--wc-muted);
  margin-bottom: 2px;
}

.wc-subject-name {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--wc-text);
}

.wc-item-path {
  font-size: 0.8rem;
  color: var(--wc-muted);
  margin-top: 2px;
}

.wc-meta-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--wc-muted);
}

.wc-meta-item {
  display: flex;
  gap: 4px;
}

.wc-meta-label {
  font-weight: 600;
  color: var(--wc-muted);
}

.wc-meta-value {
  color: var(--wc-text);
}

/* ----- Summary tile grid ----------------------------------- */
.wc-summary-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.wc-search-input {
  width: min(100%, 380px);
  border: 1px solid var(--wc-border);
  border-radius: 6px;
  background: var(--wc-surface);
  color: var(--wc-text);
  font-size: 0.82rem;
  line-height: 1.2;
  padding: 7px 10px;
}

.wc-search-input:focus {
  outline: none;
  border-color: var(--wc-accent);
  box-shadow: 0 0 0 2px rgb(56 189 248 / 0.18);
}

.wc-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.wc-tile {
  background: var(--wc-surface);
  border: 1px solid var(--wc-border);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wc-tile-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--wc-muted);
}

.wc-tile-label-btn {
  appearance: none;
  background: transparent;
  border: 0;
  cursor: pointer;
  display: block;
  width: 100%;
  padding: 2px 0;
  text-align: left;
}

.wc-tile-label-btn:hover {
  color: var(--wc-accent);
}

.wc-tile-label-btn--active {
  color: var(--wc-accent);
}

.wc-tile-value {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1;
}

.wc-tile-value--total  { color: var(--wc-text); }
.wc-tile-value--passed { color: var(--wc-success); }
.wc-tile-value--failed { color: var(--wc-error); }
.wc-tile-value--skipped { color: var(--wc-skipped); }
.wc-tile-value--time   { color: var(--wc-accent); }

/* ----- Status pills ---------------------------------------- */
.wc-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border-radius: 999px;
}

.wc-status--success  { color: var(--wc-success);  background: var(--wc-success-bg); }
.wc-status--failed   { color: var(--wc-error);    background: var(--wc-error-bg); }
.wc-status--skipped  { color: var(--wc-skipped);  background: var(--wc-skipped-bg); }
.wc-status--running  { color: var(--wc-running);  background: var(--wc-running-bg); }
.wc-status--pending  { color: var(--wc-warning);  background: var(--wc-warning-bg); }
.wc-status--idle     { color: var(--wc-idle);     background: var(--wc-idle-bg); }
.wc-status--cancelled { color: var(--wc-idle);    background: var(--wc-idle-bg); }

.wc-status-indicators {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
  font-size: 0.78rem;
}

.wc-status-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 24px;
  border: 1px solid var(--wc-border);
  border-radius: 999px;
  background: var(--wc-surface-2);
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
}

.wc-status-chip--compact {
  min-width: 26px;
  padding: 2px 6px;
}

.wc-status-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  font-size: 0.88rem;
  line-height: 1;
}

.wc-status-chip__text {
  white-space: nowrap;
}

.wc-status-chip--idle {
  color: var(--wc-idle);
  border-color: #475569;
}

.wc-status-chip--pending {
  color: var(--wc-running);
  border-color: #0ea5e9;
}

.wc-status-icon--running {
  color: var(--wc-running);
  animation: wc-spin 0.9s linear infinite;
}

.wc-status-chip--running {
  color: var(--wc-running);
  border-color: #0ea5e9;
}

.wc-status-chip--success {
  color: var(--wc-success);
  border-color: #16a34a;
}

.wc-status-chip--failed {
  color: var(--wc-error);
  border-color: #dc2626;
}

.wc-status-chip--skipped {
  color: var(--wc-skipped);
  border-color: #8b5cf6;
}

.wc-status-http-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--wc-text);
  font-size: 0.76rem;
  font-weight: 700;
}

.wc-status-http-icon--success { color: var(--wc-success); }
.wc-status-http-icon--failed { color: var(--wc-error); }
.wc-status-http-icon--running { color: var(--wc-running); }
.wc-status-http-icon--pending { color: var(--wc-running); }
.wc-status-http-icon--skipped { color: var(--wc-skipped); }
.wc-status-http-icon--idle { color: var(--wc-idle); }

.wc-status-http--success { color: var(--wc-success); }
.wc-status-http--warning { color: var(--wc-warning); }
.wc-status-http--failed { color: var(--wc-error); }
.wc-status-http--neutral { color: var(--wc-muted); }

.wc-status-time {
  color: var(--wc-muted);
  font-weight: 500;
}

@keyframes wc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ----- Method badges --------------------------------------- */
.wc-method {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 4px;
  min-width: 46px;
  text-align: center;
}

.wc-method--GET    { color: #0f172a; background: var(--wc-get); }
.wc-method--POST   { color: #0f172a; background: var(--wc-post); }
.wc-method--PUT    { color: #0f172a; background: var(--wc-put); }
.wc-method--PATCH  { color: #0f172a; background: var(--wc-patch); }
.wc-method--DELETE { color: #fff;    background: var(--wc-delete); }
.wc-method--OTHER  { color: var(--wc-text); background: var(--wc-other); }

/* ----- Request-detail card --------------------------------- */
.wc-card {
  background: var(--wc-surface);
  border: 1px solid var(--wc-border);
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
}

.wc-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.wc-card-header:hover {
  background: var(--wc-surface-2);
}

.wc-card-name {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wc-card-url {
  font-size: 0.75rem;
  color: var(--wc-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.wc-card-time {
  font-size: 0.75rem;
  color: var(--wc-muted);
  white-space: nowrap;
}

.wc-card-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--wc-border);
}

/* ----- Tab strip ------------------------------------------- */
.wc-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 0 0;
  border-bottom: 1px solid var(--wc-border);
  margin-bottom: 12px;
}

.wc-tab-btn {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--wc-muted);
  padding: 4px 12px 6px;
  transition: color 0.15s, border-color 0.15s;
}

.wc-tab-btn[aria-selected="true"] {
  color: var(--wc-accent);
  border-bottom-color: var(--wc-accent);
}

.wc-tab-btn:hover {
  color: var(--wc-text);
}

/* ----- Pre blocks (headers / body / validation) ------------ */
.wc-pre-wrap {
  border-radius: 6px;
  overflow: hidden;
  margin-top: 8px;
}

.wc-pre-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--wc-muted);
  padding: 4px 10px;
  background: var(--wc-surface-2);
}

pre.wc-pre {
  background: #0a1628;
  color: var(--wc-text);
  font-family: 'SF Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  padding: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

/* ----- Validation result list ------------------------------ */
.wc-validation-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.wc-validation-item {
  background: var(--wc-surface-2);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wc-validation-item--pass { border-left: 3px solid var(--wc-success); }
.wc-validation-item--fail { border-left: 3px solid var(--wc-error); }

.wc-validation-rule { font-weight: 600; }

.wc-validation-meta {
  display: flex;
  gap: 16px;
  font-size: 0.75rem;
  color: var(--wc-muted);
}

/* ----- Error block ----------------------------------------- */
.wc-error-block {
  background: var(--wc-error-bg);
  border: 1px solid var(--wc-error);
  border-radius: 6px;
  color: var(--wc-error);
  font-size: 0.8rem;
  padding: 8px 12px;
  margin-bottom: 10px;
  word-break: break-all;
}

/* ----- Placeholder text ------------------------------------ */
.wc-placeholder {
  font-size: 0.8rem;
  color: var(--wc-muted);
  font-style: italic;
  padding: 8px 0;
}

/* ----- Section title --------------------------------------- */
.wc-section-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--wc-muted);
  margin: 20px 0 10px;
}

/* ----- Folder path chip ------------------------------------ */
.wc-folder-path {
  font-size: 0.72rem;
  color: var(--wc-muted);
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* ----- Suite item group (test suite report) ---------------- */
.wc-suite-item {
  background: var(--wc-surface);
  border: 1px solid var(--wc-border);
  border-radius: 8px;
  margin-bottom: 14px;
  overflow: hidden;
}

.wc-suite-item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;
}

.wc-suite-item-header:hover {
  background: var(--wc-surface-2);
}

.wc-suite-item-name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wc-suite-item-body {
  padding: 12px;
  border-top: 1px solid var(--wc-border);
}

.wc-method--FLOW { color: #e2e8f0; background: #4c1d95; }
.wc-method--CASE { color: #e2e8f0; background: #1e3a5f; }
`.trim();
