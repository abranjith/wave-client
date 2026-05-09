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
import { base64ToText } from '../../encoding';
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
  const statusIndicators = renderStatusIndicators(node);
  const folderPath =
    node.folderPath.length > 0
      ? `<span class="wc-folder-path" title="${escapeAttr(node.folderPath.join(' / '))}">${node.folderPath.map((s) => escapeHtml(s)).join(' / ')}</span>`
      : '';

  return `<div class="wc-card" data-report-item="request" data-filter-status="${escapeAttr(getCardFilterStatus(node))}" data-search-text="${escapeAttr(getCardSearchText(node))}">
  <div class="wc-card-header" data-toggle="card">
    ${methodBadge}
    <span class="wc-card-name" title="${escapeAttr(node.name)}">${escapeHtml(node.name)}</span>
    <span class="wc-card-url" title="${escapeAttr(node.url)}">${escapeHtml(node.url)}</span>
    ${statusIndicators}
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
    content = `<pre class="wc-pre wc-pre--scroll"><code>${escapeHtml(body.raw)}</code></pre>`;
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

  const decodedBody =
    node.isResponseEncoded === true && node.responseBody !== undefined
      ? base64ToText(node.responseBody)
      : node.responseBody;

  const isText = isTextResponse(node.responseHeaders, decodedBody, false);

  if (node.responseBody !== undefined) {
    let bodyContent: string;
    if (!isText) {
      bodyContent = `<pre class="wc-pre wc-pre--scroll"><code>${escapeHtml(BINARY_PLACEHOLDER)}</code></pre>`;
    } else {
      const pretty = prettyPrintIfJson(decodedBody, contentType);
      bodyContent = `<pre class="wc-pre wc-pre--scroll"><code>${escapeHtml(pretty)}</code></pre>`;
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

/**
 * Classifies a request node for the summary filter buttons.
 *
 * Exported so report builders can derive summary tile counts from the same
 * logic the per-card filter uses, ensuring tile counts match what filtering
 * actually shows. A successful HTTP request with a failed validation is
 * counted as `'failed'`.
 */
export function getCardFilterStatus(node: ReportRequestNode): 'passed' | 'failed' | 'skipped' | 'other' {
  if (node.runStatus === 'skipped') {
    return 'skipped';
  }

  if (node.runStatus === 'failed' || node.runStatus === 'cancelled') {
    return 'failed';
  }

  if (node.runStatus === 'success') {
    const hasFailedValidation = node.validationStatus === 'fail';
    const hasFailedHttpStatus =
      node.responseStatus !== undefined && (node.responseStatus < 200 || node.responseStatus >= 300);

    return hasFailedValidation || hasFailedHttpStatus ? 'failed' : 'passed';
  }

  return 'other';
}

function getCardSearchText(node: ReportRequestNode): string {
  return [
    node.name,
    node.method,
    node.url,
    node.folderPath.join(' '),
    node.error ?? '',
  ]
    .join(' ')
    .trim();
}

// ============================================================================
// Validation panel
// ============================================================================

/**
 * Renders an Expected/Actual/Error row inside the validation meta block.
 *
 * Long values are wrapped in a horizontally-scrollable `<pre><code>` block so
 * a multi-kilobyte JSON payload doesn't blow out the card. Short values
 * (single-line, <= 80 chars) render inline to keep the typical case compact.
 */
function renderValidationField(label: string, value: string): string {
  const isLong = value.length > 80 || value.includes('\n');
  const labelHtml = `<span class="wc-validation-meta-label">${escapeHtml(label)}:</span>`;
  if (!isLong) {
    return `<span class="wc-validation-meta-row">${labelHtml} <span class="wc-validation-meta-value">${escapeHtml(value)}</span></span>`;
  }
  return `<div class="wc-validation-meta-row wc-validation-meta-row--block">${labelHtml}<pre class="wc-pre wc-pre--scroll"><code>${escapeHtml(value)}</code></pre></div>`;
}

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
      const rows: string[] = [];
      if (r.expected !== undefined) {
        rows.push(renderValidationField('Expected', r.expected));
      }
      if (r.actual !== undefined) {
        rows.push(renderValidationField('Actual', r.actual));
      }
      if (r.error) {
        rows.push(renderValidationField('Error', r.error));
      }
      const metaHtml =
        rows.length > 0
          ? `<div class="wc-validation-meta">${rows.join('')}</div>`
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

function renderStatusIndicators(node: ReportRequestNode): string {
  const run = renderRunStatusIndicator(node.runStatus, node.responseStatus, node.responseTime);
  const validation =
    node.runStatus === 'success'
      ? renderValidationIndicator(node.validationStatus)
      : '';

  return `<span class="wc-status-indicators">${run}${validation}</span>`;
}

function renderRunStatusIndicator(
  status: RunStatus,
  responseStatus?: number,
  responseTime?: number,
): string {
  const indicatorName = getRunIndicatorName(status);
  const indicatorLabel = getRunIndicatorLabel(status);

  if (responseStatus !== undefined) {
    const statusClass = responseStatus >= 200 && responseStatus < 300
      ? 'wc-status-http--success'
      : responseStatus >= 400 && responseStatus < 500
        ? 'wc-status-http--warning'
        : responseStatus >= 500
          ? 'wc-status-http--failed'
          : 'wc-status-http--neutral';

    return `<span class="wc-status-http-wrap" data-run-indicator="${escapeAttr(indicatorName)}" title="${escapeAttr(indicatorLabel)}" aria-label="${escapeAttr(indicatorLabel)}">
  <span class="wc-status-http ${escapeAttr(statusClass)}">${responseStatus}</span>
  ${responseTime !== undefined ? `<span class="wc-status-time">${escapeHtml(formatDuration(responseTime))}</span>` : ''}
</span>`;
  }

  if (status === 'running') {
    return '<span class="wc-status-chip wc-status-chip--running" data-run-indicator="running" title="Running" aria-label="Running"><span class="wc-status-chip__text">Running</span></span>';
  }

  if (status === 'pending') {
    return '<span class="wc-status-chip wc-status-chip--pending" data-run-indicator="pending" title="Pending" aria-label="Pending"><span class="wc-status-chip__text">Pending</span></span>';
  }

  if (status === 'failed' || status === 'cancelled') {
    return '<span class="wc-status-chip wc-status-chip--failed" data-run-indicator="failed" title="Failed" aria-label="Failed"><span class="wc-status-chip__text">Failed</span></span>';
  }

  if (status === 'skipped') {
    return '<span class="wc-status-chip wc-status-chip--skipped" data-run-indicator="skipped" title="Skipped" aria-label="Skipped"><span class="wc-status-chip__text">Skipped</span></span>';
  }

  return '<span class="wc-status-chip wc-status-chip--idle" data-run-indicator="idle" title="Idle" aria-label="Idle"><span class="wc-status-chip__text">Idle</span></span>';
}

function renderValidationIndicator(status: 'idle' | 'pending' | 'pass' | 'fail'): string {
  if (status === 'idle') {
    return '';
  }

  if (status === 'pending') {
    return '<span class="wc-status-chip wc-status-chip--pending" data-validation-indicator="pending" title="Validation Pending" aria-label="Validation Pending"><span class="wc-status-chip__text">Pending</span></span>';
  }

  if (status === 'pass') {
    return '<span class="wc-status-chip wc-status-chip--success" data-validation-indicator="pass" title="Validation Pass" aria-label="Validation Pass"><span class="wc-status-chip__text">Passed</span></span>';
  }

  return '<span class="wc-status-chip wc-status-chip--failed" data-validation-indicator="fail" title="Validation Fail" aria-label="Validation Fail"><span class="wc-status-chip__text">Failed</span></span>';
}

function getRunIndicatorName(status: RunStatus): string {
  if (status === 'failed' || status === 'cancelled') {
    return 'failed';
  }
  return status;
}

function getRunIndicatorLabel(status: RunStatus): string {
  if (status === 'cancelled') {
    return 'Cancelled';
  }
  if (status === 'success') {
    return 'Success';
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}

