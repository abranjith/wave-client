/**
 * Realtime domain types for WebSocket and SSE per-tab runtime state.
 *
 * All entries in `RealtimeStateByTabId` are ephemeral — they are held only in
 * memory during the session and must never be persisted to collections or storage.
 * Only WS and SSE tabs ever create a `RealtimeTabState` entry; HTTP tabs do not.
 */

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Connection lifecycle status for a WS or SSE tab.
 *
 * - `idle`          — No connection attempt has been made.
 * - `connecting`    — Adapter is establishing the connection.
 * - `connected`     — Connection is open and data may flow.
 * - `disconnecting` — Adapter is performing a graceful close.
 * - `disconnected`  — Connection was closed cleanly by either side.
 * - `error`         — Connection failed or was lost with an error.
 */
export type ConnectionStatus =
    | 'idle'
    | 'connecting'
    | 'connected'
    | 'disconnecting'
    | 'disconnected'
    | 'error';

// ── Message / Event models  ───────────────────────────────────────────────────

/**
 * A single message entry in the WS timeline for a tab.
 */
export interface WsMessage {
    /** Stable, unique message row identifier. */
    id: string;
    /** Whether the message was sent by the client or received from the server. */
    direction: 'sent' | 'received';
    /** Text payload (binary payloads are not supported in the MVP). */
    content: string;
    /** Epoch milliseconds when the message was sent or received. */
    timestamp: number;
    /** Payload size in bytes. */
    size: number;
}

/**
 * A single event entry in the SSE timeline for a tab.
 */
export interface SseEvent {
    /** Stable, unique event row identifier. */
    id: string;
    /** SSE event type; defaults to `'message'` when the server omits the `event:` field. */
    eventName: string;
    /** Event payload text (the `data:` field). */
    data: string;
    /** Optional SSE `id:` field value provided by the server. */
    eventId?: string;
    /** Epoch milliseconds when the event was received. */
    timestamp: number;
}

// ── Per-tab state  ────────────────────────────────────────────────────────────

/**
 * Runtime connection and timeline state for a single WS or SSE tab.
 *
 * **Invariants:**
 * - `wsMessages` is used only when `protocol === 'ws'`; it stays empty for SSE tabs.
 * - `sseEvents` is used only when `protocol === 'sse'`; it stays empty for WS tabs.
 * - `selectedSseEventName` is meaningful only for SSE tabs and defaults to `'all'`.
 * - This object must not contain auth credentials, tokens, or resolved secret headers.
 */
export interface RealtimeTabState {
    /** Foreign key matching `TabData.id`. */
    tabId: string;
    /** Realtime protocol discriminant — always `'ws'` or `'sse'`. */
    protocol: 'ws' | 'sse';
    /** Adapter-supplied connection handle, or `null` when not connected. */
    connectionId: string | null;
    /** Current lifecycle status. */
    status: ConnectionStatus;
    /** Response / handshake headers received after a successful connection. */
    responseHeaders: Record<string, string> | null;
    /** Ordered WS message timeline (populated only for WS tabs). */
    wsMessages: WsMessage[];
    /** Ordered SSE event timeline (populated only for SSE tabs). */
    sseEvents: SseEvent[];
    /** Active SSE event-name filter. `'all'` means no filter is applied. */
    selectedSseEventName: string;
    /** Error message from the most recent connection or stream failure, if any. */
    error?: string;
    /** Epoch milliseconds of the most recent successful connect, if any. */
    connectedAt?: number;
}

/**
 * Top-level Zustand state field: a lookup from tab ID to its realtime state.
 *
 * Only WS/SSE tabs have entries here. HTTP tabs must not appear as keys.
 */
export type RealtimeStateByTabId = Record<string, RealtimeTabState>;

// ── Connection config & handle types  ────────────────────────────────────────

/**
 * Cleanup function returned by every `on*` listener registration on a handle.
 *
 * Calling the returned function removes the specific listener so it will no
 * longer receive callbacks. Callers are responsible for calling it when the
 * listener is no longer needed (e.g., on component unmount or tab close) to
 * prevent memory leaks.
 *
 * @example
 * ```ts
 * const unsub = handle.onMessage((msg) => console.log(msg));
 * // later…
 * unsub(); // listener removed
 * ```
 */
export type Unsubscribe = () => void;

/**
 * Parameters passed to {@link WebSocketService.connect} to establish a
 * WebSocket connection.
 *
 * The `id` is caller-assigned (typically `crypto.randomUUID()` at the adapter
 * layer) and must be unique across all active connections.  
 * The `url` must use the `ws:` or `wss:` scheme — all other schemes are
 * rejected before any network I/O.  
 * When `params` is set it must already be a serialised query string (e.g.,
 * `"token=abc&room=lobby"`) — the service appends it to the URL with a `?`
 * or `&` separator.  
 * When `auth` is set the service resolves it to HTTP headers via the
 * registered `AuthServiceFactory` before opening the upgrade request.
 */
export interface WsConnectionConfig {
    /** Caller-assigned unique connection ID. */
    readonly id: string;
    /** WebSocket URL — must start with `ws://` or `wss://`. */
    readonly url: string;
    /** Additional upgrade-request headers (merged before auth resolution). */
    readonly headers?: Record<string, string>;
    /** Pre-serialised query string appended to the URL. */
    readonly params?: string;
    /** Optional auth configuration resolved to headers before connecting. */
    readonly auth?: import('./auth').Auth;
}

/**
 * Event-driven handle returned by {@link WebSocketService.connect}.
 *
 * Each `on*` method registers a typed callback and returns an
 * {@link Unsubscribe} function. Callers must retain and invoke the returned
 * function to de-register listeners when they are no longer needed.
 *
 * Lifecycle notes:
 * - `onStatusChange` fires `'connecting'` synchronously after `connect()` is
 *   called (before the upgrade completes), then `'connected'` when the server
 *   accepts the upgrade, and finally `'disconnected'` or `'error'` when the
 *   connection closes.
 * - `onHeaders` fires **once** with the server's upgrade-response headers
 *   immediately after `'connected'` is emitted.
 * - `onMessage` fires for every incoming text frame while connected.
 * - `onError` fires when the connection fails or is lost with an error payload.
 */
export interface WsConnectionHandle {
    /** Matches the `id` from the originating {@link WsConnectionConfig}. */
    readonly connectionId: string;
    /**
     * Register a callback that fires for every incoming text-frame message.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onMessage(cb: (msg: WsMessage) => void): Unsubscribe;
    /**
     * Register a callback that fires on each {@link ConnectionStatus} transition.
     * If the connection is already in `'connected'` or `'error'` state when
     * this is called, the callback is invoked immediately with the current status.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onStatusChange(cb: (status: ConnectionStatus) => void): Unsubscribe;
    /**
     * Register a callback that fires when a connection or stream error occurs.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onError(cb: (error: string) => void): Unsubscribe;
    /**
     * Register a callback that fires once with the server's upgrade-response headers.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onHeaders(cb: (headers: Record<string, string>) => void): Unsubscribe;
}

/**
 * Parameters passed to {@link SseService.connect} to establish a
 * Server-Sent Events connection.
 *
 * The `id` is caller-assigned (typically `crypto.randomUUID()` at the adapter
 * layer) and must be unique across all active connections.
 * The `url` must use the `http:` or `https:` scheme — all other schemes are
 * rejected before any network I/O.
 * The `method` is the HTTP method for the opening request — `GET` for standard
 * SSE endpoints, `POST` for endpoints that require a request body.
 * When `params` is set it must already be a serialised query string (e.g.,
 * `"token=abc&channel=updates"`) — the service appends it to the URL with a
 * `?` or `&` separator.
 * When `body` is set it is serialised as the request body — used with
 * POST-based SSE endpoints that expect a JSON or form payload.
 * When `auth` is set the service resolves it to HTTP headers via the
 * registered `AuthServiceFactory` before opening the request.
 */
export interface SseConnectionConfig {
    /** Caller-assigned unique connection ID. */
    readonly id: string;
    /** HTTP method for the SSE opening request — typically `'GET'` or `'POST'`. */
    readonly method: string;
    /** SSE endpoint URL — must start with `http://` or `https://`. */
    readonly url: string;
    /** Additional request headers (merged before auth resolution). */
    readonly headers?: Record<string, string>;
    /** Pre-serialised query string appended to the URL. */
    readonly params?: string;
    /** Optional request body for POST-based SSE endpoints. */
    readonly body?: unknown;
    /** Optional auth configuration resolved to headers before connecting. */
    readonly auth?: import('./auth').Auth;
}

/**
 * Event-driven handle returned by {@link SseService.connect}.
 *
 * Each `on*` method registers a typed callback and returns an
 * {@link Unsubscribe} function. Callers must retain and invoke the returned
 * function to de-register listeners when they are no longer needed.
 *
 * Lifecycle notes:
 * - `onStatusChange` fires `'connecting'` synchronously after `connect()` is
 *   called (before the HTTP response is received), then `'connected'` when the
 *   server responds with a 200, and finally `'disconnected'` or `'error'` when
 *   the stream ends or fails.
 * - `onHeaders` fires **once** with the initial HTTP response headers
 *   immediately after `'connected'` is emitted.
 * - `onEvent` fires for every fully parsed SSE event — not for raw stream
 *   chunks. The parser handles multi-line data, named events, and the
 *   `event:` / `data:` / `id:` SSE wire format before invoking this callback.
 * - `onError` fires when the connection fails or the stream is lost with an
 *   error payload.
 */
export interface SseConnectionHandle {
    /** Matches the `id` from the originating {@link SseConnectionConfig}. */
    readonly connectionId: string;
    /**
     * Register a callback that fires for every parsed SSE event.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onEvent(cb: (event: SseEvent) => void): Unsubscribe;
    /**
     * Register a callback that fires on each {@link ConnectionStatus} transition.
     * If the connection is already in `'connected'` or `'error'` state when
     * this is called, the callback is invoked immediately with the current status.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onStatusChange(cb: (status: ConnectionStatus) => void): Unsubscribe;
    /**
     * Register a callback that fires when a connection or stream error occurs.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onError(cb: (error: string) => void): Unsubscribe;
    /**
     * Register a callback that fires once with the initial HTTP response headers.
     * @returns An {@link Unsubscribe} function that removes this listener.
     */
    onHeaders(cb: (headers: Record<string, string>) => void): Unsubscribe;
}

// ── Factory  ──────────────────────────────────────────────────────────────────

/**
 * Returns a clean idle `RealtimeTabState` for the given tab and protocol.
 * Use this when initializing or resetting a tab's realtime state.
 */
export function createIdleRealtimeTabState(
    tabId: string,
    protocol: 'ws' | 'sse',
): RealtimeTabState {
    return {
        tabId,
        protocol,
        connectionId: null,
        status: 'idle',
        responseHeaders: null,
        wsMessages: [],
        sseEvents: [],
        selectedSseEventName: 'all',
    };
}
