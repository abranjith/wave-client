import axios from 'axios';
import * as https from 'https';

import { ok, err, Result } from '@wave-client/core';
import { getGlobalSettings } from './BaseStorageService';
import type {
    ConnectionStatus,
    SseEvent,
    SseConnectionConfig,
    SseConnectionHandle,
    Unsubscribe,
} from '@wave-client/core';
import type { Auth, AuthResult, AuthRequestConfig, EnvVarsMap } from './auth/types';
import { AuthType } from './auth/types';
import { AuthServiceFactory } from './auth/AuthServiceFactory';
import { storeService } from './StoreService';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of concurrent SSE connections this service will manage.
 *
 * Connections beyond this limit are rejected before any network I/O to prevent
 * resource exhaustion. The limit applies globally across all callers sharing
 * the same `SseService` instance.
 */
const MAX_CONNECTIONS = 10;

// ── Auth service factory injectable ─────────────────────────────────────────

/** Minimal auth service interface required by SseService. */
interface ISseAuthService {
    applyAuth(config: AuthRequestConfig, auth: Auth, envVars: EnvVarsMap): Promise<AuthResult>;
}

/** Minimal factory interface required by SseService. */
interface ISseAuthServiceFactory {
    getService(type: AuthType): ISseAuthService | null;
}

/** Factory used to resolve auth headers before the SSE request. */
let sseAuthServiceFactory: ISseAuthServiceFactory | null = AuthServiceFactory;

/**
 * Override the auth service factory used by `SseService`.
 *
 * Primarily intended for testing. Pass `null` to disable auth header resolution.
 *
 * @param factory - The factory instance (or `null` to disable).
 */
export function setSseAuthServiceFactory(
    factory: ISseAuthServiceFactory | null,
): void {
    sseAuthServiceFactory = factory;
}

// ── Internal types  ───────────────────────────────────────────────────────────

/**
 * Internal tracking record for a single open SSE stream.
 * Not exported — consumers interact only through `SseConnectionHandle`.
 */
interface ActiveSseConnection {
    /** AbortController used to cancel the axios streaming request on disconnect. */
    abortController: AbortController;
    /** The original configuration used to open this connection. */
    config: SseConnectionConfig;
    /** Current lifecycle status cached for immediate-callback on new listeners. */
    status: ConnectionStatus;
    /** Unix epoch ms when the connection received the initial HTTP response. */
    connectedAt?: number;
    /** Most recently received SSE `id:` field value (not acted upon — stored only). */
    lastEventId?: string;
    /** Server-suggested retry interval in ms from `retry:` field (stored but not used — manual reconnect only). */
    retryMs?: number;
    /** Listeners for incoming parsed SSE events. */
    eventListeners: Set<(event: SseEvent) => void>;
    /** Listeners for status transitions. */
    statusListeners: Set<(status: ConnectionStatus) => void>;
    /** Listeners for connection or stream errors. */
    errorListeners: Set<(error: string) => void>;
    /** Listeners for initial HTTP response headers (fires once on connect). */
    headerListeners: Set<(headers: Record<string, string>) => void>;
}

// ── SSE frame parser  ─────────────────────────────────────────────────────────

/**
 * Stateful, incremental SSE wire-protocol parser.
 *
 * Implements the event stream parsing algorithm from the HTML Living Standard:
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
 *
 * ### Key behaviours
 * - Buffers incomplete lines across chunk boundaries (streams do not guarantee
 *   line-aligned delivery from `axios`).
 * - Handles both `\n` and `\r\n` line endings.
 * - Per spec: only the **first** leading space after the colon is stripped from
 *   field values (e.g., `data: hello` → `'hello'`, `data:  two` → `' two'`).
 * - Multi-line `data:` fields are concatenated with `\n`.
 * - An event is dispatched only when a **blank line** is encountered AND the
 *   accumulated data buffer is non-empty. Events without data are silently
 *   dropped per spec.
 * - `retry:` is only honoured when its value consists solely of ASCII digits.
 * - `id:` fields containing a NULL character (`\0`) are silently ignored.
 * - Comment lines (starting with `:`) are silently ignored.
 */
class SseFrameParser {
    /** Accumulates characters that have not yet been terminated by a newline. */
    private _lineBuffer = '';
    /** Pending SSE event type field (resets after each dispatch). */
    private _eventName = '';
    /** Pending SSE data field accumulator (resets after each dispatch). */
    private _dataBuffer = '';
    /** Pending SSE event ID field (resets after each dispatch). */
    private _eventId: string | undefined;
    /** Callback invoked each time a complete event is parsed. */
    private readonly _onEvent: (eventName: string, data: string, eventId?: string) => void;
    /** Callback invoked each time a valid `retry:` field is parsed. */
    private readonly _onRetry: (ms: number) => void;

    constructor(
        onEvent: (eventName: string, data: string, eventId?: string) => void,
        onRetry: (ms: number) => void,
    ) {
        this._onEvent = onEvent;
        this._onRetry = onRetry;
    }

    /**
     * Feed a raw UTF-8 chunk from the axios stream.
     *
     * May trigger zero or more event dispatches depending on how many complete
     * SSE events are contained in the chunk. Partial lines are buffered
     * internally and completed on subsequent calls.
     *
     * @param chunk - Raw text chunk from the stream.
     */
    processChunk(chunk: string): void {
        // Prepend any incomplete line from a previous chunk
        const input = this._lineBuffer + chunk;
        // Split on \n — handles both \n and \r\n (the \r will remain at the end
        // of each segment and is stripped when we process the field)
        const parts = input.split('\n');

        // The last element may be an incomplete line — buffer it for next call
        this._lineBuffer = parts.pop() ?? '';

        for (const rawLine of parts) {
            // Strip a trailing \r (from \r\n line endings)
            const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            this._processLine(line);
        }
    }

    /**
     * Flush any remaining buffered data.
     *
     * Called when the stream ends. If the line buffer contains a non-empty
     * `data:` segment from a server that omitted the final blank line, the
     * pending event is dispatched rather than discarded.
     */
    flush(): void {
        if (this._lineBuffer) {
            const line = this._lineBuffer.endsWith('\r')
                ? this._lineBuffer.slice(0, -1)
                : this._lineBuffer;
            this._processLine(line);
            this._lineBuffer = '';
        }
        // Dispatch any pending event accumulated so far
        this._dispatchIfReady();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Process a single, complete SSE line.
     *
     * Blank lines trigger event dispatch; field lines update the parser state.
     */
    private _processLine(line: string): void {
        if (line === '') {
            // Blank line → dispatch accumulated event (if any data)
            // Skip if no data to avoid unnecessary state resets from consecutive empty lines
            if (this._dataBuffer !== '') {
                this._dispatchIfReady();
            }
            return;
        }

        if (line.startsWith(':')) {
            // Comment line — ignore per SSE spec
            return;
        }

        // Locate the field / value separator
        const colonIdx = line.indexOf(':');

        let field: string;
        let value: string;

        if (colonIdx === -1) {
            // Line with no colon → field name only, value is empty string
            field = line;
            value = '';
        } else {
            field = line.slice(0, colonIdx);
            // Per spec: strip exactly one leading space from the value (if present)
            const rawValue = line.slice(colonIdx + 1);
            value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
        }

        switch (field) {
            case 'event':
                this._eventName = value;
                break;

            case 'data':
                // Multi-line data: concatenate with \n separator
                this._dataBuffer = this._dataBuffer === ''
                    ? value
                    : `${this._dataBuffer}\n${value}`;
                break;

            case 'id':
                // Per spec: ignore if value contains a NULL character
                if (!value.includes('\0')) {
                    this._eventId = value;
                }
                break;

            case 'retry':
                // Only apply if value is all ASCII digits
                if (/^\d+$/.test(value)) {
                    this._onRetry(parseInt(value, 10));
                }
                break;

            default:
                // Unknown field — ignore per SSE spec
                break;
        }
    }

    /**
     * Dispatch the accumulated event if the data buffer is non-empty, then
     * reset the per-event parser state.
     *
     * Per spec: events with no data (empty `_dataBuffer`) are silently dropped.
     */
    private _dispatchIfReady(): void {
        if (this._dataBuffer === '') {
            // No data accumulated — reset event name and id but do not dispatch
            this._eventName = '';
            this._eventId = undefined;
            return;
        }

        const eventName = this._eventName === '' ? 'message' : this._eventName;
        this._onEvent(eventName, this._dataBuffer, this._eventId);

        // Reset per-event state
        this._eventName = '';
        this._dataBuffer = '';
        this._eventId = undefined;
    }
}

// ── Service class  ────────────────────────────────────────────────────────────

/**
 * Manages the full lifecycle of Server-Sent Events connections within the
 * Node.js runtime (VS Code extension host or `packages/server`).
 *
 * ### Why not use the browser `EventSource` API?
 * - `EventSource` does not support custom request headers or POST bodies.
 * - `EventSource` does not support authentication headers.
 * - This service runs server-side (Node.js), so the browser API is unavailable.
 * - Using `axios` with `responseType: 'stream'` gives access to the raw Readable
 *   stream, enabling incremental SSE frame parsing with full header and auth control.
 *
 * ### Responsibilities
 * - Open SSE streams with custom headers, query params, request body (POST-based
 *   SSE), auth, and TLS/proxy settings.
 * - Parse the SSE wire protocol incrementally using {@link SseFrameParser}.
 * - Route parsed events and status transitions to caller-supplied callbacks via
 *   an event-driven {@link SseConnectionHandle}.
 * - Close connections cleanly via `AbortController`.
 *
 * ### Usage
 * ```ts
 * const handle = await sseService.connect({
 *   id: crypto.randomUUID(),
 *   method: 'GET',
 *   url: 'https://example.com/events',
 *   headers: { 'X-Api-Key': 'secret' },
 * });
 * if (!handle) return; // invalid URL or limit reached
 *
 * const unsub = handle.onEvent((ev) => console.log(ev.eventName, ev.data));
 * // later…
 * await sseService.disconnect(handle.connectionId);
 * unsub();
 * ```
 *
 * ### Security
 * - Only `http:` and `https:` URL schemes are accepted. All other schemes are
 *   rejected before any auth resolution or network I/O.
 * - Auth tokens are resolved to headers but **never** logged.
 * - TLS settings are sourced from `storeService.getHttpsAgentForUrl()`.
 * - The {@link MAX_CONNECTIONS} limit prevents resource exhaustion.
 * - The SSE parser does not use `eval()` or execute any code from event payloads.
 *
 * ### Auth support
 * Bearer / API key / Basic auth are applied as request headers.
 * Digest auth is not applicable to SSE streaming; it is skipped with a
 * `console.warn`.
 */
export class SseService {
    /** Live SSE connections keyed by their caller-assigned connection ID. */
    private readonly _connections = new Map<string, ActiveSseConnection>();

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Open an SSE connection and return an event-driven handle.
     *
     * Returns `null` (not a `Result`) for pre-flight validation failures (invalid
     * URL scheme, connection limit reached) because no handle exists yet — the
     * caller is expected to null-check before using the handle.
     *
     * The method is async because auth headers may need to be resolved before
     * the HTTP request is sent. The connection is opened asynchronously after
     * the handle is returned — `onStatusChange` will fire `'connecting'` after
     * `connect()` resolves, then `'connected'` once the HTTP response arrives.
     *
     * ### Default headers
     * The service always sets:
     * - `Accept: text/event-stream` — standard SSE content negotiation.
     * - `Cache-Control: no-cache` — prevents intermediary caches from buffering the stream.
     *
     * User-supplied headers with the same key names **override** these defaults
     * (user intent takes precedence).
     *
     * @param config - Connection parameters.
     * @returns A `SseConnectionHandle` or `null` if the connection cannot be opened.
     */
    async connect(config: SseConnectionConfig): Promise<SseConnectionHandle | null> {
        // 1. Validate URL scheme
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(config.url);
        } catch {
            console.warn(
                `[SseService] connect rejected — invalid URL: "${config.url}"`,
            );
            return null;
        }

        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            console.warn(
                `[SseService] connect rejected — URL scheme must be http: or https:, got "${parsedUrl.protocol}" (id=${config.id})`,
            );
            return null;
        }

        // 2. Enforce connection limit
        if (this._connections.size >= MAX_CONNECTIONS) {
            console.warn(
                `[SseService] connect rejected — maximum concurrent connections (${MAX_CONNECTIONS}) reached (id=${config.id})`,
            );
            return null;
        }

        console.info(
            `[SseService] connect attempt id=${config.id} method=${config.method} url=${parsedUrl.origin}${parsedUrl.pathname}`,
        );

        // 3. Build request headers: defaults first, then user-supplied (user wins on conflict)
        const defaultHeaders: Record<string, string> = {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
        };
        let requestHeaders: Record<string, string> = {
            ...defaultHeaders,
            ...(config.headers ?? {}),
        };

        // 4. Resolve auth headers (merged over existing headers)
        if (config.auth?.enabled) {
            requestHeaders = await this._resolveAuthHeaders(config.auth, requestHeaders, config);
        }

        // 5. Append query params to URL
        let targetUrl = config.url;
        if (config.params) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl = `${targetUrl}${separator}${config.params}`;
        }

        // 6. Retrieve HTTPS agent for https:// (respects cert settings and
        // ignoreCertificateValidation global toggle)
        let agent: https.Agent | undefined;
        if (parsedUrl.protocol === 'https:') {
            const settings = await getGlobalSettings();
            const customAgent = await storeService.getHttpsAgentForUrl(config.url);

            if (settings.ignoreCertificateValidation) {
                if (customAgent) {
                    agent = new https.Agent({
                        ...customAgent.options,
                        rejectUnauthorized: false,
                    });
                } else {
                    agent = new https.Agent({ rejectUnauthorized: false });
                }
            } else {
                agent = customAgent ?? undefined;
            }
        }

        // 7. Create AbortController for this connection
        const abortController = new AbortController();

        // 8. Create and store the internal connection record
        const conn: ActiveSseConnection = {
            abortController,
            config,
            status: 'connecting',
            eventListeners: new Set(),
            statusListeners: new Set(),
            errorListeners: new Set(),
            headerListeners: new Set(),
        };
        this._connections.set(config.id, conn);

        // 9. Emit 'connecting' status
        this._emitStatus(config.id, 'connecting');

        // 10. Fire the axios request asynchronously — do NOT await here so the
        //     handle is returned to the caller before the network round-trip completes.
        //     The caller registers their event listeners synchronously on the returned handle.
        void this._openStream(config.id, conn, targetUrl, requestHeaders, agent);

        // 11. Build and return a handle immediately (connection opens in the background)
        return this._buildHandle(config.id, conn);
    }

    /**
     * Disconnect an active SSE connection.
     *
     * Emits `'disconnecting'` status synchronously, then uses the
     * `AbortController` to cancel the underlying axios stream. The actual
     * `'disconnected'` or `'error'` status fires asynchronously once the stream
     * acknowledges the abort.
     *
     * @param connectionId - The ID of the connection to close.
     * @returns `ok(void)` on success, `err(message)` if the connection is not found.
     */
    async disconnect(connectionId: string): Promise<Result<void, string>> {
        const conn = this._connections.get(connectionId);
        if (!conn) {
            return err(`[SseService] disconnect failed — no connection with id=${connectionId}`);
        }

        conn.status = 'disconnecting';
        this._emitStatus(connectionId, 'disconnecting');
        conn.abortController.abort();

        return ok(undefined);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Open the axios streaming request and wire up stream event handlers.
     *
     * This method is called asynchronously from `connect()` — it must not throw
     * unhandled exceptions. All errors are routed to the error listeners.
     */
    private async _openStream(
        connectionId: string,
        conn: ActiveSseConnection,
        url: string,
        headers: Record<string, string>,
        agent: https.Agent | undefined,
    ): Promise<void> {
        try {
            const response = await axios({
                method: conn.config.method,
                url,
                headers,
                data: conn.config.body,
                responseType: 'stream',
                httpsAgent: agent,
                signal: conn.abortController.signal,
                // No timeout — SSE streams are long-lived
            });

            // Stream opened successfully
            conn.connectedAt = Date.now();
            this._emitStatus(connectionId, 'connected');

            // Capture and emit initial response headers
            const rawHeaders = response.headers as Record<string, string | string[] | undefined>;
            const responseHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(rawHeaders)) {
                if (typeof v === 'string') {
                    responseHeaders[k] = v;
                } else if (Array.isArray(v)) {
                    responseHeaders[k] = v.join(', ');
                }
            }
            this._emitHeaders(connectionId, responseHeaders);

            console.info(`[SseService] connected id=${connectionId}`);

            // Set up the SSE frame parser
            const parser = new SseFrameParser(
                (eventName: string, data: string, eventId?: string) => {
                    const sseEvent: SseEvent = {
                        id: crypto.randomUUID(),
                        eventName,
                        data,
                        eventId,
                        timestamp: Date.now(),
                    };
                    // Update lastEventId on the connection
                    const activeConn = this._connections.get(connectionId);
                    if (activeConn && eventId !== undefined) {
                        activeConn.lastEventId = eventId;
                    }
                    // Emit to all registered event listeners
                    const currentConn = this._connections.get(connectionId);
                    if (currentConn) {
                        for (const cb of currentConn.eventListeners) {
                            cb(sseEvent);
                        }
                    }
                },
                (ms: number) => {
                    const activeConn = this._connections.get(connectionId);
                    if (activeConn) {
                        activeConn.retryMs = ms;
                    }
                },
            );

            // Pipe the readable stream through the parser
             
            const stream = response.data as NodeJS.ReadableStream;

            stream.on('data', (chunk: Buffer | string) => {
                parser.processChunk(
                    typeof chunk === 'string' ? chunk : chunk.toString('utf8'),
                );
            });

            stream.on('end', () => {
                parser.flush();
                this._emitStatus(connectionId, 'disconnected');
                this._removeConnection(connectionId);
                console.info(`[SseService] disconnected id=${connectionId}`);
            });

            stream.on('error', (streamErr: Error) => {
                // Ignore abort errors — those come from intentional disconnect()
                const isAbort =
                    streamErr.name === 'AbortError' ||
                    (streamErr as NodeJS.ErrnoException).code === 'ERR_CANCELED';

                if (isAbort) {
                    this._emitStatus(connectionId, 'disconnected');
                } else {
                    const errorMsg = streamErr.message ?? String(streamErr);
                    console.warn(`[SseService] stream error id=${connectionId} msg=${errorMsg}`);
                    for (const cb of (this._connections.get(connectionId)?.errorListeners ?? [])) {
                        cb(errorMsg);
                    }
                    this._emitStatus(connectionId, 'error');
                }
                this._removeConnection(connectionId);
            });

        } catch (e: unknown) {
            // axios threw (network error, non-2xx response, abort, etc.)
            const isAbort =
                axios.isCancel(e) ||
                (e instanceof Error && (e.name === 'AbortError' || e.name === 'CanceledError'));

            if (isAbort) {
                this._emitStatus(connectionId, 'disconnected');
            } else {
                const errorMsg = e instanceof Error ? e.message : String(e);
                console.warn(`[SseService] error id=${connectionId} msg=${errorMsg}`);
                for (const cb of (this._connections.get(connectionId)?.errorListeners ?? [])) {
                    cb(errorMsg);
                }
                this._emitStatus(connectionId, 'error');
            }
            this._removeConnection(connectionId);
        }
    }

    /**
     * Build an `SseConnectionHandle` closure over a connection ID.
     *
     * On registration of `onStatusChange`, if the connection is already in
     * a non-idle status, the callback is invoked immediately with the current
     * status so late subscribers always see the correct state.
     */
    private _buildHandle(
        connectionId: string,
        conn: ActiveSseConnection,
    ): SseConnectionHandle {
        return {
            connectionId,

            onEvent(cb: (event: SseEvent) => void): Unsubscribe {
                conn.eventListeners.add(cb);
                return () => { conn.eventListeners.delete(cb); };
            },

            onStatusChange(cb: (status: ConnectionStatus) => void): Unsubscribe {
                conn.statusListeners.add(cb);
                // Fire immediately if already in a known state
                if (
                    conn.status === 'connected' ||
                    conn.status === 'error' ||
                    conn.status === 'disconnected' ||
                    conn.status === 'connecting'
                ) {
                    cb(conn.status);
                }
                return () => { conn.statusListeners.delete(cb); };
            },

            onError(cb: (error: string) => void): Unsubscribe {
                conn.errorListeners.add(cb);
                return () => { conn.errorListeners.delete(cb); };
            },

            onHeaders(cb: (headers: Record<string, string>) => void): Unsubscribe {
                conn.headerListeners.add(cb);
                return () => { conn.headerListeners.delete(cb); };
            },
        };
    }

    /**
     * Resolve auth configuration to HTTP headers for use in the SSE request.
     *
     * Supported auth types: `API_KEY`, `BASIC`, `OAUTH2_REFRESH` (Bearer).
     * `DIGEST` auth is not applicable to SSE streams (Digest requires a
     * challenge-response exchange incompatible with long-lived streams) and is
     * skipped with a `console.warn`.
     *
     * @param auth - The auth configuration from the connection config.
     * @param baseHeaders - Existing headers to merge auth headers into.
     * @param config - The original connection config (for URL/method context).
     * @returns A new headers object with auth headers merged in.
     */
    private async _resolveAuthHeaders(
        auth: Auth,
        baseHeaders: Record<string, string>,
        config: SseConnectionConfig,
    ): Promise<Record<string, string>> {
        if (!sseAuthServiceFactory) {
            return baseHeaders;
        }

        // Digest auth is not applicable to SSE — skip with a warning
        if (auth.type === AuthType.DIGEST) {
            console.warn(
                `[SseService] Auth type 'digest' is not supported for SSE connections — skipping auth.`,
            );
            return baseHeaders;
        }

        const service = sseAuthServiceFactory.getService(auth.type);
        if (!service) {
            console.warn(
                `[SseService] No auth service found for type "${auth.type}" — skipping auth.`,
            );
            return baseHeaders;
        }

        try {
            const result = await service.applyAuth(
                {
                    method: config.method,
                    url: config.url,
                    headers: baseHeaders,
                },
                auth,
                {},
            );

            if (!result.isOk) {
                console.warn(
                    `[SseService] Auth resolution failed: ${result.error} — proceeding without auth headers.`,
                );
                return baseHeaders;
            }

            const authHeaders = result.value.headers ?? {};
            return { ...baseHeaders, ...authHeaders };
        } catch (e: unknown) {
            console.warn(
                `[SseService] Auth resolution threw: ${String(e)} — proceeding without auth headers.`,
            );
            return baseHeaders;
        }
    }

    /**
     * Emit a status change to all registered listeners for the given connection.
     */
    private _emitStatus(connectionId: string, status: ConnectionStatus): void {
        const conn = this._connections.get(connectionId);
        if (!conn) { return; }
        conn.status = status;
        for (const cb of conn.statusListeners) {
            cb(status);
        }
    }

    /**
     * Emit initial response headers to all registered listeners for the given connection.
     */
    private _emitHeaders(connectionId: string, headers: Record<string, string>): void {
        const conn = this._connections.get(connectionId);
        if (!conn) { return; }
        for (const cb of conn.headerListeners) {
            cb(headers);
        }
    }

    /**
     * Remove a connection from the tracking map and log its end.
     *
     * @param connectionId - The connection ID to remove.
     */
    private _removeConnection(connectionId: string): void {
        this._connections.delete(connectionId);
    }

}

// ── Singleton export ──────────────────────────────────────────────────────────

/**
 * Module-level singleton `SseService` instance.
 *
 * Shared by the VS Code extension handler and the server package so that both
 * consumers track SSE connections through the same service instance.
 */
export const sseService = new SseService();
