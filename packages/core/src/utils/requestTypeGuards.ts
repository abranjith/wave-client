/**
 * Type guard utilities for discriminating between HTTP, WebSocket, and SSE
 * collection request types.
 *
 * These guards should be used wherever code needs to branch on protocol — for
 * example, to conditionally render protocol-specific UI, to route a request to
 * the correct service, or to validate fields before persistence.
 *
 * Backward-compatibility rule: an `AnyCollectionRequest` with no `protocol`
 * field (legacy HTTP request) must pass `isHttpRequest()` and return `'http'`
 * from `getRequestProtocol()`. These guards never throw; they always return a
 * safe value.
 */

import type {
  AnyCollectionRequest,
  CollectionRequest,
  WsCollectionRequest,
  SseCollectionRequest,
  RequestProtocol,
} from '../types/collection';

/**
 * Returns `true` when `req` is an HTTP request.
 *
 * A request is considered HTTP if its `protocol` field is explicitly `'http'`
 * **or** if the `protocol` field is absent (backward-compatibility with
 * collections saved before the protocol discriminant was introduced).
 */
export function isHttpRequest(req: AnyCollectionRequest): req is CollectionRequest {
  return req.protocol === 'http' || req.protocol === undefined;
}

/**
 * Returns `true` when `req` is a WebSocket request (`protocol === 'ws'`).
 */
export function isWsRequest(req: AnyCollectionRequest): req is WsCollectionRequest {
  return req.protocol === 'ws';
}

/**
 * Returns `true` when `req` is a Server-Sent Events request (`protocol === 'sse'`).
 */
export function isSseRequest(req: AnyCollectionRequest): req is SseCollectionRequest {
  return req.protocol === 'sse';
}

/**
 * Returns the effective `RequestProtocol` for any request.
 *
 * Legacy requests without a `protocol` field are treated as `'http'`.
 */
export function getRequestProtocol(req: AnyCollectionRequest): RequestProtocol {
  return req.protocol ?? 'http';
}
