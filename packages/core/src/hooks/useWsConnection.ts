/**
 * useWsConnection Hook
 *
 * Platform-agnostic hook that manages the full WebSocket connection lifecycle
 * for the currently active tab. Delegates all network I/O to the platform's
 * `realtime` adapter, keeping the core package free of any platform-specific code.
 *
 * @returns An object with three stable callbacks:
 *  - `connect`      — Establishes a WebSocket connection for the active tab.
 *  - `disconnect`   — Gracefully closes the current connection.
 *  - `sendMessage`  — Sends a text frame over the active connection.
 *
 * @example
 * ```tsx
 * const { connect, disconnect, sendMessage } = useWsConnection();
 *
 * return (
 *   <ConnectionControls
 *     tabId={activeTabId}
 *     onConnect={connect}
 *     onDisconnect={disconnect}
 *   />
 * );
 * ```
 */

import { useCallback, useEffect, useRef } from 'react';
import useAppStateStore from './store/useAppStateStore';
import { useAdapter, useNotificationAdapter } from './useAdapter';
import { isWsRequest } from '../utils/requestTypeGuards';
import { getRawUrl } from '../types/collection';
import type { WsConnectionHandle } from '../types/realtime';

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns stable `connect`, `disconnect`, and `sendMessage` callbacks wired to
 * the active tab's WebSocket state via the platform realtime adapter.
 *
 * Guards against:
 * - Missing `adapter.realtime` (FEAT-008/009 not yet wired) — shows error notification.
 * - Non-WS active tab — returns early without showing an error.
 * - Invalid URL scheme (not `ws://` / `wss://`) — shows error notification.
 * - Sending when not connected — silently ignored.
 *
 * All Zustand state mutations (status, messages, headers, errors) happen inside
 * the handle callbacks. The hook itself never blocks the React render cycle.
 */
export function useWsConnection() {
    const adapter = useAdapter();
    const notification = useNotificationAdapter();

    // Active tab selectors
    const activeTabId = useAppStateStore((s) => s.activeTabId);
    const getCollectionRequest = useAppStateStore((s) => s.getCollectionRequest);
    const getRealtimeState = useAppStateStore((s) => s.getRealtimeState);

    // Realtime store mutations
    const resetRealtimeTabState = useAppStateStore((s) => s.resetRealtimeTabState);
    const setRealtimeStatus = useAppStateStore((s) => s.setRealtimeStatus);
    const setRealtimeConnectionId = useAppStateStore((s) => s.setRealtimeConnectionId);
    const setRealtimeResponseHeaders = useAppStateStore((s) => s.setRealtimeResponseHeaders);
    const setRealtimeError = useAppStateStore((s) => s.setRealtimeError);
    const appendWsMessage = useAppStateStore((s) => s.appendWsMessage);

    /**
     * The active WsConnectionHandle, or `null` when not connected.
     * Kept in a ref so it never triggers re-renders on its own.
     */
    const handleRef = useRef<WsConnectionHandle | null>(null);

    /**
     * Accumulated unsubscribe functions from handle's `on*` registrations.
     * All of them are invoked on disconnect or unmount.
     */
    const unsubsRef = useRef<(() => void)[]>([]);

    // ── Cleanup on unmount ───────────────────────────────────────────────────

    useEffect(() => {
        return () => {
            // Flush all listener registrations to prevent memory leaks.
            unsubsRef.current.forEach((fn) => fn());
            unsubsRef.current = [];
        };
    }, []);

    // ── connect ──────────────────────────────────────────────────────────────

    const connect = useCallback(() => {
        // Guard: adapter.realtime must be present (FEAT-008/009 not yet wired).
        if (!adapter.realtime) {
            notification.showNotification('error', 'WebSocket adapter not available');
            return;
        }

        // Guard: active tab must be a WS request.
        const request = getCollectionRequest();
        if (!isWsRequest(request)) {
            return;
        }

        // Guard: URL must use the ws:// or wss:// scheme.
        const url = getRawUrl(request.url);
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
            notification.showNotification(
                'error',
                'Invalid WebSocket URL. URL must start with ws:// or wss://'
            );
            return;
        }

        // If a previous handle still exists, detach listeners and attempt a
        // best-effort disconnect before creating a new connection.
        if (unsubsRef.current.length > 0) {
            unsubsRef.current.forEach((fn) => fn());
            unsubsRef.current = [];
        }
        if (handleRef.current) {
            void adapter.realtime.disconnectWebSocket(handleRef.current.connectionId);
            handleRef.current = null;
        }

        // Reset any stale messages/status from a previous connection.
        resetRealtimeTabState(activeTabId);
        // Reflect connecting state immediately so the UI can disable duplicate clicks.
        setRealtimeStatus(activeTabId, 'connecting');

        // Build connection config from the active WS request.
        const resolvedHeaders: Record<string, string> = {};
        if (request.header) {
            for (const h of request.header) {
                if (!h.disabled && h.key) {
                    resolvedHeaders[h.key] = h.value ?? '';
                }
            }
        }

        const config = {
            id: crypto.randomUUID(),
            url,
            headers: Object.keys(resolvedHeaders).length > 0 ? resolvedHeaders : undefined,
            params: request.query
                ? request.query
                      .filter((p) => !p.disabled && p.key)
                      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? '')}`)
                      .join('&') || undefined
                : undefined,
        };

        // Open the connection — synchronous handle return.
        const handle = adapter.realtime.connectWebSocket(config);
        handleRef.current = handle;
        setRealtimeConnectionId(activeTabId, handle.connectionId);

        // Register event callbacks and collect unsubscribe functions.
        unsubsRef.current = [
            handle.onStatusChange((status) => {
                setRealtimeStatus(activeTabId, status);
            }),
            handle.onHeaders((headers) => {
                setRealtimeResponseHeaders(activeTabId, headers);
            }),
            handle.onMessage((msg) => {
                appendWsMessage(activeTabId, msg);
            }),
            handle.onError((error) => {
                setRealtimeError(activeTabId, error);
                setRealtimeStatus(activeTabId, 'error');
                notification.showNotification('error', error);
            }),
        ];
    }, [
        adapter,
        activeTabId,
        getCollectionRequest,
        notification,
        resetRealtimeTabState,
        setRealtimeConnectionId,
        setRealtimeStatus,
        setRealtimeResponseHeaders,
        appendWsMessage,
        setRealtimeError,
    ]);

    // ── disconnect ───────────────────────────────────────────────────────────

    const disconnect = useCallback(async () => {
        const handle = handleRef.current;
        if (!handle || !adapter.realtime) {
            return;
        }

        setRealtimeStatus(activeTabId, 'disconnecting');

        const result = await adapter.realtime.disconnectWebSocket(handle.connectionId);

        if (!result.isOk) {
            notification.showNotification('error', result.error);
        }

        // Unsubscribe all handle listeners.
        unsubsRef.current.forEach((fn) => fn());
        unsubsRef.current = [];
        handleRef.current = null;
    }, [adapter, activeTabId, notification, setRealtimeStatus]);

    // ── sendMessage ──────────────────────────────────────────────────────────

    const sendMessage = useCallback(
        async (message: string) => {
            if (!adapter.realtime) {
                notification.showNotification('error', 'WebSocket adapter not available');
                return;
            }

            const realtimeState = getRealtimeState(activeTabId);
            const connectionId = handleRef.current?.connectionId ?? realtimeState?.connectionId;
            if (!connectionId) {
                notification.showNotification('error', 'WebSocket is not connected');
                return;
            }

            const result = await adapter.realtime.sendWebSocketMessage(
                connectionId,
                message
            );

            if (!result.isOk) {
                notification.showNotification('error', result.error);
                return;
            }

            // Reflect successful sends in the timeline immediately.
            appendWsMessage(activeTabId, {
                id: crypto.randomUUID(),
                direction: 'sent',
                content: message,
                size: new TextEncoder().encode(message).length,
                timestamp: Date.now(),
            });
        },
        [adapter, activeTabId, appendWsMessage, getRealtimeState, notification]
    );

    return { connect, disconnect, sendMessage };
}

export default useWsConnection;
