/**
 * Tests for FEAT-001 — Protocol Types & Core Data Model
 *
 * Covers:
 * - Type guard functions: isHttpRequest, isWsRequest, isSseRequest, getRequestProtocol
 * - Backward compatibility: requests without a `protocol` field → HTTP
 * - CollectionItem accepts AnyCollectionRequest (via type assignment checks)
 * - Serialization round-trip: all three request types survive JSON.parse(JSON.stringify(...))
 */

import { describe, it, expect } from 'vitest';
import type {
  CollectionRequest,
  WsCollectionRequest,
  SseCollectionRequest,
  AnyCollectionRequest,
  CollectionItem,
  RequestProtocol,
} from '../../types/collection';
import {
  isHttpRequest,
  isWsRequest,
  isSseRequest,
  getRequestProtocol,
} from '../../utils/requestTypeGuards';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A legacy HTTP request without a protocol field (backward-compat) */
const legacyHttpRequest: CollectionRequest = {
  id: 'req-legacy',
  name: 'Legacy GET /users',
  method: 'GET',
  url: 'https://api.example.com/users',
};

/** An explicit HTTP request with protocol: 'http' */
const explicitHttpRequest: CollectionRequest = {
  id: 'req-http',
  name: 'Explicit HTTP POST',
  protocol: 'http',
  method: 'POST',
  url: { raw: 'https://api.example.com/items', host: ['api', 'example', 'com'], path: ['items'] },
  header: [{ id: 'h1', key: 'Content-Type', value: 'application/json', disabled: false }],
  body: { mode: 'raw', raw: '{"name":"widget"}' },
};

/** A WebSocket request */
const wsRequest: WsCollectionRequest = {
  id: 'req-ws',
  name: 'WS Chat',
  protocol: 'ws',
  url: 'wss://ws.example.com/chat',
  header: [{ id: 'h2', key: 'Authorization', value: 'Bearer token123', disabled: false }],
  query: [{ id: 'q1', key: 'room', value: 'general', disabled: false }],
};

/** An SSE request (GET-based) */
const sseGetRequest: SseCollectionRequest = {
  id: 'req-sse-get',
  name: 'SSE Event Stream',
  protocol: 'sse',
  method: 'GET',
  url: 'https://api.example.com/events',
};

/** An SSE request (POST-based with body) */
const ssePostRequest: SseCollectionRequest = {
  id: 'req-sse-post',
  name: 'SSE Subscribe',
  protocol: 'sse',
  method: 'POST',
  url: 'https://api.example.com/subscribe',
  body: { mode: 'raw', raw: '{"topic":"news"}', options: { raw: { language: 'json' } } },
};

// ---------------------------------------------------------------------------
// isHttpRequest
// ---------------------------------------------------------------------------

describe('isHttpRequest()', () => {
  it('returns true for a legacy request without protocol field', () => {
    expect(isHttpRequest(legacyHttpRequest)).toBe(true);
  });

  it('returns true for an explicit HTTP request (protocol: "http")', () => {
    expect(isHttpRequest(explicitHttpRequest)).toBe(true);
  });

  it('returns false for a WebSocket request', () => {
    expect(isHttpRequest(wsRequest)).toBe(false);
  });

  it('returns false for an SSE GET request', () => {
    expect(isHttpRequest(sseGetRequest)).toBe(false);
  });

  it('returns false for an SSE POST request', () => {
    expect(isHttpRequest(ssePostRequest)).toBe(false);
  });

  it('narrows the type to CollectionRequest in a type-checked branch', () => {
    const req: AnyCollectionRequest = explicitHttpRequest;
    if (isHttpRequest(req)) {
      // TypeScript should allow access to `method` (HTTP-specific field)
      expect(req.method).toBe('POST');
    } else {
      throw new Error('Expected isHttpRequest to return true');
    }
  });
});

// ---------------------------------------------------------------------------
// isWsRequest
// ---------------------------------------------------------------------------

describe('isWsRequest()', () => {
  it('returns true for a WebSocket request', () => {
    expect(isWsRequest(wsRequest)).toBe(true);
  });

  it('returns false for a legacy HTTP request', () => {
    expect(isWsRequest(legacyHttpRequest)).toBe(false);
  });

  it('returns false for an explicit HTTP request', () => {
    expect(isWsRequest(explicitHttpRequest)).toBe(false);
  });

  it('returns false for an SSE request', () => {
    expect(isWsRequest(sseGetRequest)).toBe(false);
  });

  it('narrows the type to WsCollectionRequest in a type-checked branch', () => {
    const req: AnyCollectionRequest = wsRequest;
    if (isWsRequest(req)) {
      // TypeScript should allow access to ws-specific url
      expect(req.url).toBe('wss://ws.example.com/chat');
    } else {
      throw new Error('Expected isWsRequest to return true');
    }
  });
});

// ---------------------------------------------------------------------------
// isSseRequest
// ---------------------------------------------------------------------------

describe('isSseRequest()', () => {
  it('returns true for a GET-based SSE request', () => {
    expect(isSseRequest(sseGetRequest)).toBe(true);
  });

  it('returns true for a POST-based SSE request', () => {
    expect(isSseRequest(ssePostRequest)).toBe(true);
  });

  it('returns false for a legacy HTTP request', () => {
    expect(isSseRequest(legacyHttpRequest)).toBe(false);
  });

  it('returns false for an explicit HTTP request', () => {
    expect(isSseRequest(explicitHttpRequest)).toBe(false);
  });

  it('returns false for a WebSocket request', () => {
    expect(isSseRequest(wsRequest)).toBe(false);
  });

  it('narrows the type to SseCollectionRequest in a type-checked branch', () => {
    const req: AnyCollectionRequest = ssePostRequest;
    if (isSseRequest(req)) {
      expect(req.method).toBe('POST');
    } else {
      throw new Error('Expected isSseRequest to return true');
    }
  });
});

// ---------------------------------------------------------------------------
// getRequestProtocol
// ---------------------------------------------------------------------------

describe('getRequestProtocol()', () => {
  it('returns "http" for a legacy request without protocol field', () => {
    expect(getRequestProtocol(legacyHttpRequest)).toBe<RequestProtocol>('http');
  });

  it('returns "http" for an explicit HTTP request', () => {
    expect(getRequestProtocol(explicitHttpRequest)).toBe<RequestProtocol>('http');
  });

  it('returns "ws" for a WebSocket request', () => {
    expect(getRequestProtocol(wsRequest)).toBe<RequestProtocol>('ws');
  });

  it('returns "sse" for an SSE GET request', () => {
    expect(getRequestProtocol(sseGetRequest)).toBe<RequestProtocol>('sse');
  });

  it('returns "sse" for an SSE POST request', () => {
    expect(getRequestProtocol(ssePostRequest)).toBe<RequestProtocol>('sse');
  });

  it('never returns undefined', () => {
    const allRequests: AnyCollectionRequest[] = [
      legacyHttpRequest,
      explicitHttpRequest,
      wsRequest,
      sseGetRequest,
      ssePostRequest,
    ];
    for (const req of allRequests) {
      expect(getRequestProtocol(req)).toBeDefined();
    }
  });

  it('returns a value that is one of the three valid protocols', () => {
    const validProtocols: RequestProtocol[] = ['http', 'ws', 'sse'];
    const allRequests: AnyCollectionRequest[] = [
      legacyHttpRequest,
      explicitHttpRequest,
      wsRequest,
      sseGetRequest,
      ssePostRequest,
    ];
    for (const req of allRequests) {
      expect(validProtocols).toContain(getRequestProtocol(req));
    }
  });
});

// ---------------------------------------------------------------------------
// Serialization round-trip
// ---------------------------------------------------------------------------

describe('JSON serialization round-trip', () => {
  it('preserves a legacy HTTP request through JSON round-trip', () => {
    const original = legacyHttpRequest;
    const roundTripped = JSON.parse(JSON.stringify(original)) as CollectionRequest;
    expect(roundTripped.id).toBe(original.id);
    expect(roundTripped.method).toBe(original.method);
    // protocol should remain absent
    expect(roundTripped.protocol).toBeUndefined();
    // Guard should still treat it as HTTP
    expect(isHttpRequest(roundTripped)).toBe(true);
  });

  it('preserves an explicit HTTP request through JSON round-trip', () => {
    const original = explicitHttpRequest;
    const roundTripped = JSON.parse(JSON.stringify(original)) as CollectionRequest;
    expect(roundTripped.protocol).toBe('http');
    expect(isHttpRequest(roundTripped)).toBe(true);
  });

  it('preserves a WS request through JSON round-trip', () => {
    const original = wsRequest;
    const roundTripped = JSON.parse(JSON.stringify(original)) as WsCollectionRequest;
    expect(roundTripped.protocol).toBe('ws');
    expect(isWsRequest(roundTripped)).toBe(true);
    expect(roundTripped.header?.[0].key).toBe('Authorization');
  });

  it('preserves an SSE GET request through JSON round-trip', () => {
    const original = sseGetRequest;
    const roundTripped = JSON.parse(JSON.stringify(original)) as SseCollectionRequest;
    expect(roundTripped.protocol).toBe('sse');
    expect(roundTripped.method).toBe('GET');
    expect(isSseRequest(roundTripped)).toBe(true);
  });

  it('preserves an SSE POST request with body through JSON round-trip', () => {
    const original = ssePostRequest;
    const roundTripped = JSON.parse(JSON.stringify(original)) as SseCollectionRequest;
    expect(roundTripped.protocol).toBe('sse');
    expect(roundTripped.method).toBe('POST');
    expect(roundTripped.body).toBeDefined();
    expect(isSseRequest(roundTripped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CollectionItem accepts AnyCollectionRequest
// ---------------------------------------------------------------------------

describe('CollectionItem with AnyCollectionRequest', () => {
  it('accepts an HTTP request as the request field', () => {
    const item: CollectionItem = {
      id: 'item-1',
      name: 'HTTP Item',
      request: legacyHttpRequest,
    };
    expect(item.request).toBeDefined();
    if (item.request) {
      expect(isHttpRequest(item.request)).toBe(true);
    }
  });

  it('accepts a WS request as the request field', () => {
    const item: CollectionItem = {
      id: 'item-2',
      name: 'WS Item',
      request: wsRequest,
    };
    expect(item.request).toBeDefined();
    if (item.request) {
      expect(isWsRequest(item.request)).toBe(true);
    }
  });

  it('accepts an SSE request as the request field', () => {
    const item: CollectionItem = {
      id: 'item-3',
      name: 'SSE Item',
      request: ssePostRequest,
    };
    expect(item.request).toBeDefined();
    if (item.request) {
      expect(isSseRequest(item.request)).toBe(true);
    }
  });

  it('can hold mixed-protocol requests in a collection tree', () => {
    const collection: CollectionItem[] = [
      { id: 'item-http', name: 'REST', request: explicitHttpRequest },
      { id: 'item-ws', name: 'WebSocket', request: wsRequest },
      { id: 'item-sse', name: 'SSE', request: sseGetRequest },
      {
        id: 'folder-1',
        name: 'Folder',
        item: [
          { id: 'item-nested', name: 'Nested SSE', request: ssePostRequest },
        ],
      },
    ];

    const protocols = collection
      .filter(i => i.request)
      .map(i => getRequestProtocol(i.request!));

    expect(protocols).toEqual(['http', 'ws', 'sse']);
  });
});

// ---------------------------------------------------------------------------
// Backward-compatibility: exhaustive guard coverage
// ---------------------------------------------------------------------------

describe('Backward compatibility — legacy collections without protocol field', () => {
  it('loads a batch of legacy requests and treats all as HTTP', () => {
    // Simulates an old collection file loaded from disk (no protocol field)
    const rawLegacyBatch = [
      { id: '1', name: 'GET Users', method: 'GET', url: '/users' },
      { id: '2', name: 'POST Login', method: 'POST', url: '/login', body: { mode: 'raw', raw: '{}' } },
      { id: '3', name: 'DELETE Item', method: 'DELETE', url: '/items/1' },
    ] as CollectionRequest[];

    for (const req of rawLegacyBatch) {
      expect(isHttpRequest(req)).toBe(true);
      expect(isWsRequest(req)).toBe(false);
      expect(isSseRequest(req)).toBe(false);
      expect(getRequestProtocol(req)).toBe('http');
    }
  });

  it('does not mutate legacy requests when reading protocol', () => {
    const req = { id: 'x', name: 'Old', method: 'GET', url: '/ping' } as CollectionRequest;
    getRequestProtocol(req);
    // protocol field must not have been added
    expect('protocol' in req).toBe(false);
  });
});
