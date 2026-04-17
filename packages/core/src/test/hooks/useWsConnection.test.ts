/**
 * Unit tests for useWsConnection (FEAT-006 / TASK-005)
 *
 * Verifies the complete WebSocket connection lifecycle:
 *   - connect() delegates to adapter.realtime.connectWebSocket with the right config
 *   - handle callbacks (onStatusChange, onMessage, onError, onHeaders) are registered
 *     and propagate updates to the Zustand store
 *   - disconnect() calls disconnectWebSocket and clears the handle
 *   - sendMessage() delegates to the adapter when connected, is a no-op otherwise
 *   - Guard conditions: missing realtime adapter, invalid URL scheme
 *   - Unmount cleanup: all unsubscribe functions are called
 *
 * Architecture notes:
 *   - renderHook from @testing-library/react wraps the hook in AdapterProvider.
 *   - A controllable WsConnectionHandle lets tests inject status/message/error/header
 *     events synchronously inside act().
 *   - The Zustand store is reset before each test to prevent state bleed.
 *   - `loadRequestIntoNewTab` is the recommended way to seed an active WS tab.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import { useWsConnection } from '../../hooks/useWsConnection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { WsConnectionHandle, ConnectionStatus, WsMessage } from '../../types/realtime';
import { createEmptyTab } from '../../types/tab';
import type { WsCollectionRequest } from '../../types/collection';

// ============================================================================
// Test fixtures
// ============================================================================

/** Minimal WsCollectionRequest with a valid wss:// URL. */
const mkWs = (overrides: Partial<WsCollectionRequest> = {}): WsCollectionRequest => ({
    id: 'ws-req-1',
    name: 'WS Request',
    protocol: 'ws',
    url: 'wss://echo.example.com/chat',
    header: [],
    query: [],
    ...overrides,
});

// ============================================================================
// Controllable WsConnectionHandle
// ============================================================================

/**
 * Creates a controllable WsConnectionHandle whose event callbacks can be
 * triggered synchronously in tests.
 */
function createControllableHandle(connectionId = 'conn-1') {
    const messageCbs = new Set<(msg: WsMessage) => void>();
    const statusCbs = new Set<(status: ConnectionStatus) => void>();
    const errorCbs  = new Set<(error: string) => void>();
    const headerCbs = new Set<(headers: Record<string, string>) => void>();

    const handle: WsConnectionHandle = {
        connectionId,
        onMessage(cb)      { messageCbs.add(cb); return () => messageCbs.delete(cb); },
        onStatusChange(cb) { statusCbs.add(cb);  return () => statusCbs.delete(cb);  },
        onError(cb)        { errorCbs.add(cb);   return () => errorCbs.delete(cb);   },
        onHeaders(cb)      { headerCbs.add(cb);  return () => headerCbs.delete(cb);  },
    };

    return {
        handle,
        pushMessage: (msg: WsMessage) =>
            messageCbs.forEach((cb) => cb(msg)),
        pushStatus: (status: ConnectionStatus) =>
            statusCbs.forEach((cb) => cb(status)),
        pushError: (error: string) =>
            errorCbs.forEach((cb) => cb(error)),
        pushHeaders: (headers: Record<string, string>) =>
            headerCbs.forEach((cb) => cb(headers)),
    };
}

// ============================================================================
// Suite setup
// ============================================================================

describe('useWsConnection', () => {
    /**
     * Helper: render the hook with a fresh mock adapter and an overridden
     * realtime.connectWebSocket that returns the controllable handle.
     */
    function setup(wsRequest: WsCollectionRequest = mkWs()) {
        // Seed the store with a loaded WS tab so getCollectionRequest() returns `wsRequest`.
        useAppStateStore.getState().loadRequestIntoNewTab(wsRequest);
        const activeTabId = useAppStateStore.getState().activeTabId;

        const { adapter, notificationLog } = createMockAdapter();
        const ctrl = createControllableHandle('conn-abc');
        vi.spyOn(adapter.realtime!, 'connectWebSocket').mockReturnValue(ctrl.handle);
        vi.spyOn(adapter.realtime!, 'disconnectWebSocket');
        vi.spyOn(adapter.realtime!, 'sendWebSocketMessage');

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            React.createElement(AdapterProvider, { adapter, children })
        );

        const { result, unmount } = renderHook(() => useWsConnection(), { wrapper });

        return { result, unmount, ctrl, adapter, notificationLog, activeTabId };
    }

    beforeEach(() => {
        // Reset Zustand to a clean initial state before each test.
        const emptyTab = createEmptyTab();
        useAppStateStore.setState({
            tabs: [emptyTab],
            activeTabId: emptyTab.id,
            realtimeState: {},
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ──────────────────────────────────────────────────────────────────────
    // 01. connect() — calls adapter with correct config
    // ──────────────────────────────────────────────────────────────────────

    it('01 — connect() calls adapter.realtime.connectWebSocket with url from active tab', () => {
        const { result, adapter } = setup(mkWs({ url: 'wss://echo.example.com/chat' }));

        act(() => { result.current.connect(); });

        expect(adapter.realtime!.connectWebSocket).toHaveBeenCalledOnce();
        const config = vi.mocked(adapter.realtime!.connectWebSocket).mock.calls[0][0];
        expect(config.url).toBe('wss://echo.example.com/chat');
    });

    it('02 — connect() passes enabled headers as a flat object in the config', () => {
        const ws = mkWs({
            url: 'wss://example.com',
            header: [
                { id: 'h1', key: 'Authorization', value: 'Bearer token', disabled: false },
                { id: 'h2', key: 'X-Custom',      value: 'yes',          disabled: false },
                { id: 'h3', key: 'X-Disabled',    value: 'no',           disabled: true  },
            ],
        });
        const { result, adapter } = setup(ws);

        act(() => { result.current.connect(); });

        const config = vi.mocked(adapter.realtime!.connectWebSocket).mock.calls[0][0];
        expect(config.headers).toEqual({ Authorization: 'Bearer token', 'X-Custom': 'yes' });
        expect(config.headers).not.toHaveProperty('X-Disabled');
    });

    it('03 — connect() serialises enabled query params into the config', () => {
        const ws = mkWs({
            url: 'wss://example.com',
            query: [
                { id: 'p1', key: 'token', value: 'abc', disabled: false },
                { id: 'p2', key: 'debug', value: '1',   disabled: true  },
            ],
        });
        const { result, adapter } = setup(ws);

        act(() => { result.current.connect(); });

        const config = vi.mocked(adapter.realtime!.connectWebSocket).mock.calls[0][0];
        expect(config.params).toBe('token=abc');
    });

    // ──────────────────────────────────────────────────────────────────────
    // 04. connect() — callback registration and store updates
    // ──────────────────────────────────────────────────────────────────────

    it('04 — onStatusChange callback updates realtimeState.status in the store', () => {
        const { result, ctrl, activeTabId } = setup();

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushStatus('connected'); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.status).toBe('connected');
    });

    it('04b — connect() immediately sets realtimeState.status to "connecting"', () => {
        const { result, activeTabId } = setup();

        act(() => { result.current.connect(); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.status).toBe('connecting');
    });

    it('05 — onMessage callback appends to realtimeState.wsMessages', () => {
        const { result, ctrl, activeTabId } = setup();
        const msg = { id: 'm1', direction: 'received' as const, content: 'hello', timestamp: 1000, size: 5 };

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushMessage(msg); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.wsMessages).toHaveLength(1);
        expect(state?.wsMessages[0].content).toBe('hello');
    });

    it('06 — onError callback sets realtimeState error / status and notifies user', () => {
        const { result, ctrl, activeTabId, notificationLog } = setup();

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushError('connection refused'); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.status).toBe('error');
        expect(state?.error).toBe('connection refused');
        expect(notificationLog.some((n) => n.type === 'error' && n.message.includes('connection refused'))).toBe(true);
    });

    it('07 — onHeaders callback updates realtimeState.responseHeaders', () => {
        const { result, ctrl, activeTabId } = setup();

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushHeaders({ 'Sec-WebSocket-Protocol': 'chat' }); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.responseHeaders).toEqual({ 'Sec-WebSocket-Protocol': 'chat' });
    });

    // ──────────────────────────────────────────────────────────────────────
    // 08. disconnect()
    // ──────────────────────────────────────────────────────────────────────

    it('08 — disconnect() calls adapter.realtime.disconnectWebSocket with the connection id', async () => {
        const { result, adapter } = setup();

        act(() => { result.current.connect(); });
        await act(async () => { await result.current.disconnect(); });

        expect(adapter.realtime!.disconnectWebSocket).toHaveBeenCalledWith('conn-abc');
    });

    it('09 — disconnect() before connect() does not call the adapter', async () => {
        const { result, adapter } = setup();

        await act(async () => { await result.current.disconnect(); });

        expect(adapter.realtime!.disconnectWebSocket).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────────────────────────────
    // 10. sendMessage()
    // ──────────────────────────────────────────────────────────────────────

    it('10 — sendMessage() when connected calls sendWebSocketMessage', async () => {
        const { result, ctrl, adapter } = setup();

        act(() => { result.current.connect(); });
        // Simulate the adapter reporting connected status.
        act(() => { ctrl.pushStatus('connected'); });

        await act(async () => { await result.current.sendMessage('ping'); });

        expect(adapter.realtime!.sendWebSocketMessage).toHaveBeenCalledWith('conn-abc', 'ping');
    });

    it('11 — sendMessage() before connect() does not call the adapter', async () => {
        const { result, adapter } = setup();

        await act(async () => { await result.current.sendMessage('ping'); });

        expect(adapter.realtime!.sendWebSocketMessage).not.toHaveBeenCalled();
    });

    it('12 — sendMessage() when status is not "connected" does not call the adapter', async () => {
        const { result, ctrl, adapter } = setup();

        act(() => { result.current.connect(); });
        // Leave status as 'connecting' (never push 'connected').
        act(() => { ctrl.pushStatus('connecting'); });

        await act(async () => { await result.current.sendMessage('ping'); });

        expect(adapter.realtime!.sendWebSocketMessage).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────────────────────────────
    // 13. Guard — missing realtime adapter
    // ──────────────────────────────────────────────────────────────────────

    it('13 — connect() shows an error notification when adapter.realtime is undefined', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const { adapter, notificationLog } = createMockAdapter();
        // Remove the realtime adapter to simulate FEAT-008 not yet wired.
        adapter.realtime = undefined;

        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(AdapterProvider, { adapter, children });
        const { result } = renderHook(() => useWsConnection(), { wrapper });

        act(() => { result.current.connect(); });

        expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        expect(adapter.realtime).toBeUndefined();
    });

    // ──────────────────────────────────────────────────────────────────────
    // 14. Guard — invalid URL scheme
    // ──────────────────────────────────────────────────────────────────────

    it('14 — connect() shows an error notification when URL is not ws:// or wss://', () => {
        const { result, adapter, notificationLog } = setup(
            mkWs({ url: 'https://not-a-ws-url.example.com' })
        );

        act(() => { result.current.connect(); });

        expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        expect(adapter.realtime!.connectWebSocket).not.toHaveBeenCalled();
    });

    it('15 — connect() does not call adapter when active tab is not a WS request', () => {
        // beforeEach already seeded an empty HTTP tab — no extra setup needed.
        const { adapter, notificationLog } = createMockAdapter();
        vi.spyOn(adapter.realtime!, 'connectWebSocket');
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(AdapterProvider, { adapter, children });
        const { result } = renderHook(() => useWsConnection(), { wrapper });

        act(() => { result.current.connect(); });

        expect(adapter.realtime!.connectWebSocket).not.toHaveBeenCalled();
        // Non-WS mismatch is a silent guard (no error notification).
        expect(notificationLog.filter((n) => n.type === 'error')).toHaveLength(0);
    });

    // ──────────────────────────────────────────────────────────────────────
    // 16. Cleanup on unmount
    // ──────────────────────────────────────────────────────────────────────

    it('16 — unsubscribe functions are called on unmount', () => {
        const unsub = vi.fn();
        const { result, unmount, adapter } = setup();

        // Override the handle's on* methods to return a spied unsubscribe.
        const handle = createControllableHandle('conn-unsub').handle;
        handle.onMessage      = vi.fn(() => unsub);
        handle.onStatusChange = vi.fn(() => unsub);
        handle.onError        = vi.fn(() => unsub);
        handle.onHeaders      = vi.fn(() => unsub);
        vi.mocked(adapter.realtime!.connectWebSocket).mockReturnValue(handle);

        act(() => { result.current.connect(); });
        unmount();

        expect(unsub).toHaveBeenCalled();
    });
});
