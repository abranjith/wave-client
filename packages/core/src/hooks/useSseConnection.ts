/**
 * useSseConnection Hook
 *
 * Platform-agnostic hook that manages the full SSE connection lifecycle
 * for the currently active tab. Delegates all network I/O to the platform's
 * `realtime` adapter, keeping the core package free of any platform-specific code.
 *
 * @returns An object with two stable callbacks:
 *  - `connect`    — Establishes an SSE connection for the active tab.
 *  - `disconnect` — Gracefully closes the current connection.
 *
 * @example
 * ```tsx
 * const { connect, disconnect } = useSseConnection();
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
import { isSseRequest } from '../utils/requestTypeGuards';
import { getRawUrl } from '../types/collection';
import type { SseConnectionHandle } from '../types/realtime';

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns stable `connect` and `disconnect` callbacks wired to the active tab's
 * SSE state via the platform realtime adapter.
 *
 * Guards against:
 * - Missing `adapter.realtime` — shows error notification.
 * - Non-SSE active tab — returns early without showing an error.
 * - Invalid URL scheme (not `http://` / `https://`) — shows error notification.
 *
 * All Zustand state mutations (status, events, headers, errors) happen inside
 * the handle callbacks. The hook itself never blocks the React render cycle.
 */
export function useSseConnection() {
    const adapter = useAdapter();
    const notification = useNotificationAdapter();

    // Active tab selectors
    const activeTabId = useAppStateStore((s) => s.activeTabId);
    const getCollectionRequest = useAppStateStore((s) => s.getCollectionRequest);

    // Realtime store mutations
    const resetRealtimeTabState = useAppStateStore((s) => s.resetRealtimeTabState);
    const setRealtimeStatus = useAppStateStore((s) => s.setRealtimeStatus);
    const setRealtimeConnectionId = useAppStateStore((s) => s.setRealtimeConnectionId);
    const setRealtimeResponseHeaders = useAppStateStore((s) => s.setRealtimeResponseHeaders);
    const setRealtimeError = useAppStateStore((s) => s.setRealtimeError);
    const appendSseEvent = useAppStateStore((s) => s.appendSseEvent);

    /**
     * The active SseConnectionHandle, or `null` when not connected.
     * Kept in a ref so it never triggers re-renders on its own.
     */
    const handleRef = useRef<SseConnectionHandle | null>(null);

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
        // Guard: adapter.realtime must be present.
        if (!adapter.realtime) {
            notification.showNotification('error', 'SSE adapter not available');
            return;
        }

        // Guard: active tab must be an SSE request.
        const request = getCollectionRequest();
        if (!isSseRequest(request)) {
            return;
        }

        // Guard: URL must use the http:// or https:// scheme.
        const url = getRawUrl(request.url);
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            notification.showNotification(
                'error',
                'Invalid SSE URL. URL must start with http:// or https://'
            );
            return;
        }

        // Reset any stale events/status from a previous connection.
        resetRealtimeTabState(activeTabId);

        // Build connection config from the active SSE request.
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
            method: request.method ?? 'GET',
            url,
            headers: Object.keys(resolvedHeaders).length > 0 ? resolvedHeaders : undefined,
            params: request.query
                ? request.query
                      .filter((p) => !p.disabled && p.key)
                      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? '')}`)
                      .join('&') || undefined
                : undefined,
            body: request.body,
        };

        // Open the connection — synchronous handle return.
        const handle = adapter.realtime.connectSse(config);
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
            handle.onEvent((event) => {
                appendSseEvent(activeTabId, event);
            }),
            handle.onError((error) => {
                setRealtimeError(activeTabId, error);
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
        appendSseEvent,
        setRealtimeError,
    ]);

    // ── disconnect ───────────────────────────────────────────────────────────

    const disconnect = useCallback(async () => {
        const handle = handleRef.current;
        if (!handle || !adapter.realtime) {
            return;
        }

        setRealtimeStatus(activeTabId, 'disconnecting');

        const result = await adapter.realtime.disconnectSse(handle.connectionId);

        if (!result.isOk) {
            notification.showNotification('error', result.error);
        }

        // Unsubscribe all handle listeners.
        unsubsRef.current.forEach((fn) => fn());
        unsubsRef.current = [];
        handleRef.current = null;
    }, [adapter, activeTabId, notification, setRealtimeStatus]);

    return { connect, disconnect };
}

export default useSseConnection;
