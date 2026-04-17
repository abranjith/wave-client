/**
 * Unit tests for createRequestTabsSlice — FEAT-002 TASK-001,
 * covering protocol-aware tab drafts introduced by the AnyCollectionRequest migration.
 *
 * Tested scenarios:
 *  TASK-001 loadRequestIntoNewTab — protocol detection
 *   1.  Loading an HTTP CollectionRequest sets tab.protocol = 'http'.
 *   2.  Loading a WsCollectionRequest sets tab.protocol = 'ws'.
 *   3.  Loading an SseCollectionRequest sets tab.protocol = 'sse'.
 *   4.  Loading a request with no explicit protocol defaults to 'http'.
 *
 *  TASK-001 loadRequestIntoNewTab — WS field isolation
 *   5.  WS tab body is reset to mode 'none'.
 *   6.  WS tab validation is empty (empty rules).
 *
 *  TASK-001 getCollectionRequest — round-trip fidelity
 *   7.  HTTP round-trip returns CollectionRequest shape (has method, body, validation).
 *   8.  WS round-trip returns WsCollectionRequest (no method, no body, no validation).
 *   9.  SSE round-trip returns SseCollectionRequest (has method, optional body, no validation).
 *
 *  TASK-001 updateProtocol — URL scheme normalisation
 *  10.  updateProtocol('ws') rewrites https:// URL to wss://.
 *  11.  updateProtocol('ws') rewrites http://  URL to ws://.
 *  12.  updateProtocol('http') after switching to WS rewrites wss:// back to https://.
 *  13.  updateProtocol('http') after switching to WS rewrites ws://  back to http://.
 *  14.  updateProtocol('ws') clears the body (sets mode to 'none').
 *
 *  TASK-001 updateUrl — auto-detect WS protocol
 *  15.  Typing a ws:// URL auto-switches protocol to 'ws'.
 *  16.  Typing a wss:// URL auto-switches protocol to 'ws'.
 *  17.  Typing an https:// URL on a WS tab does NOT auto-revert protocol (one-directional).
 *  18.  URL-based WS auto-switch initializes realtime tab state.
 *  19.  URL-based WS auto-switch clears body to mode 'none'.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { CollectionRequest, WsCollectionRequest, SseCollectionRequest } from '../../../types/collection';
import { createEmptyTab } from '../../../types/tab';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mkHttp = (overrides: Partial<CollectionRequest> = {}): CollectionRequest => ({
    id: 'http-req-1',
    name: 'HTTP Request',
    method: 'POST',
    url: 'https://api.example.com/users',
    header: [],
    body: { mode: 'raw', raw: '{"name":"test"}' },
    ...overrides,
});

const mkWs = (overrides: Partial<WsCollectionRequest> = {}): WsCollectionRequest => ({
    id: 'ws-req-1',
    name: 'WS Request',
    protocol: 'ws',
    url: 'wss://echo.websocket.org',
    header: [],
    ...overrides,
});

const mkSse = (overrides: Partial<SseCollectionRequest> = {}): SseCollectionRequest => ({
    id: 'sse-req-1',
    name: 'SSE Request',
    protocol: 'sse',
    method: 'GET',
    url: 'https://api.example.com/events',
    header: [],
    ...overrides,
});

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    // Reset to a single empty tab
    const emptyTab = createEmptyTab();
    useAppStateStore.setState({
        tabs: [emptyTab],
        activeTabId: emptyTab.id,
    });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createRequestTabsSlice — protocol-aware tab drafts (TASK-001)', () => {

    // ── loadRequestIntoNewTab — protocol detection ──────────────────────────

    it('loading an HTTP request sets tab.protocol to "http"', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkHttp());
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('http');
    });

    it('loading a WS request sets tab.protocol to "ws"', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('ws');
    });

    it('loading an SSE request sets tab.protocol to "sse"', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkSse());
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('sse');
    });

    it('loading a request with no explicit protocol defaults to "http"', () => {
        // CollectionRequest without protocol field
        const req: CollectionRequest = { id: 'no-proto', name: 'No Protocol', method: 'GET', url: 'https://example.com', header: [] };
        useAppStateStore.getState().loadRequestIntoNewTab(req);
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('http');
    });

    // ── loadRequestIntoNewTab — WS field isolation ──────────────────────────

    it('WS tab body is reset to mode "none"', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.body?.mode).toBe('none');
    });

    it('WS tab validation has empty rules array', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.validation?.rules).toHaveLength(0);
    });

    // ── getCollectionRequest — round-trip fidelity ──────────────────────────

    it('HTTP round-trip returns a shape with method, body, and validation', () => {
        const req = mkHttp();
        useAppStateStore.getState().loadRequestIntoNewTab(req);
        const result = useAppStateStore.getState().getCollectionRequest();
        // HTTP-specific fields must be present
        expect('method' in result).toBe(true);
        expect('body' in result).toBe(true);
        expect('validation' in result).toBe(true);
    });

    it('WS round-trip omits method, body, and validation', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkWs());
        const result = useAppStateStore.getState().getCollectionRequest();
        // WS-specific: no method, no body, no validation
        expect(result.protocol).toBe('ws');
        expect('method' in result).toBe(false);
        expect('body' in result).toBe(false);
        expect('validation' in result).toBe(false);
    });

    it('SSE round-trip has method and body but no validation', () => {
        useAppStateStore.getState().loadRequestIntoNewTab(mkSse());
        const result = useAppStateStore.getState().getCollectionRequest();
        expect(result.protocol).toBe('sse');
        expect('method' in result).toBe(true);
        // validation must not be present
        expect('validation' in result).toBe(false);
    });

    // ── updateProtocol — URL scheme normalisation ───────────────────────────

    it('updateProtocol("ws") rewrites https:// to wss://', () => {
        const req = mkHttp({ url: 'https://api.example.com/ws' });
        useAppStateStore.getState().loadRequestIntoTab(req);
        useAppStateStore.getState().updateProtocol('ws');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.url).toMatch(/^wss:\/\//);
    });

    it('updateProtocol("ws") rewrites http:// to ws://', () => {
        const req = mkHttp({ url: 'http://localhost:3000/ws' });
        useAppStateStore.getState().loadRequestIntoTab(req);
        useAppStateStore.getState().updateProtocol('ws');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.url).toMatch(/^ws:\/\//);
    });

    it('updateProtocol("http") after WS rewrites wss:// back to https://', () => {
        const req = mkWs({ url: 'wss://api.example.com/ws' });
        useAppStateStore.getState().loadRequestIntoTab(req);
        useAppStateStore.getState().updateProtocol('http');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.url).toMatch(/^https:\/\//);
    });

    it('updateProtocol("http") after WS rewrites ws:// back to http://', () => {
        const req = mkWs({ url: 'ws://localhost:3000/ws' });
        useAppStateStore.getState().loadRequestIntoTab(req);
        useAppStateStore.getState().updateProtocol('http');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.url).toMatch(/^http:\/\//);
    });

    it('updateProtocol("ws") clears the body to mode "none"', () => {
        const req = mkHttp({ body: { mode: 'raw', raw: '{"key":"value"}' } });
        useAppStateStore.getState().loadRequestIntoTab(req);
        useAppStateStore.getState().updateProtocol('ws');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.body?.mode).toBe('none');
    });

    // ── updateUrl — auto-detect WS protocol ────────────────────────────────

    it('typing a ws:// URL auto-switches protocol to "ws"', () => {
        useAppStateStore.getState().loadRequestIntoTab(mkHttp());
        useAppStateStore.getState().updateUrl('ws://echo.example.com');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('ws');
    });

    it('typing a ws:// URL initializes realtime state for the active tab', () => {
        useAppStateStore.getState().loadRequestIntoTab(mkHttp());
        const tabBefore = useAppStateStore.getState().getActiveTab();
        if (!tabBefore) throw new Error('Expected active tab');

        useAppStateStore.getState().updateUrl('ws://echo.example.com');

        const realtime = useAppStateStore.getState().getRealtimeState(tabBefore.id);
        expect(realtime?.protocol).toBe('ws');
        expect(realtime?.status).toBe('idle');
    });

    it('typing a wss:// URL auto-switches protocol to "ws"', () => {
        useAppStateStore.getState().loadRequestIntoTab(mkHttp());
        useAppStateStore.getState().updateUrl('wss://echo.example.com');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('ws');
    });

    it('typing an https:// URL on a WS tab does NOT auto-switch protocol (one-directional)', () => {
        // updateUrl only auto-detects ws:// / wss:// → 'ws'.
        // Typing an https:// URL does not revert the tab to 'http'; the user
        // must call updateProtocol() explicitly for that change.
        useAppStateStore.getState().loadRequestIntoTab(mkWs());
        useAppStateStore.getState().updateUrl('https://api.example.com/data');
        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('ws');
    });

    it('typing a wss:// URL clears body to mode "none" when auto-switching from HTTP', () => {
        useAppStateStore.getState().loadRequestIntoTab(
            mkHttp({ body: { mode: 'raw', raw: '{"x":1}' } })
        );

        useAppStateStore.getState().updateUrl('wss://echo.example.com');

        const tab = useAppStateStore.getState().getActiveTab();
        expect(tab?.protocol).toBe('ws');
        expect(tab?.body?.mode).toBe('none');
    });
});
