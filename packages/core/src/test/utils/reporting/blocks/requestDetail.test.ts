import { describe, it, expect } from 'vitest';
import { renderRequestDetail } from '../../../../utils/reporting/blocks/requestDetail';
import { BINARY_PLACEHOLDER } from '../../../../utils/reporting/content';
import type { ReportRequestNode } from '../../../../utils/reporting/types';
import type { CollectionRequest, WsCollectionRequest } from '../../../../types/collection';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeHttpRequest(overrides: Partial<CollectionRequest> = {}): CollectionRequest {
  return {
    id: 'req-1',
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/users',
    header: [{ id: 'h1', key: 'Accept', value: 'application/json', disabled: false }],
    query: [{ id: 'q1', key: 'page', value: '1', disabled: false }],
    ...overrides,
  };
}

function makeWsRequest(overrides: Partial<WsCollectionRequest> = {}): WsCollectionRequest {
  return {
    id: 'req-ws-1',
    name: 'WS Connection',
    protocol: 'ws',
    url: 'wss://api.example.com/ws',
    header: [],
    ...overrides,
  };
}

function makeNode(overrides: Partial<ReportRequestNode> = {}): ReportRequestNode {
  return {
    id: 'node-1',
    name: 'Get Users',
    method: 'GET',
    url: 'https://api.example.com/users',
    folderPath: [],
    runStatus: 'success',
    responseStatus: 200,
    responseTime: 142,
    validationStatus: 'pass',
    request: makeHttpRequest(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// HTTP happy path
// ---------------------------------------------------------------------------

describe('renderRequestDetail — HTTP happy path', () => {
  const out = renderRequestDetail(
    makeNode({
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: '{"id":1}',
    }),
  );

  it('renders a wc-card container', () => {
    expect(out).toContain('wc-card');
  });

  it('renders the request name in the card header', () => {
    expect(out).toContain('Get Users');
  });

  it('renders the URL in the card header', () => {
    expect(out).toContain('https://api.example.com/users');
  });

  it('renders the GET method badge', () => {
    expect(out).toContain('GET');
    expect(out).toContain('wc-method--GET');
  });

  it('renders the HTTP response status code', () => {
    expect(out).toContain('200');
  });

  it('renders the elapsed time', () => {
    expect(out).toContain('142ms');
  });

  it('renders the success status pill', () => {
    expect(out).toContain('wc-status--success');
  });

  it('includes data-toggle="card" on the header for interactivity', () => {
    expect(out).toContain('data-toggle="card"');
  });

  it('includes the card body hidden by default', () => {
    expect(out).toContain('data-card-body');
    expect(out).toContain('hidden');
  });

  it('renders the three tab buttons', () => {
    expect(out).toContain('data-tab="request"');
    expect(out).toContain('data-tab="response"');
    expect(out).toContain('data-tab="validation"');
  });

  it('renders the response body (pretty-printed JSON)', () => {
    // JSON is pretty-printed then HTML-escaped, so quotes become &quot;
    expect(out).toContain('&quot;id&quot;: 1');
  });
});

// ---------------------------------------------------------------------------
// Failed request with error message
// ---------------------------------------------------------------------------

describe('renderRequestDetail — failed request with error', () => {
  const out = renderRequestDetail(
    makeNode({
      runStatus: 'failed',
      responseStatus: undefined,
      responseTime: undefined,
      error: 'Network timeout after 30s',
      responseBody: undefined,
    }),
  );

  it('renders the failed status pill', () => {
    expect(out).toContain('wc-status--failed');
  });

  it('renders the error message', () => {
    expect(out).toContain('Network timeout after 30s');
  });

  it('renders an error block element', () => {
    expect(out).toContain('wc-error-block');
  });
});

// ---------------------------------------------------------------------------
// Skipped request
// ---------------------------------------------------------------------------

describe('renderRequestDetail — skipped status', () => {
  const out = renderRequestDetail(
    makeNode({ runStatus: 'skipped', responseStatus: undefined }),
  );

  it('renders the skipped status pill', () => {
    expect(out).toContain('wc-status--skipped');
    expect(out).toContain('Skipped');
  });
});

// ---------------------------------------------------------------------------
// Binary response
// ---------------------------------------------------------------------------

describe('renderRequestDetail — binary response', () => {
  const out = renderRequestDetail(
    makeNode({
      responseHeaders: { 'content-type': 'image/png' },
      responseBody: 'iVBORw0KGgoAAAANSUhEUg==',
      isResponseEncoded: true,
    }),
  );

  it('renders the BINARY_PLACEHOLDER text', () => {
    expect(out).toContain(BINARY_PLACEHOLDER);
  });

  it('does not render the raw base64 body', () => {
    expect(out).not.toContain('iVBORw0KGgoAAAANSUhEUg==');
  });
});

// ---------------------------------------------------------------------------
// Binary by content-type (image) — not encoded flag but binary content-type
// ---------------------------------------------------------------------------

describe('renderRequestDetail — binary by content-type', () => {
  const out = renderRequestDetail(
    makeNode({
      responseHeaders: { 'content-type': 'image/jpeg' },
      responseBody: 'raw-bytes-here',
      isResponseEncoded: false,
    }),
  );

  it('renders the BINARY_PLACEHOLDER for image content-type', () => {
    expect(out).toContain(BINARY_PLACEHOLDER);
  });
});

// ---------------------------------------------------------------------------
// JSON response — pretty-printed
// ---------------------------------------------------------------------------

describe('renderRequestDetail — JSON pretty-printing', () => {
  const body = '{"a":1,"b":"hello"}';
  const out = renderRequestDetail(
    makeNode({
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: body,
    }),
  );

  it('pretty-prints JSON with two-space indent', () => {
    // JSON is pretty-printed then HTML-escaped, so quotes become &quot;
    expect(out).toContain('&quot;a&quot;: 1');
    expect(out).toContain('&quot;b&quot;: &quot;hello&quot;');
  });
});

// ---------------------------------------------------------------------------
// WebSocket request
// ---------------------------------------------------------------------------

describe('renderRequestDetail — WebSocket request', () => {
  const wsNode = makeNode({
    method: '',
    request: makeWsRequest(),
    responseStatus: undefined,
    responseTime: undefined,
    runStatus: 'success',
  });

  it('renders without throwing', () => {
    expect(() => renderRequestDetail(wsNode)).not.toThrow();
  });

  it('renders a WS method badge', () => {
    const out = renderRequestDetail(wsNode);
    expect(out).toContain('WS');
  });
});

// ---------------------------------------------------------------------------
// Validation panel
// ---------------------------------------------------------------------------

describe('renderRequestDetail — validation panel', () => {
  const out = renderRequestDetail(
    makeNode({
      validationStatus: 'fail',
      validationResult: {
        enabled: true,
        totalRules: 2,
        passedRules: 1,
        failedRules: 1,
        allPassed: false,
        executedAt: '2026-05-05T14:30:22Z',
        results: [
          {
            ruleId: 'r1',
            ruleName: 'Status is 200',
            category: 'status' as never,
            passed: true,
            message: 'Status 200 matches expected 200',
            expected: '200',
            actual: '200',
          },
          {
            ruleId: 'r2',
            ruleName: 'Response time < 100ms',
            category: 'performance' as never,
            passed: false,
            message: 'Response time 142ms exceeds 100ms',
            expected: '< 100ms',
            actual: '142ms',
          },
        ],
      },
    }),
  );

  it('renders the passing rule with wc-status--success', () => {
    expect(out).toContain('wc-status--success');
    expect(out).toContain('Status is 200');
  });

  it('renders the failing rule with wc-status--failed', () => {
    expect(out).toContain('wc-status--failed');
    expect(out).toContain('Response time &lt; 100ms');
  });

  it('renders expected and actual values', () => {
    expect(out).toContain('Expected:');
    expect(out).toContain('Actual:');
  });
});

describe('renderRequestDetail — no validation rules', () => {
  it('renders a placeholder when validationResult is undefined', () => {
    const out = renderRequestDetail(makeNode({ validationResult: undefined }));
    expect(out).toContain('No validation rules were applied');
  });

  it('renders a placeholder when validation is disabled', () => {
    const out = renderRequestDetail(
      makeNode({
        validationResult: {
          enabled: false,
          totalRules: 0,
          passedRules: 0,
          failedRules: 0,
          allPassed: true,
          executedAt: '',
          results: [],
        },
      }),
    );
    expect(out).toContain('No validation rules were applied');
  });
});

// ---------------------------------------------------------------------------
// Folder path breadcrumb
// ---------------------------------------------------------------------------

describe('renderRequestDetail — folder path', () => {
  it('renders folder path segments in the card header', () => {
    const out = renderRequestDetail(makeNode({ folderPath: ['Accounts', 'CRUD'] }));
    expect(out).toContain('Accounts');
    expect(out).toContain('CRUD');
  });

  it('does not render folder path element when folderPath is empty', () => {
    const out = renderRequestDetail(makeNode({ folderPath: [] }));
    expect(out).not.toContain('wc-folder-path');
  });
});

// ---------------------------------------------------------------------------
// XSS regression battery
// ---------------------------------------------------------------------------

describe('renderRequestDetail — XSS regression', () => {
  const PAYLOAD = '<script>alert(1)</script>';

  it('escapes XSS in node name', () => {
    const out = renderRequestDetail(makeNode({ name: PAYLOAD }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in node URL', () => {
    const out = renderRequestDetail(makeNode({ url: PAYLOAD }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in request header value', () => {
    const out = renderRequestDetail(
      makeNode({
        request: makeHttpRequest({
          header: [{ id: 'h1', key: 'X-Custom', value: PAYLOAD, disabled: false }],
        }),
      }),
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in response header value', () => {
    const out = renderRequestDetail(
      makeNode({ responseHeaders: { 'x-evil': PAYLOAD } }),
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in response body', () => {
    const out = renderRequestDetail(
      makeNode({
        responseHeaders: { 'content-type': 'text/plain' },
        responseBody: PAYLOAD,
      }),
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in error message', () => {
    const out = renderRequestDetail(
      makeNode({ runStatus: 'failed', error: PAYLOAD }),
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in validation rule message', () => {
    const out = renderRequestDetail(
      makeNode({
        validationResult: {
          enabled: true,
          totalRules: 1,
          passedRules: 0,
          failedRules: 1,
          allPassed: false,
          executedAt: '',
          results: [
            {
              ruleId: 'r1',
              ruleName: PAYLOAD,
              category: 'status' as never,
              passed: false,
              message: PAYLOAD,
            },
          ],
        },
      }),
    );
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });

  it('escapes XSS in folder path', () => {
    const out = renderRequestDetail(makeNode({ folderPath: [PAYLOAD] }));
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toContain('<script>alert');
  });
});
