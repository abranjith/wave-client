/**
 * Renders a single request detail card for the Wave Client HTML report.
 *
 * The card mirrors the layout of `RunRequestCard.tsx` as static HTML:
 *
 * - **Card header** (always visible): method badge, name, URL, run-status pill,
 *   response status code, and elapsed time.  Clicking the header toggles the
 *   card body via the `data-toggle="card"` interactivity hook.
 *
 * - **Card body** (hidden by default): a three-tab strip (Request / Response /
 *   Validation) with a panel for each.
 *
 * **Security contract**: every dynamic value — names, URLs, header keys and
 * values, body text, error messages, validation messages — is routed through
 * `escapeHtml` before being embedded.  No raw template-literal interpolation
 * of user-controlled data.
 *
 * **Protocol handling**: WebSocket requests have no HTTP method or body; the
 * Request tab renders whatever fields are available and omits those that don't
 * apply (method badge, body section) gracefully.
 */

import { escapeHtml, escapeAttr } from '../escape';
import { formatDuration } from '../format';
import { isTextResponse, prettyPrintIfJson, BINARY_PLACEHOLDER } from '../content';
import { isHttpRequest, isWsRequest, isSseRequest } from '../../requestTypeGuards';
import type { ReportRequestNode, RunStatus } from '../types';
import type {
  AnyCollectionRequest,
  CollectionRequest,
  SseCollectionRequest,
  HeaderRow,
  ParamRow,
  CollectionBody,
} from '../../../types/collection';

// ============================================================================
// Public API
// ============================================================================

/**
 * Renders a complete request detail card as an HTML string.
 *
 * @param node - The run request node to render.
 * @returns An HTML string for the card (unstyled without the report shell).
 */
export function renderRequestDetail(node: ReportRequestNode): string {
  return `${renderCardHeader(node)}${renderCardBody(node)}`;
}

// ============================================================================
// Card header
// ============================================================================

function renderCardHeader(node: ReportRequestNode): string {
  const methodBadge = renderMethodBadge(node.method, node.request);
  const statusPill = renderStatusPill(node.runStatus);
  const responseStatus =
    node.responseStatus !== undefined
      ? `<span class="wc-meta-value">${node.responseStatus}</span>`
      : '';
  const elapsed =
    node.responseTime !== undefined
      ? `<span class="wc-card-time">${escapeHtml(formatDuration(node.responseTime))}</span>`
      : '';
  const folderPath =
    node.folderPath.length > 0
      ? `<span class="wc-folder-path">${node.folderPath.map((s) => escapeHtml(s)).join(' / ')}</span>`
      : '';

  return `<div class="wc-card">
  <div class="wc-card-header" data-toggle="card">
    ${methodBadge}
    <span class="wc-card-name">${escapeHtml(node.name)}</span>
    <span class="wc-card-url">${escapeHtml(node.url)}</span>
    ${statusPill}
    ${responseStatus}
    ${elapsed}
    ${folderPath}
  </div>`;
}

// ============================================================================
// Card body (tabs)
// ============================================================================

function renderCardBody(node: ReportRequestNode): string {
  const reqPanel = renderRequestPanel(node.request);
  const respPanel = renderResponsePanel(node);
  const valPanel = renderValidationPanel(node);

  return `  <div class="wc-card-body" data-card-body hidden>
    <div class="wc-tabs">
      <button class="wc-tab-btn" data-tab="request" aria-selected="true">Request</button>
      <button class="wc-tab-btn" data-tab="response" aria-selected="false">Response</button>
      <button class="wc-tab-btn" data-tab="validation" aria-selected="false">Validation</button>
    </div>
    <div data-tab-panel="request">${reqPanel}</div>
    <div data-tab-panel="response" hidden>${respPanel}</div>
    <div data-tab-panel="validation" hidden>${valPanel}</div>
  </div>
</div>`;
}

// ============================================================================
// Request panel
// ============================================================================

function renderRequestPanel(request: AnyCollectionRequest): string {
  const sections: string[] = [];

  // Headers (all protocols)
  if (request.header && request.header.length > 0) {
    sections.push(renderHeadersTable('Request Headers', request.header));
  }

  // Query params (all protocols)
  if (request.query && request.query.length > 0) {
    sections.push(renderParamsTable('Query Parameters', request.query));
  }

  // Body (HTTP and SSE only — WS has no body)
  if (isHttpRequest(request) || isSseRequest(request)) {
    const bodySection = renderRequestBodySection(
      (request as CollectionRequest | SseCollectionRequest).body,
    );
    if (bodySection) { sections.push(bodySection); }
  }

  if (sections.length === 0) {
    return '<p class="wc-placeholder">No request details available.</p>';
  }
  return sections.join('');
}

function renderHeadersTable(title: string, headers: HeaderRow[]): string {
  const enabled = headers.filter((h) => !h.disabled);
  if (enabled.length === 0) { return ''; }
  const rows = enabled
    .map(
      (h) =>
        `<tr><td>${escapeHtml(h.key)}</td><td>${escapeHtml(h.value)}</td></tr>`,
    )
    .join('');
  return `<div class="wc-pre-wrap">
  <div class="wc-pre-label">${escapeHtml(title)}</div>
  <table class="wc-table"><tbody>${rows}</tbody></table>
</div>`;
}

function renderParamsTable(title: string, params: ParamRow[]): string {
  const enabled = params.filter((p) => !p.disabled);
  if (enabled.length === 0) { return ''; }
  const rows = enabled
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.key)}</td><td>${escapeHtml(p.value)}</td></tr>`,
    )
    .join('');
  return `<div class="wc-pre-wrap">
  <div class="wc-pre-label">${escapeHtml(title)}</div>
  <table class="wc-table"><tbody>${rows}</tbody></table>
</div>`;
}

function renderRequestBodySection(body: CollectionBody | undefined): string {
  if (!body || body.mode === 'none') { return ''; }

  let content = '';
  if (body.mode === 'raw') {
    content = `<pre class="wc-pre">${escapeHtml(body.raw)}</pre>`;
  } else if (body.mode === 'urlencoded' && body.urlencoded.length > 0) {
    const rows = body.urlencoded
      .filter((f) => !f.disabled)
      .map((f) => `<tr><td>${escapeHtml(f.key)}</td><td>${escapeHtml(f.value ?? '')}</td></tr>`)
      .join('');
    content = `<table class="wc-table"><tbody>${rows}</tbody></table>`;
  } else if (body.mode === 'formdata' && body.formdata.length > 0) {
    const rows = body.formdata
      .filter((f) => !f.disabled)
      .map((f) => {
        const val =
          typeof f.value === 'string' ? f.value : f.value ? '[File]' : '';
        return `<tr><td>${escapeHtml(f.key)}</td><td>${escapeHtml(val)}</td></tr>`;
      })
      .join('');
    content = `<table class="wc-table"><tbody>${rows}</tbody></table>`;
  } else if (body.mode === 'file') {
    const filename = body.file?.fileName ?? '[file]';
    content = `<p class="wc-placeholder">File: ${escapeHtml(filename)}</p>`;
  } else {
    return '';
  }

  return `<div class="wc-pre-wrap">
  <div class="wc-pre-label">Request Body (${escapeHtml(body.mode)})</div>
  ${content}
</div>`;
}

// ============================================================================
// Response panel
// ============================================================================

function renderResponsePanel(node: ReportRequestNode): string {
  const sections: string[] = [];

  // Error block (shown first when present)
  if (node.error) {
    sections.push(
      `<div class="wc-error-block">${escapeHtml(node.error)}</div>`,
    );
  }

  // Status + elapsed meta
  const statusLine: string[] = [];
  if (node.responseStatus !== undefined) {
    statusLine.push(`Status: <strong>${node.responseStatus}</strong>`);
  }
  if (node.responseTime !== undefined) {
    statusLine.push(`Time: <strong>${escapeHtml(formatDuration(node.responseTime))}</strong>`);
  }
  if (statusLine.length > 0) {
    sections.push(
      `<p class="wc-meta-item" style="margin-bottom:8px;">${statusLine.join(' &nbsp;&bull;&nbsp; ')}</p>`,
    );
  }

  // Response headers
  if (node.responseHeaders && Object.keys(node.responseHeaders).length > 0) {
    const rows = Object.entries(node.responseHeaders)
      .map(
        ([k, v]) =>
          `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`,
      )
      .join('');
    sections.push(`<div class="wc-pre-wrap">
  <div class="wc-pre-label">Response Headers</div>
  <table class="wc-table"><tbody>${rows}</tbody></table>
</div>`);
  }

  // Response body
  const contentType =
    node.responseHeaders
      ? getContentTypeFromHeaders(node.responseHeaders)
      : undefined;

  const isText = isTextResponse(node.responseHeaders, node.responseBody, node.isResponseEncoded);

  if (node.responseBody !== undefined) {
    let bodyContent: string;
    if (!isText) {
      bodyContent = `<pre class="wc-pre">${escapeHtml(BINARY_PLACEHOLDER)}</pre>`;
    } else {
      const pretty = prettyPrintIfJson(node.responseBody, contentType);
      bodyContent = `<pre class="wc-pre">${escapeHtml(pretty)}</pre>`;
    }
    sections.push(`<div class="wc-pre-wrap">
  <div class="wc-pre-label">Response Body</div>
  ${bodyContent}
</div>`);
  }

  if (sections.length === 0) {
    return '<p class="wc-placeholder">No response data.</p>';
  }
  return sections.join('');
}

function getContentTypeFromHeaders(headers: Record<string, string>): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
  return key !== undefined ? headers[key] : undefined;
}

// ============================================================================
// Validation panel
// ============================================================================

function renderValidationPanel(node: ReportRequestNode): string {
  const vr = node.validationResult;

  if (!vr || !vr.enabled || vr.results.length === 0) {
    return '<p class="wc-placeholder">No validation rules were applied.</p>';
  }

  const items = vr.results
    .map((r) => {
      const cls = r.passed ? 'wc-validation-item--pass' : 'wc-validation-item--fail';
      const label = r.passed
        ? '<span class="wc-status wc-status--success">PASS</span>'
        : '<span class="wc-status wc-status--failed">FAIL</span>';
      const meta: string[] = [];
      if (r.expected !== undefined) {
        meta.push(`Expected: ${escapeHtml(r.expected)}`);
      }
      if (r.actual !== undefined) {
        meta.push(`Actual: ${escapeHtml(r.actual)}`);
      }
      if (r.error) {
        meta.push(`Error: ${escapeHtml(r.error)}`);
      }
      const metaHtml =
        meta.length > 0
          ? `<div class="wc-validation-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>`
          : '';
      return `<li class="wc-validation-item ${escapeAttr(cls)}">
  ${label}
  <span class="wc-validation-rule">${escapeHtml(r.ruleName)}</span>
  <span class="wc-placeholder">${escapeHtml(r.message)}</span>
  ${metaHtml}
</li>`;
    })
    .join('');

  return `<ul class="wc-validation-list">${items}</ul>`;
}

// ============================================================================
// Method badge helper
// ============================================================================

function renderMethodBadge(method: string, request: AnyCollectionRequest): string {
  let displayMethod: string;

  if (isWsRequest(request)) {
    displayMethod = 'WS';
  } else if (isSseRequest(request)) {
    displayMethod = method || 'SSE';
  } else {
    displayMethod = method || 'GET';
  }

  const upper = displayMethod.toUpperCase();
  const knownMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const cls = knownMethods.includes(upper)
    ? `wc-method--${upper}`
    : 'wc-method--OTHER';

  return `<span class="wc-method ${escapeAttr(cls)}">${escapeHtml(upper)}</span>`;
}

// ============================================================================
// Status pill helper
// ============================================================================

const STATUS_CSS: Record<RunStatus, string> = {
  success: 'wc-status--success',
  failed: 'wc-status--failed',
  skipped: 'wc-status--skipped',
  running: 'wc-status--running',
  pending: 'wc-status--pending',
  idle: 'wc-status--idle',
  cancelled: 'wc-status--cancelled',
};

function renderStatusPill(status: RunStatus): string {
  const cls = STATUS_CSS[status] ?? 'wc-status--idle';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="wc-status ${escapeAttr(cls)}">${escapeHtml(label)}</span>`;
}
