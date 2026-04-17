/**
 * Unit tests for createRealtimeSlice — FEAT-002 TASK-002, TASK-003, TASK-004
 *
 * Cover:
 *  TASK-002 — Idle state initialisation
 *   1.  ensureRealtimeTabState creates an idle entry for a WS tab.
 *   2.  ensureRealtimeTabState creates an idle entry for an SSE tab.
 *   3.  ensureRealtimeTabState is a no-op when an entry already exists.
 *   4.  getRealtimeState returns the entry for a known tab.
 *   5.  getRealtimeState returns undefined for an unknown tab ID.
 *   6.  setRealtimeStatus updates status; no-op for unknown ID.
 *   7.  setRealtimeConnectionId updates connectionId; no-op for unknown ID.
 *   8.  setRealtimeResponseHeaders updates responseHeaders; no-op for unknown ID.
 *   9.  setRealtimeError sets status to "error" and records message.
 *  10.  resetRealtimeTabState clears messages/events/headers/error back to idle.
 *  11.  removeRealtimeTabState deletes the entry entirely.
 *  12.  Updates to one tab do not affect another tab's realtime state.
 *
 *  TASK-003 — Timeline actions
 *  13.  appendWsMessage appends in insertion order.
 *  14.  appendWsMessage is a no-op for SSE tabs.
 *  15.  appendSseEvent appends in insertion order.
 *  16.  appendSseEvent is a no-op for WS tabs.
 *  17.  clearRealtimeTimeline wipes messages and events, leaves status untouched.
 *  18.  setSseEventFilter changes the filter; no-op for WS tabs.
 *  19.  getFilteredSseEvents returns all events when filter is "all".
 *  20.  getFilteredSseEvents returns only matching events when a name is set.
 *  21.  getFilteredSseEvents returns [] for unknown tab IDs.
 *
 *  TASK-004 — Lifecycle wiring via createRequestTabsSlice
 *  22.  loadRequestIntoNewTab with a WS request creates a realtime entry.
 *  23.  loadRequestIntoNewTab with an SSE request creates a realtime entry.
 *  24.  loadRequestIntoNewTab with an HTTP request creates no realtime entry.
 *  25.  loadRequestIntoTab reloading a WS request resets (discards) prior state.
 *  26.  loadRequestIntoTab switching from WS to HTTP removes realtime state.
 *  27.  loadRequestIntoTab switching from HTTP to WS creates fresh realtime state.
 *  28.  updateProtocol from HTTP to WS creates a fresh idle realtime entry.
 *  29.  updateProtocol from WS to HTTP removes realtime state.
 *  30.  updateProtocol WS → SSE resets with new protocol.
 *  31.  clearActiveTab removes realtime state for the active tab.
 *  32.  clearTab removes realtime state for the specified tab.
 *  33.  closeTab removes realtime state for the closed tab.
 *  34.  closeTab on the last tab (reset-to-empty) also removes realtime state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { CollectionRequest, WsCollectionRequest, SseCollectionRequest } from '../../../types/collection';
import type { WsMessage, SseEvent } from '../../../types/realtime';
import { createEmptyTab } from '../../../types/tab';

// ── Fixture factories ──────────────────────────────────────────────────────────

const mkHttp = (overrides: Partial<CollectionRequest> = {}): CollectionRequest => ({
    id: 'http-1',
    name: 'HTTP',
    method: 'GET',
    url: 'https://api.example.com',
    header: [],
    ...overrides,
});

const mkWs = (overrides: Partial<WsCollectionRequest> = {}): WsCollectionRequest => ({
    id: 'ws-1',
    name: 'WS',
    protocol: 'ws',
    url: 'wss://ws.example.com',
    header: [],
    ...overrides,
});

const mkSse = (overrides: Partial<SseCollectionRequest> = {}): SseCollectionRequest => ({
    id: 'sse-1',
    name: 'SSE',
    protocol: 'sse',
    method: 'GET',
    url: 'https://sse.example.com/events',
    header: [],
    ...overrides,
});

const mkWsMsg = (partial: Partial<WsMessage> = {}): WsMessage => ({
    id: 'msg-1',
    direction: 'received',
    content: 'hello',
    timestamp: Date.now(),
    size: 5,
    ...partial,
});

const mkSseEvt = (partial: Partial<SseEvent> = {}): SseEvent => ({
    id: 'evt-1',
    eventName: 'message',
    data: '{"status":"ok"}',
    timestamp: Date.now(),
    ...partial,
});

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    const emptyTab = createEmptyTab();
    useAppStateStore.setState({
        tabs: [emptyTab],
        activeTabId: emptyTab.id,
        realtimeState: {},
    });
});

// ── TASK-002 tests  ───────────────────────────────────────────────────────────

describe('createRealtimeSlice — idle state management (TASK-002)', () => {

    it('ensureRealtimeTabState creates an idle entry for a WS tab', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        const state = useAppStateStore.getState().getRealtimeState('tab-ws');
        expect(state).toBeDefined();
        expect(state?.protocol).toBe('ws');
        expect(state?.status).toBe('idle');
        expect(state?.connectionId).toBeNull();
        expect(state?.wsMessages).toHaveLength(0);
        expect(state?.sseEvents).toHaveLength(0);
        expect(state?.selectedSseEventName).toBe('all');
    });

    it('ensureRealtimeTabState creates an idle entry for an SSE tab', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-sse', 'sse');
        const state = useAppStateStore.getState().getRealtimeState('tab-sse');
        expect(state?.protocol).toBe('sse');
        expect(state?.status).toBe('idle');
        expect(state?.selectedSseEventName).toBe('all');
    });

    it('ensureRealtimeTabState is a no-op when an entry already exists', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeStatus('tab-ws', 'connected');
        // calling ensure again should NOT reset status
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        expect(useAppStateStore.getState().getRealtimeState('tab-ws')?.status).toBe('connected');
    });

    it('getRealtimeState returns the entry for a known tab ID', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-x', 'ws');
        expect(useAppStateStore.getState().getRealtimeState('tab-x')).toBeDefined();
    });

    it('getRealtimeState returns undefined for an unknown tab ID', () => {
        expect(useAppStateStore.getState().getRealtimeState('nonexistent')).toBeUndefined();
    });

    it('setRealtimeStatus updates status and is a no-op for an unknown ID', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeStatus('tab-ws', 'connecting');
        expect(useAppStateStore.getState().getRealtimeState('tab-ws')?.status).toBe('connecting');

        // Should not throw and should not create a phantom entry
        useAppStateStore.getState().setRealtimeStatus('ghost', 'connected');
        expect(useAppStateStore.getState().getRealtimeState('ghost')).toBeUndefined();
    });

    it('setRealtimeConnectionId updates connectionId and is a no-op for an unknown ID', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeConnectionId('tab-ws', 'conn-abc');
        expect(useAppStateStore.getState().getRealtimeState('tab-ws')?.connectionId).toBe('conn-abc');

        useAppStateStore.getState().setRealtimeConnectionId('ghost', 'x');
        expect(useAppStateStore.getState().getRealtimeState('ghost')).toBeUndefined();
    });

    it('setRealtimeResponseHeaders stores headers and is a no-op for an unknown ID', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeResponseHeaders('tab-ws', { 'upgrade': 'websocket' });
        const headers = useAppStateStore.getState().getRealtimeState('tab-ws')?.responseHeaders;
        expect(headers).toEqual({ 'upgrade': 'websocket' });

        useAppStateStore.getState().setRealtimeResponseHeaders('ghost', {});
        expect(useAppStateStore.getState().getRealtimeState('ghost')).toBeUndefined();
    });

    it('setRealtimeError sets status to "error" and records the message', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeStatus('tab-ws', 'connecting');
        useAppStateStore.getState().setRealtimeError('tab-ws', 'Connection refused');
        const state = useAppStateStore.getState().getRealtimeState('tab-ws');
        expect(state?.status).toBe('error');
        expect(state?.error).toBe('Connection refused');
    });

    it('resetRealtimeTabState returns to idle, clearing messages/events/headers/error', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeStatus('tab-ws', 'connected');
        useAppStateStore.getState().setRealtimeConnectionId('tab-ws', 'conn-42');
        useAppStateStore.getState().appendWsMessage('tab-ws', mkWsMsg());
        useAppStateStore.getState().setRealtimeError('tab-ws', 'oops');

        useAppStateStore.getState().resetRealtimeTabState('tab-ws');

        const state = useAppStateStore.getState().getRealtimeState('tab-ws');
        expect(state?.status).toBe('idle');
        expect(state?.connectionId).toBeNull();
        expect(state?.wsMessages).toHaveLength(0);
        expect(state?.error).toBeUndefined();
    });

    it('removeRealtimeTabState deletes the entry entirely', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().removeRealtimeTabState('tab-ws');
        expect(useAppStateStore.getState().getRealtimeState('tab-ws')).toBeUndefined();
    });

    it('updates to one tab do not affect another tab\'s realtime state', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-a', 'ws');
        useAppStateStore.getState().ensureRealtimeTabState('tab-b', 'ws');
        useAppStateStore.getState().setRealtimeStatus('tab-a', 'connected');

        expect(useAppStateStore.getState().getRealtimeState('tab-b')?.status).toBe('idle');
    });
});

// ── TASK-003 tests  ───────────────────────────────────────────────────────────

describe('createRealtimeSlice — timeline actions (TASK-003)', () => {

    it('appendWsMessage appends messages in insertion order', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().appendWsMessage('tab-ws', mkWsMsg({ id: 'm1', content: 'first' }));
        useAppStateStore.getState().appendWsMessage('tab-ws', mkWsMsg({ id: 'm2', content: 'second' }));
        const msgs = useAppStateStore.getState().getRealtimeState('tab-ws')?.wsMessages ?? [];
        expect(msgs).toHaveLength(2);
        expect(msgs[0].id).toBe('m1');
        expect(msgs[1].id).toBe('m2');
    });

    it('appendWsMessage is a no-op for SSE tabs', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-sse', 'sse');
        useAppStateStore.getState().appendWsMessage('tab-sse', mkWsMsg());
        const msgs = useAppStateStore.getState().getRealtimeState('tab-sse')?.wsMessages ?? [];
        expect(msgs).toHaveLength(0);
    });

    it('appendSseEvent appends events in insertion order', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-sse', 'sse');
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e1', eventName: 'ping' }));
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e2', eventName: 'data' }));
        const evts = useAppStateStore.getState().getRealtimeState('tab-sse')?.sseEvents ?? [];
        expect(evts).toHaveLength(2);
        expect(evts[0].id).toBe('e1');
        expect(evts[1].id).toBe('e2');
    });

    it('appendSseEvent is a no-op for WS tabs', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().appendSseEvent('tab-ws', mkSseEvt());
        const evts = useAppStateStore.getState().getRealtimeState('tab-ws')?.sseEvents ?? [];
        expect(evts).toHaveLength(0);
    });

    it('clearRealtimeTimeline wipes messages and events but leaves status intact', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setRealtimeStatus('tab-ws', 'connected');
        useAppStateStore.getState().appendWsMessage('tab-ws', mkWsMsg());
        useAppStateStore.getState().clearRealtimeTimeline('tab-ws');
        const state = useAppStateStore.getState().getRealtimeState('tab-ws');
        expect(state?.wsMessages).toHaveLength(0);
        expect(state?.status).toBe('connected');
    });

    it('setSseEventFilter changes the active filter; no-op for WS tabs', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-sse', 'sse');
        useAppStateStore.getState().setSseEventFilter('tab-sse', 'heartbeat');
        expect(useAppStateStore.getState().getRealtimeState('tab-sse')?.selectedSseEventName).toBe('heartbeat');

        // No-op for WS tab
        useAppStateStore.getState().ensureRealtimeTabState('tab-ws', 'ws');
        useAppStateStore.getState().setSseEventFilter('tab-ws', 'heartbeat'); // should be ignored
        // WS entry should still have 'all' (unchanged)
        expect(useAppStateStore.getState().getRealtimeState('tab-ws')?.selectedSseEventName).toBe('all');
    });

    it('getFilteredSseEvents returns all events when filter is "all"', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-sse', 'sse');
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e1', eventName: 'ping' }));
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e2', eventName: 'data' }));
        const filtered = useAppStateStore.getState().getFilteredSseEvents('tab-sse');
        expect(filtered).toHaveLength(2);
    });

    it('getFilteredSseEvents returns only matching events when a name is set', () => {
        useAppStateStore.getState().ensureRealtimeTabState('tab-sse', 'sse');
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e1', eventName: 'ping' }));
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e2', eventName: 'data' }));
        useAppStateStore.getState().appendSseEvent('tab-sse', mkSseEvt({ id: 'e3', eventName: 'ping' }));
        useAppStateStore.getState().setSseEventFilter('tab-sse', 'ping');
        const filtered = useAppStateStore.getState().getFilteredSseEvents('tab-sse');
        expect(filtered).toHaveLength(2);
        expect(filtered.every((e) => e.eventName === 'ping')).toBe(true);
    });

    it('getFilteredSseEvents returns [] for unknown tab IDs', () => {
        expect(useAppStateStore.getState().getFilteredSseEvents('nonexistent')).toEqual([]);
    });
});

// ── TASK-004 tests  ───────────────────────────────────────────────────────────

describe('createRealtimeSlice — lifecycle wiring via tabs (TASK-004)', () => {

    it('loadRequestIntoNewTab with a WS request initialises a realtime entry', () => {
        const tab = useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'ws-tab-1' }));
        expect(tab).not.toBeNull();
        const state = useAppStateStore.getState().getRealtimeState('ws-tab-1');
        expect(state?.protocol).toBe('ws');
        expect(state?.status).toBe('idle');
    });

    it('loadRequestIntoNewTab with an SSE request initialises a realtime entry', () => {
        const tab = useAppStateStore.getState().loadRequestIntoNewTab(mkSse({ id: 'sse-tab-1' }));
        expect(tab).not.toBeNull();
        const state = useAppStateStore.getState().getRealtimeState('sse-tab-1');
        expect(state?.protocol).toBe('sse');
        expect(state?.status).toBe('idle');
    });

    it('loadRequestIntoNewTab with an HTTP request creates no realtime entry', () => {
        const tab = useAppStateStore.getState().loadRequestIntoNewTab(mkHttp({ id: 'http-tab-1' }));
        expect(tab).not.toBeNull();
        expect(useAppStateStore.getState().getRealtimeState('http-tab-1')).toBeUndefined();
    });

    it('loadRequestIntoTab reloading a WS request resets (discards) prior realtime state', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'ws-tab-2' }));
        // Simulate prior connection data
        useAppStateStore.getState().setRealtimeStatus('ws-tab-2', 'connected');
        useAppStateStore.getState().appendWsMessage('ws-tab-2', mkWsMsg());
        expect(useAppStateStore.getState().getRealtimeState('ws-tab-2')?.wsMessages).toHaveLength(1);

        // Reload — should discard old messages
        useAppStateStore.getState().loadRequestIntoTab(mkWs({ id: 'ws-tab-2' }));

        const state = useAppStateStore.getState().getRealtimeState('ws-tab-2');
        expect(state?.status).toBe('idle');
        expect(state?.wsMessages).toHaveLength(0);
    });

    it('loadRequestIntoTab switching from WS to HTTP removes realtime state', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'shared-tab-id' }));
        expect(useAppStateStore.getState().getRealtimeState('shared-tab-id')).toBeDefined();

        // Load an HTTP request into the same tab ID
        useAppStateStore.getState().loadRequestIntoTab(mkHttp({ id: 'shared-tab-id' }));
        expect(useAppStateStore.getState().getRealtimeState('shared-tab-id')).toBeUndefined();
    });

    it('loadRequestIntoTab switching from HTTP to WS creates fresh realtime state', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkHttp({ id: 'tab-switch' }));
        expect(useAppStateStore.getState().getRealtimeState('tab-switch')).toBeUndefined();

        useAppStateStore.getState().loadRequestIntoTab(mkWs({ id: 'tab-switch' }));
        const state = useAppStateStore.getState().getRealtimeState('tab-switch');
        expect(state?.protocol).toBe('ws');
        expect(state?.status).toBe('idle');
    });

    it('updateProtocol from HTTP to WS creates a fresh idle realtime entry', () => {
        // Start with an HTTP tab
        useAppStateStore.getState().loadRequestIntoTab(mkHttp());
        const tabId = useAppStateStore.getState().activeTabId;
        expect(useAppStateStore.getState().getRealtimeState(tabId)).toBeUndefined();

        useAppStateStore.getState().updateProtocol('ws');
        const state = useAppStateStore.getState().getRealtimeState(tabId);
        expect(state?.protocol).toBe('ws');
        expect(state?.status).toBe('idle');
    });

    it('updateProtocol from WS to HTTP removes realtime state', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const tabId = useAppStateStore.getState().activeTabId;
        expect(useAppStateStore.getState().getRealtimeState(tabId)).toBeDefined();

        useAppStateStore.getState().updateProtocol('http');
        expect(useAppStateStore.getState().getRealtimeState(tabId)).toBeUndefined();
    });

    it('updateProtocol WS → SSE replaces the realtime entry with the new protocol', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const tabId = useAppStateStore.getState().activeTabId;
        useAppStateStore.getState().setRealtimeStatus(tabId, 'connected');
        useAppStateStore.getState().appendWsMessage(tabId, mkWsMsg());

        useAppStateStore.getState().updateProtocol('sse');

        const state = useAppStateStore.getState().getRealtimeState(tabId);
        expect(state?.protocol).toBe('sse');
        expect(state?.status).toBe('idle');
        expect(state?.wsMessages).toHaveLength(0);
    });

    it('clearActiveTab removes realtime state for the active tab', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const tabId = useAppStateStore.getState().activeTabId;
        expect(useAppStateStore.getState().getRealtimeState(tabId)).toBeDefined();

        useAppStateStore.getState().clearActiveTab();
        expect(useAppStateStore.getState().getRealtimeState(tabId)).toBeUndefined();
    });

    it('clearTab removes realtime state for the specified tab', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'tab-to-clear' }));
        expect(useAppStateStore.getState().getRealtimeState('tab-to-clear')).toBeDefined();

        useAppStateStore.getState().clearTab('tab-to-clear');
        expect(useAppStateStore.getState().getRealtimeState('tab-to-clear')).toBeUndefined();
    });

    it('closeTab removes realtime state for the closed tab', () => {
        // Load two tabs so close doesn't reset
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'ws-a' }));
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'ws-b' }));
        expect(useAppStateStore.getState().getRealtimeState('ws-a')).toBeDefined();

        useAppStateStore.getState().closeTab('ws-a');
        expect(useAppStateStore.getState().getRealtimeState('ws-a')).toBeUndefined();
        // Other tab still has its entry
        expect(useAppStateStore.getState().getRealtimeState('ws-b')).toBeDefined();
    });

    it('closeTab on the last tab (reset-to-empty) also removes realtime state', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs({ id: 'only-tab' }));
        // Make it the only tab by closing others if necessary (already single tab given beforeEach)
        // Close to trigger the "reset last tab" path
        useAppStateStore.getState().closeTab('only-tab');
        expect(useAppStateStore.getState().getRealtimeState('only-tab')).toBeUndefined();
    });
});
