/**
 * Unit tests for useSseConnection hook (FEAT-007 / TASK-002).
 *
 * Verifies the complete SSE connection lifecycle:
 *   - connect() delegates to adapter.realtime.connectSse with the right config
 *   - handle callbacks (onStatusChange, onEvent, onError, onHeaders) are registered
 *     and propagate updates to the Zustand store
 *   - disconnect() calls disconnectSse and clears the handle
 *   - Guard conditions: missing realtime adapter, non-SSE tab, invalid URL scheme
 *   - Unmount cleanup: all unsubscribe functions are called
 *
 * Architecture notes:
 *   - renderHook from @testing-library/react wraps the hook in AdapterProvider.
 *   - A controllable SseConnectionHandle lets tests inject status/event/error/header
 *     events synchronously inside act().
 *   - The Zustand store is reset before each test to prevent state bleed.
 *   - `loadRequestIntoNewTab` is the recommended way to seed an active SSE tab.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import { useSseConnection } from '../../hooks/useSseConnection';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import type { SseConnectionHandle, ConnectionStatus, SseEvent } from '../../types/realtime';
import { createEmptyTab } from '../../types/tab';
import type { SseCollectionRequest } from '../../types/collection';

// ============================================================================
// Test fixtures
// ============================================================================

/** Minimal SseCollectionRequest with a valid https:// URL. */
const mkSse = (overrides: Partial<SseCollectionRequest> = {}): SseCollectionRequest => ({
    id: 'sse-req-1',
    name: 'SSE Request',
    protocol: 'sse',
    method: 'GET',
    url: 'https://events.example.com/stream',
    header: [],
    query: [],
    ...overrides,
});

// ============================================================================
// Controllable SseConnectionHandle
// ============================================================================

/**
 * Creates a controllable SseConnectionHandle whose event callbacks can be
 * triggered synchronously in tests.
 */
function createControllableSseHandle(connectionId = 'sse-conn-1') {
    const eventCbs  = new Set<(event: SseEvent) => void>();
    const statusCbs = new Set<(status: ConnectionStatus) => void>();
    const errorCbs  = new Set<(error: string) => void>();
    const headerCbs = new Set<(headers: Record<string, string>) => void>();

    const handle: SseConnectionHandle = {
        connectionId,
        onEvent(cb)        { eventCbs.add(cb);   return () => eventCbs.delete(cb);   },
        onStatusChange(cb) { statusCbs.add(cb);  return () => statusCbs.delete(cb);  },
        onError(cb)        { errorCbs.add(cb);   return () => errorCbs.delete(cb);   },
        onHeaders(cb)      { headerCbs.add(cb);  return () => headerCbs.delete(cb);  },
    };

    return {
        handle,
        pushEvent: (event: SseEvent) =>
            eventCbs.forEach((cb) => cb(event)),
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

describe('useSseConnection', () => {
    /**
     * Helper: render the hook with a fresh mock adapter and an overridden
     * realtime.connectSse that returns the controllable handle.
     */
    function setup(sseRequest: SseCollectionRequest = mkSse()) {
        useAppStateStore.getState().loadRequestIntoNewTab(sseRequest);
        const activeTabId = useAppStateStore.getState().activeTabId;

        const { adapter, notificationLog } = createMockAdapter();
        const ctrl = createControllableSseHandle('sse-conn-abc');
        vi.spyOn(adapter.realtime!, 'connectSse').mockReturnValue(ctrl.handle);
        vi.spyOn(adapter.realtime!, 'disconnectSse');

        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(AdapterProvider, { adapter, children });

        const { result, unmount } = renderHook(() => useSseConnection(), { wrapper });

        return { result, unmount, ctrl, adapter, notificationLog, activeTabId };
    }

    beforeEach(() => {
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

    it('01 — connect() calls adapter.realtime.connectSse with URL from active tab', () => {
        const { result, adapter } = setup(mkSse({ url: 'https://events.example.com/stream' }));

        act(() => { result.current.connect(); });

        expect(adapter.realtime!.connectSse).toHaveBeenCalledOnce();
        const config = vi.mocked(adapter.realtime!.connectSse).mock.calls[0][0];
        expect(config.url).toBe('https://events.example.com/stream');
    });

    it('02 — connect() passes enabled headers as a flat object in the config', () => {
        const sse = mkSse({
            header: [
                { id: 'h1', key: 'Authorization', value: 'Bearer token', disabled: false },
                { id: 'h2', key: 'Accept',         value: 'text/event-stream', disabled: false },
                { id: 'h3', key: 'X-Disabled',    value: 'no', disabled: true },
            ],
        });
        const { result, adapter } = setup(sse);

        act(() => { result.current.connect(); });

        const config = vi.mocked(adapter.realtime!.connectSse).mock.calls[0][0];
        expect(config.headers).toEqual({ Authorization: 'Bearer token', Accept: 'text/event-stream' });
        expect(config.headers).not.toHaveProperty('X-Disabled');
    });

    it('03 — connect() serialises enabled query params into the config', () => {
        const sse = mkSse({
            query: [
                { id: 'p1', key: 'token', value: 'abc', disabled: false },
                { id: 'p2', key: 'debug', value: '1',   disabled: true  },
            ],
        });
        const { result, adapter } = setup(sse);

        act(() => { result.current.connect(); });

        const config = vi.mocked(adapter.realtime!.connectSse).mock.calls[0][0];
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

    it('05 — onEvent callback appends to realtimeState.sseEvents', () => {
        const { result, ctrl, activeTabId } = setup();
        const ev: SseEvent = { id: 'ev-1', eventName: 'message', data: 'hello', timestamp: 1000 };

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushEvent(ev); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.sseEvents).toHaveLength(1);
        expect(state?.sseEvents[0].data).toBe('hello');
    });

    it('06 — onError callback sets realtimeState error / status', () => {
        const { result, ctrl, activeTabId } = setup();

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushError('stream closed'); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.status).toBe('error');
        expect(state?.error).toBe('stream closed');
    });

    it('07 — onHeaders callback updates realtimeState.responseHeaders', () => {
        const { result, ctrl, activeTabId } = setup();

        act(() => { result.current.connect(); });
        act(() => { ctrl.pushHeaders({ 'content-type': 'text/event-stream' }); });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        expect(state?.responseHeaders).toEqual({ 'content-type': 'text/event-stream' });
    });

    // ──────────────────────────────────────────────────────────────────────
    // 08. disconnect()
    // ──────────────────────────────────────────────────────────────────────

    it('08 — disconnect() calls adapter.realtime.disconnectSse with the connection id', async () => {
        const { result, adapter } = setup();

        act(() => { result.current.connect(); });
        await act(async () => { await result.current.disconnect(); });

        expect(adapter.realtime!.disconnectSse).toHaveBeenCalledWith('sse-conn-abc');
    });

    it('09 — disconnect() before connect() does not call the adapter', async () => {
        const { result, adapter } = setup();

        await act(async () => { await result.current.disconnect(); });

        expect(adapter.realtime!.disconnectSse).not.toHaveBeenCalled();
    });

    // ──────────────────────────────────────────────────────────────────────
    // 10. Guard — missing realtime adapter
    // ──────────────────────────────────────────────────────────────────────

    it('10 — connect() shows an error notification when adapter.realtime is undefined', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkSse());
        const { adapter, notificationLog } = createMockAdapter();
        adapter.realtime = undefined;

        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(AdapterProvider, { adapter, children });
        const { result } = renderHook(() => useSseConnection(), { wrapper });

        act(() => { result.current.connect(); });

        expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────────────
    // 11. Guard — invalid URL scheme
    // ──────────────────────────────────────────────────────────────────────

    it('11 — connect() shows error notification for non-http(s) URL', () => {
        const { result, notificationLog } = setup(mkSse({ url: 'ftp://bad.example.com/stream' }));

        act(() => { result.current.connect(); });

        expect(notificationLog.some((n) => n.type === 'error')).toBe(true);
        expect(notificationLog.some((n) => n.message?.includes('http://'))).toBe(true);
    });

    // ──────────────────────────────────────────────────────────────────────
    // 12. Unmount cleanup
    // ──────────────────────────────────────────────────────────────────────

    it('12 — unmounting unsubscribes all handle listeners', () => {
        const { result, ctrl, unmount } = setup();

        act(() => { result.current.connect(); });

        // Track whether the listeners were removed by checking callback sets become empty
        // after unmount by verifying a subsequent pushEvent does not reach the store.
        const activeTabId = useAppStateStore.getState().activeTabId;
        unmount();

        act(() => {
            ctrl.pushEvent({ id: 'ev-x', eventName: 'message', data: 'after-unmount', timestamp: 1000 });
        });

        const state = useAppStateStore.getState().getRealtimeState(activeTabId);
        // After unmount, listeners are removed, so no event should have been appended.
        expect(state?.sseEvents ?? []).toHaveLength(0);
    });
});
