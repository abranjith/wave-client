import WebSocket from 'ws';
import * as https from 'https';
import type { IncomingMessage } from 'http';

import { ok, err, Result } from '@wave-client/core';
import { getGlobalSettings } from './BaseStorageService';
import type {
    ConnectionStatus,
    WsMessage,
    WsConnectionConfig,
    WsConnectionHandle,
    Unsubscribe,
} from '@wave-client/core';
import type { Auth, AuthResult, AuthRequestConfig, EnvVarsMap } from './auth/types';
import { AuthType } from './auth/types';
import { AuthServiceFactory } from './auth/AuthServiceFactory';
import { storeService } from './StoreService';

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum number of concurrent WebSocket connections this service will manage.
 *
 * Connections beyond this limit are rejected before any network I/O to prevent
 * resource exhaustion. The limit applies globally across all callers sharing
 * the same `WebSocketService` instance.
 */
const MAX_CONNECTIONS = 10;

// ── Auth service factory injectable ─────────────────────────────────────────

/** Minimal auth service interface required by WebSocketService. */
interface IWsAuthService {
    applyAuth(config: AuthRequestConfig, auth: Auth, envVars: EnvVarsMap): Promise<AuthResult>;
}

/** Minimal factory interface required by WebSocketService. */
interface IWsAuthServiceFactory {
    getService(type: AuthType): IWsAuthService | null;
}

/** Factory used to resolve auth headers before the upgrade request. */
let wsAuthServiceFactory: IWsAuthServiceFactory | null = AuthServiceFactory;

/**
 * Override the auth service factory used by `WebSocketService`.
 *
 * Primarily intended for testing. Pass `null` to disable auth header resolution.
 *
 * @param factory - The factory instance (or `null` to disable).
 */
export function setWsAuthServiceFactory(
    factory: IWsAuthServiceFactory | null,
): void {
    wsAuthServiceFactory = factory;
}

// ── Internal types  ───────────────────────────────────────────────────────────

/**
 * Internal tracking record for a single open WebSocket connection.
 * Not exported — consumers interact only through `WsConnectionHandle`.
 */
interface ActiveWsConnection {
    /** The underlying `ws` WebSocket instance. */
    ws: WebSocket;
    /** The original configuration used to open this connection. */
    config: WsConnectionConfig;
    /** Current lifecycle status cached for immediate-callback on new listeners. */
    status: ConnectionStatus;
    /** Unix epoch ms when the connection transitioned to 'connected'. */
    connectedAt?: number;
    /** Cached upgrade-response headers from the handshake (if available). */
    responseHeaders: Record<string, string>;
    /** Listeners for incoming text-frame messages. */
    messageListeners: Set<(msg: WsMessage) => void>;
    /** Listeners for status transitions. */
    statusListeners: Set<(status: ConnectionStatus) => void>;
    /** Listeners for connection or stream errors. */
    errorListeners: Set<(error: string) => void>;
    /** Listeners for upgrade-response headers (fires once on connect). */
    headerListeners: Set<(headers: Record<string, string>) => void>;
}

// ── Service class  ────────────────────────────────────────────────────────────

/**
 * Manages the full lifecycle of WebSocket connections within the Node.js
 * runtime (VS Code extension host or `packages/server`).
 *
 * ### Responsibilities
 * - Open connections with custom headers, query params, auth, and TLS/proxy settings.
 * - Route incoming messages and status transitions to caller-supplied callbacks via
 *   an event-driven `WsConnectionHandle`.
 * - Send text messages over an open connection.
 * - Close connections cleanly.
 *
 * ### Usage
 * ```ts
 * const handle = await webSocketService.connect({
 *   id: crypto.randomUUID(),
 *   url: 'wss://example.com/ws',
 *   headers: { 'X-Api-Key': 'secret' },
 * });
 * if (!handle) return; // invalid URL or limit reached
 *
 * const unsub = handle.onMessage((msg) => console.log(msg.content));
 * await webSocketService.sendMessage(handle.connectionId, 'hello');
 * await webSocketService.disconnect(handle.connectionId);
 * ```
 *
 * ### Security
 * - Only `ws:` and `wss:` URL schemes are accepted.  All other schemes are
 *   rejected before any auth resolution or network I/O.
 * - TLS settings are sourced from `storeService.getHttpsAgentForUrl()`.
 * - The {@link MAX_CONNECTIONS} limit prevents resource exhaustion.
 *
 * ### Auth support
 * Bearer / API key / Basic auth are applied as upgrade-request headers.
 * Digest and NTLM auth are not applicable to WebSocket upgrades; they are
 * skipped with a `console.warn`.
 */
export class WebSocketService {
    /** Live connections keyed by their caller-assigned connection ID. */
    private readonly _connections = new Map<string, ActiveWsConnection>();

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Open a WebSocket connection and return an event-driven handle.
     *
     * Returns `null` (not a `Result`) for pre-flight validation failures (invalid
     * URL scheme, connection limit reached) because no handle exists yet — the
     * caller is expected to null-check before using the handle.
     *
     * The method is async because auth headers may need to be resolved from an
     * external service before the WS upgrade request is sent.
     *
     * @param config - Connection parameters.
     * @returns A `WsConnectionHandle` or `null` if the connection cannot be opened.
     *
     * @remarks
     * **DEVIATION NOTE**: The plan's `IRealtimeAdapter.connectWebSocket()` signature
     * is synchronous. Making this method `async` changes the internal service API.
     * FEAT-008 must resolve this by eagerly awaiting the handle before registering
     * callbacks, or by adapting the adapter interface to accept `Promise<WsConnectionHandle>`.
     */
    async connect(config: WsConnectionConfig): Promise<WsConnectionHandle | null> {
        // 1. Validate URL scheme
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(config.url);
        } catch {
            console.warn(
                `[WebSocketService] connect rejected — invalid URL: "${config.url}"`,
            );
            return null;
        }

        if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
            console.warn(
                `[WebSocketService] connect rejected — URL scheme must be ws: or wss:, got "${parsedUrl.protocol}" (id=${config.id})`,
            );
            return null;
        }

        // 2. Enforce connection limit
        if (this._connections.size >= MAX_CONNECTIONS) {
            console.warn(
                `[WebSocketService] connect rejected — maximum concurrent connections (${MAX_CONNECTIONS}) reached (id=${config.id})`,
            );
            return null;
        }

        console.info(
            `[WebSocketService] connect attempt id=${config.id} url=${parsedUrl.origin}${parsedUrl.pathname}`,
        );

        // 3. Build upgrade-request headers (auth resolved here)
        let upgradeHeaders: Record<string, string> = { ...(config.headers ?? {}) };
        if (config.auth?.enabled) {
            upgradeHeaders = await this._resolveAuthHeaders(config.auth, upgradeHeaders);
        }

        // 4. Append query params to URL
        let targetUrl = config.url;
        if (config.params) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl = `${targetUrl}${separator}${config.params}`;
        }

        // 5. Retrieve HTTPS agent for wss:// (respects cert settings and
        // ignoreCertificateValidation global toggle)
        let agent: https.Agent | undefined;
        if (parsedUrl.protocol === 'wss:') {
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

        // 6. Create the ws.WebSocket instance
        const ws = new WebSocket(targetUrl, { headers: upgradeHeaders, agent });

        // 7. Create the internal connection record (status starts as connecting)
        const conn: ActiveWsConnection = {
            ws,
            config,
            status: 'connecting',
            responseHeaders: {},
            messageListeners: new Set(),
            statusListeners: new Set(),
            errorListeners: new Set(),
            headerListeners: new Set(),
        };
        this._connections.set(config.id, conn);

        // Only the first terminal socket event (error/close/unexpected-response)
        // should update state and remove the connection.
        let terminalHandled = false;
        const finalizeTerminal = (options: {
            status: ConnectionStatus;
            closeCode?: number;
            closeReason?: string;
            errorMessage?: string;
        }): void => {
            if (terminalHandled) {
                return;
            }
            terminalHandled = true;

            if (options.errorMessage) {
                for (const cb of conn.errorListeners) {
                    cb(options.errorMessage);
                }
                console.warn(`[WebSocketService] error id=${config.id} msg=${options.errorMessage}`);
            }

            this._emitStatus(config.id, options.status);
            this._removeConnection(config.id, options.closeCode, options.closeReason);
        };

        // 8. Wire ws event handlers

        // Capture upgrade-response headers from the official 'upgrade' event.
        // The ws library sets _req = null BEFORE emitting 'open' (in the internal
        // upgrade handler), so accessing _req?.res?.headers inside 'open' always
        // returns undefined. The 'upgrade' event fires just before that nullification
        // and provides the http.IncomingMessage with the full 101 response headers.
        let capturedResponseHeaders: Record<string, string> = {};
        ws.on('upgrade', (response: IncomingMessage) => {
            const normalized: Record<string, string> = {};
            for (const [k, v] of Object.entries(response.headers)) {
                if (typeof v === 'string') {
                    normalized[k] = v;
                } else if (Array.isArray(v)) {
                    normalized[k] = v.join(', ');
                }
            }
            capturedResponseHeaders = normalized;
        });

        ws.on('open', () => {
            conn.status = 'connected';
            conn.connectedAt = Date.now();
            conn.responseHeaders = capturedResponseHeaders;
            this._emitStatus(config.id, 'connected');
            this._emitHeaders(config.id, capturedResponseHeaders);

            console.info(`[WebSocketService] connected id=${config.id}`);
        });

        ws.on('message', (data: WebSocket.RawData) => {
            const text = data.toString('utf8');
            const msg: WsMessage = {
                id: crypto.randomUUID(),
                direction: 'received',
                content: text,
                size: Buffer.byteLength(text, 'utf8'),
                timestamp: Date.now(),
            };
            for (const cb of conn.messageListeners) {
                cb(msg);
            }
        });

        ws.on('close', (code: number, reasonBuffer?: Buffer) => {
            const reason = reasonBuffer?.toString('utf8') ?? '';

            if (code === 1000) {
                finalizeTerminal({
                    status: 'disconnected',
                    closeCode: code,
                    closeReason: reason,
                });
                return;
            }

            finalizeTerminal({
                status: 'error',
                closeCode: code,
                closeReason: reason,
                errorMessage: this._formatAbnormalCloseMessage(config.url, code, reason),
            });
        });

        ws.on('error', (error: Error) => {
            const errorMsg = this._formatErrorMessage(config.url, error);

            finalizeTerminal({
                status: 'error',
                errorMessage: errorMsg,
            });
        });

        ws.on('unexpected-response', (_request, response) => {
            const errorMsg = this._formatUnexpectedResponseMessage(config.url, response);

            finalizeTerminal({
                status: 'error',
                errorMessage: errorMsg,
            });
        });

        // 9. Build and return an event-driven handle
        return this._buildHandle(config.id, conn);
    }

    /**
     * Gracefully close an open WebSocket connection.
     *
     * Emits `'disconnecting'` status synchronously, then sends a close frame
     * (code 1000). The `'disconnected'` status fires asynchronously once the
     * server acknowledges the close.
     *
     * @param connectionId - The ID of the connection to close.
     * @returns `ok(void)` on success, `err(message)` if the connection is not found.
     */
    async disconnect(connectionId: string): Promise<Result<void, string>> {
        const conn = this._connections.get(connectionId);
        if (!conn) {
            return err(`[WebSocketService] disconnect failed — no connection with id=${connectionId}`);
        }

        conn.status = 'disconnecting';
        this._emitStatus(connectionId, 'disconnecting');
        conn.ws.close(1000, 'client disconnect');

        return ok(undefined);
    }

    /**
     * Send a text message over an open WebSocket connection.
     *
     * The sent message is also emitted to registered `onMessage` listeners with
     * `direction: 'sent'` so the UI can display it in the timeline immediately.
     *
     * @param connectionId - The ID of the connection.
     * @param message - The text payload to send.
     * @returns `ok(void)` on success, `err(message)` on failure.
     */
    async sendMessage(connectionId: string, message: string): Promise<Result<void, string>> {
        const conn = this._connections.get(connectionId);
        if (!conn) {
            return err(`[WebSocketService] sendMessage failed — no connection with id=${connectionId}`);
        }

        if (conn.ws.readyState !== WebSocket.OPEN) {
            return err(
                `[WebSocketService] sendMessage failed — connection id=${connectionId} is not OPEN (readyState=${conn.ws.readyState})`,
            );
        }

        // Echo the sent message to listeners so the UI timeline sees it immediately
        const msg: WsMessage = {
            id: crypto.randomUUID(),
            direction: 'sent',
            content: message,
            size: Buffer.byteLength(message, 'utf8'),
            timestamp: Date.now(),
        };
        for (const cb of conn.messageListeners) {
            cb(msg);
        }

        try {
            conn.ws.send(message);
        } catch (e: unknown) {
            return err(`[WebSocketService] sendMessage error id=${connectionId}: ${String(e)}`);
        }

        return ok(undefined);
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Build a `WsConnectionHandle` closure over a connection ID.
     *
     * On registration of `onStatusChange`, if the connection is already in
     * `'connected'` or `'error'` status the callback is invoked immediately
     * with the current status so late subscribers always see the correct state.
     */
    private _buildHandle(
        connectionId: string,
        conn: ActiveWsConnection,
    ): WsConnectionHandle {
        return {
            connectionId,

            onMessage(cb: (msg: WsMessage) => void): Unsubscribe {
                conn.messageListeners.add(cb);
                return () => { conn.messageListeners.delete(cb); };
            },

            onStatusChange(cb: (status: ConnectionStatus) => void): Unsubscribe {
                conn.statusListeners.add(cb);
                // Fire immediately if already in a terminal-ish state
                if (conn.status === 'connected' || conn.status === 'error' ||
                    conn.status === 'disconnected' || conn.status === 'connecting') {
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
                // If handshake headers already arrived before this listener was
                // registered, replay the latest snapshot immediately.
                if (conn.status === 'connected' && Object.keys(conn.responseHeaders).length > 0) {
                    cb(conn.responseHeaders);
                }
                return () => { conn.headerListeners.delete(cb); };
            },
        };
    }

    /**
     * Resolve auth configuration to HTTP headers for use in the WS upgrade request.
     *
     * Only `API_KEY`, `BASIC`, and `OAUTH2_REFRESH` (Bearer) auth types are supported.
     * `DIGEST` is not applicable to WebSocket upgrade requests and is skipped with a warning.
     *
     * @param auth - The auth configuration from the connection config.
     * @param baseHeaders - Existing headers to merge into.
     * @returns A new headers object with auth headers merged in.
     */
    private async _resolveAuthHeaders(
        auth: Auth,
        baseHeaders: Record<string, string>,
    ): Promise<Record<string, string>> {
        if (!wsAuthServiceFactory) {
            return baseHeaders;
        }

        // Digest auth is not applicable to WS upgrade — skip with a warning
        if (auth.type === AuthType.DIGEST) {
            console.warn(
                `[WebSocketService] Auth type 'digest' is not supported for WebSocket connections — skipping auth.`,
            );
            return baseHeaders;
        }

        const service = wsAuthServiceFactory.getService(auth.type);
        if (!service) {
            console.warn(
                `[WebSocketService] No auth service found for type "${auth.type}" — skipping auth.`,
            );
            return baseHeaders;
        }

        try {
            const result = await service.applyAuth(
                {
                    method: 'GET',
                    url: '',
                    headers: baseHeaders,
                },
                auth,
                {},
            );

            if (!result.isOk) {
                console.warn(
                    `[WebSocketService] Auth resolution failed: ${result.error} — proceeding without auth headers.`,
                );
                return baseHeaders;
            }

            const authHeaders = result.value.headers ?? {};
            return { ...baseHeaders, ...authHeaders };
        } catch (e: unknown) {
            console.warn(
                `[WebSocketService] Auth resolution threw: ${String(e)} — proceeding without auth headers.`,
            );
            return baseHeaders;
        }
    }

    /**
     * Emit a status change to all registered listeners for the given connection.
     */
    private _emitStatus(connectionId: string, status: ConnectionStatus): void {
        const conn = this._connections.get(connectionId);
        if (!conn) {
            return;
        }
        conn.status = status;
        for (const cb of conn.statusListeners) {
            cb(status);
        }
    }

    /**
     * Emit upgrade-response headers to all registered listeners for the given connection.
     */
    private _emitHeaders(connectionId: string, headers: Record<string, string>): void {
        const conn = this._connections.get(connectionId);
        if (!conn) {
            return;
        }
        for (const cb of conn.headerListeners) {
            cb(headers);
        }
    }

    /**
     * Remove a connection from the tracking map and log its end.
     *
     * @param connectionId - The connection ID to remove.
     * @param closeCode - Optional WS close code (for logging).
     */
    private _removeConnection(
        connectionId: string,
        closeCode?: number,
        closeReason?: string,
    ): void {
        const removed = this._connections.delete(connectionId);
        if (!removed) {
            return;
        }

        const reason = closeReason?.trim();

        console.info(
            `[WebSocketService] disconnected id=${connectionId}${closeCode !== undefined ? ` code=${closeCode}` : ''}${reason ? ` reason="${reason}"` : ''}`,
        );
    }

    /**
     * Builds a richer error message for low-level WebSocket errors.
     */
    private _formatErrorMessage(url: string, error: Error): string {
        const raw = error.message ?? String(error);

        if (
            /self-signed certificate|DEPTH_ZERO_SELF_SIGNED_CERT|unable to verify the first certificate|UNABLE_TO_VERIFY_LEAF_SIGNATURE/i.test(raw)
        ) {
            return `${raw} (TLS certificate is not trusted for ${url}. Import the server certificate or CA into a trusted store, or configure Wave Client certificate settings for this host.)`;
        }

        if (/socket hang up/i.test(raw) || /ECONNRESET/i.test(raw)) {
            return `${raw} (remote peer closed while connecting or immediately after connect: ${url})`;
        }

        if (/ECONNREFUSED/i.test(raw)) {
            return `${raw} (target endpoint is not accepting WebSocket connections: ${url})`;
        }

        return `${raw} (${url})`;
    }

    /**
     * Converts abnormal close frames into an actionable error message.
     */
    private _formatAbnormalCloseMessage(url: string, code: number, reason?: string): string {
        const trimmedReason = reason?.trim();
        const reasonSuffix = trimmedReason ? ` reason="${trimmedReason}"` : '';
        return `WebSocket closed abnormally (code=${code}${reasonSuffix}) for ${url}`;
    }

    /**
     * Builds an error message for non-upgrade HTTP responses during WS handshake.
     */
    private _formatUnexpectedResponseMessage(
        url: string,
        response: { statusCode?: number; statusMessage?: string },
    ): string {
        const code = response.statusCode ?? 'unknown';
        const status = response.statusMessage ? ` ${response.statusMessage}` : '';
        return `Unexpected handshake response ${code}${status} for ${url}. Verify the endpoint supports WebSocket upgrade.`;
    }

}

// ── Singleton export ──────────────────────────────────────────────────────────

/**
 * Module-level singleton `WebSocketService` instance.
 *
 * Shared by the VS Code extension handler and, eventually, the server package
 * so that both consumers track connections through the same service.
 */
export const webSocketService = new WebSocketService();
