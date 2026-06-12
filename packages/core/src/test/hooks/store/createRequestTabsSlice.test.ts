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
 *
 *  insertParamAfter — insert-after semantics
 *  20.  Inserts a new empty param directly after the specified row.
 *  21.  Inserting after the first row places the new row at index 1.
 *  22.  Inserting after the last row appends to the end.
 *  23.  Unknown id appends to the end.
 *  24.  New param has empty key and value.
 *  25.  URL is updated after insert (disabled params not included in query string).
 *
 *  insertHeaderAfter — insert-after semantics
 *  26.  Inserts a new empty header directly after the specified row.
 *  27.  Inserting after the first row places the new row at index 1.
 *  28.  Inserting after the last row appends to the end.
 *  29.  Unknown id appends to the end.
 *  30.  New header has empty key and value.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import type { CollectionRequest, WsCollectionRequest, SseCollectionRequest, ResponseData } from '../../../types/collection';
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

const mkResponse = (overrides: Partial<ResponseData> = {}): ResponseData => ({
    id: 'resp-1',
    status: 200,
    statusText: 'OK',
    elapsedTime: 42,
    size: 128,
    body: btoa('{"ok":true}'),
    headers: { 'content-type': 'application/json' },
    isEncoded: true,
    ...overrides,
});

const mkSentRequest = () => ({
    method: 'POST',
    url: 'https://api.example.com/users?page=1',
    headers: {
        authorization: 'Bearer secret-token',
        'x-trace-id': 'trace-1',
    },
    body: {
        text: '{"name":"alice"}',
        format: 'json' as const,
    },
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
        if (!tabBefore) {throw new Error('Expected active tab');}

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

    it('reloading an already-open HTTP request keeps the last response snapshot', () => {
        const req = mkHttp({ id: 'persist-http' });
        const response = mkResponse();

        useAppStateStore.getState().loadRequestIntoTab(req);
        useAppStateStore.getState().handleHttpResponse(req.id, response);
        useAppStateStore.getState().setActiveResponseSection('Headers');

        // Simulate switching away to another request tab.
        useAppStateStore.getState().addTab();

        // Re-selecting the same request should not wipe runtime response state.
        useAppStateStore.getState().loadRequestIntoTab(req);

        const tab = useAppStateStore.getState().getTabById(req.id);
        expect(tab?.responseData).toEqual(response);
        expect(tab?.activeResponseSection).toBe('Headers');
    });

    it('reloading same id with protocol change clears old HTTP response snapshot', () => {
        const id = 'shared-protocol-id';

        useAppStateStore.getState().loadRequestIntoTab(mkHttp({ id }));
        useAppStateStore.getState().handleHttpResponse(id, mkResponse());

        useAppStateStore.getState().loadRequestIntoTab(mkWs({ id }));

        const tab = useAppStateStore.getState().getTabById(id);
        expect(tab?.protocol).toBe('ws');
        expect(tab?.responseData).toBeNull();
        expect(tab?.activeResponseSection).toBe('Messages');
    });

    it('stores sentRequest from handleHttpResponse when provided', () => {
        const id = 'sent-request-store';
        const sentRequest = mkSentRequest();

        useAppStateStore.getState().loadRequestIntoTab(mkHttp({ id }));
        useAppStateStore.getState().handleHttpResponse(id, mkResponse({ sentRequest }));

        const tab = useAppStateStore.getState().getTabById(id);
        expect(tab?.sentRequest).toEqual(sentRequest);
    });

    it('clears sentRequest when a new send starts (setTabProcessingState true)', () => {
        const id = 'sent-request-clear-on-send';

        useAppStateStore.getState().loadRequestIntoTab(mkHttp({ id }));
        useAppStateStore.getState().handleHttpResponse(id, mkResponse({ sentRequest: mkSentRequest() }));
        useAppStateStore.getState().setTabProcessingState(id, true);

        const tab = useAppStateStore.getState().getTabById(id);
        expect(tab?.isRequestProcessing).toBe(true);
        expect(tab?.sentRequest).toBeNull();
    });

    it('keeps sentRequest null when response has no sentRequest payload', () => {
        const id = 'sent-request-null-default';

        useAppStateStore.getState().loadRequestIntoTab(mkHttp({ id }));
        useAppStateStore.getState().handleHttpResponse(id, mkResponse());

        const tab = useAppStateStore.getState().getTabById(id);
        expect(tab?.sentRequest).toBeNull();
    });
});

// ── Helpers for row-insertion tests ───────────────────────────────────────────

function seedParams(keys: string[]) {
    const tab = useAppStateStore.getState().getActiveTab()!;
    const rows = keys.map(k => ({ id: `p-${k}`, key: k, value: `v-${k}`, disabled: false }));
    useAppStateStore.setState({
        tabs: useAppStateStore.getState().tabs.map(t =>
            t.id === tab.id ? { ...t, params: rows } : t
        ),
    });
    return rows;
}

function seedHeaders(keys: string[]) {
    const tab = useAppStateStore.getState().getActiveTab()!;
    const rows = keys.map(k => ({ id: `h-${k}`, key: k, value: `v-${k}`, disabled: false }));
    useAppStateStore.setState({
        tabs: useAppStateStore.getState().tabs.map(t =>
            t.id === tab.id ? { ...t, headers: rows } : t
        ),
    });
    return rows;
}

// ── insertParamAfter ───────────────────────────────────────────────────────────

describe('insertParamAfter', () => {
    it('inserts a new row directly after the target row', () => {
        const rows = seedParams(['a', 'b', 'c']);
        useAppStateStore.getState().insertParamAfter(rows[1].id); // after 'b'
        const params = useAppStateStore.getState().getActiveTab()!.params;
        expect(params).toHaveLength(4);
        expect(params[2].key).toBe('');  // new empty row at index 2
        expect(params[1].key).toBe('b'); // 'b' stays at index 1
        expect(params[3].key).toBe('c'); // 'c' pushed to index 3
    });

    it('inserts at index 1 when targeting the first row', () => {
        const rows = seedParams(['a', 'b']);
        useAppStateStore.getState().insertParamAfter(rows[0].id);
        const params = useAppStateStore.getState().getActiveTab()!.params;
        expect(params[0].key).toBe('a');
        expect(params[1].key).toBe('');
        expect(params[2].key).toBe('b');
    });

    it('appends when targeting the last row', () => {
        const rows = seedParams(['a', 'b']);
        useAppStateStore.getState().insertParamAfter(rows[1].id);
        const params = useAppStateStore.getState().getActiveTab()!.params;
        expect(params).toHaveLength(3);
        expect(params[2].key).toBe('');
    });

    it('appends when the id is not found', () => {
        const rows = seedParams(['a', 'b']);
        useAppStateStore.getState().insertParamAfter('unknown-id');
        const params = useAppStateStore.getState().getActiveTab()!.params;
        expect(params).toHaveLength(3);
        expect(params[2].key).toBe('');
    });

    it('new row has empty key and value', () => {
        const rows = seedParams(['a']);
        useAppStateStore.getState().insertParamAfter(rows[0].id);
        const params = useAppStateStore.getState().getActiveTab()!.params;
        const newRow = params[1];
        expect(newRow.key).toBe('');
        expect(newRow.value).toBe('');
        expect(newRow.disabled).toBe(false);
    });

    it('marks the tab dirty', () => {
        const rows = seedParams(['a']);
        useAppStateStore.getState().insertParamAfter(rows[0].id);
        expect(useAppStateStore.getState().getActiveTab()!.isDirty).toBe(true);
    });
});

// ── insertHeaderAfter ─────────────────────────────────────────────────────────

describe('insertHeaderAfter', () => {
    it('inserts a new row directly after the target row', () => {
        const rows = seedHeaders(['a', 'b', 'c']);
        useAppStateStore.getState().insertHeaderAfter(rows[1].id); // after 'b'
        const headers = useAppStateStore.getState().getActiveTab()!.headers;
        expect(headers).toHaveLength(4);
        expect(headers[2].key).toBe('');
        expect(headers[1].key).toBe('b');
        expect(headers[3].key).toBe('c');
    });

    it('inserts at index 1 when targeting the first row', () => {
        const rows = seedHeaders(['a', 'b']);
        useAppStateStore.getState().insertHeaderAfter(rows[0].id);
        const headers = useAppStateStore.getState().getActiveTab()!.headers;
        expect(headers[0].key).toBe('a');
        expect(headers[1].key).toBe('');
        expect(headers[2].key).toBe('b');
    });

    it('appends when targeting the last row', () => {
        const rows = seedHeaders(['a', 'b']);
        useAppStateStore.getState().insertHeaderAfter(rows[1].id);
        const headers = useAppStateStore.getState().getActiveTab()!.headers;
        expect(headers).toHaveLength(3);
        expect(headers[2].key).toBe('');
    });

    it('appends when the id is not found', () => {
        const rows = seedHeaders(['a', 'b']);
        useAppStateStore.getState().insertHeaderAfter('unknown-id');
        const headers = useAppStateStore.getState().getActiveTab()!.headers;
        expect(headers).toHaveLength(3);
        expect(headers[2].key).toBe('');
    });

    it('new row has empty key and value', () => {
        const rows = seedHeaders(['a']);
        useAppStateStore.getState().insertHeaderAfter(rows[0].id);
        const headers = useAppStateStore.getState().getActiveTab()!.headers;
        const newRow = headers[1];
        expect(newRow.key).toBe('');
        expect(newRow.value).toBe('');
        expect(newRow.disabled).toBe(false);
    });

    it('marks the tab dirty', () => {
        const rows = seedHeaders(['a']);
        useAppStateStore.getState().insertHeaderAfter(rows[0].id);
        expect(useAppStateStore.getState().getActiveTab()!.isDirty).toBe(true);
    });
});

// ── updateTabMetadata — save write-back (FEAT-FP-COL-001 TASK-001) ─────────────

describe('updateTabMetadata — save write-back', () => {
    /** Load an HTTP request into a new tab and mark it dirty. */
    function loadAndDirtyTab(id = 'tab-save-1', sourceCollectionFilename = 'api.json', itemPath: string[] = []) {
        useAppStateStore.getState().loadRequestIntoTab({
            ...mkHttp({ id }),
            name: 'Get Users',
            sourceRef: {
                collectionFilename: sourceCollectionFilename,
                collectionName: 'My API',
                itemPath,
            },
        });
        useAppStateStore.getState().markTabDirty(id);
        return id;
    }

    it('clears isDirty after updateTabMetadata', () => {
        const id = loadAndDirtyTab('tm-dirty');
        expect(useAppStateStore.getState().getTabById(id)!.isDirty).toBe(true);
        useAppStateStore.getState().updateTabMetadata(id, {
            name: 'Get Users',
            folderPath: ['My API'],
            collectionRef: { collectionFilename: 'api.json', collectionName: 'My API', itemPath: [] },
        });
        expect(useAppStateStore.getState().getTabById(id)!.isDirty).toBe(false);
    });

    it('folderPath for root-level save is [collectionName] only — no request name appended', () => {
        const id = loadAndDirtyTab('tm-root');
        useAppStateStore.getState().updateTabMetadata(id, {
            name: 'Get Users',
            folderPath: ['My API'],
            collectionRef: { collectionFilename: 'api.json', collectionName: 'My API', itemPath: [] },
        });
        const tab = useAppStateStore.getState().getTabById(id)!;
        expect(tab.folderPath).toEqual(['My API']);
        expect(tab.folderPath).not.toContain('Get Users');
    });

    it('folderPath for a nested save is [collectionName, ...folderPath] — no request name', () => {
        const id = loadAndDirtyTab('tm-nested', 'api.json', ['v1', 'Users']);
        useAppStateStore.getState().updateTabMetadata(id, {
            name: 'Get Users',
            folderPath: ['My API', 'v1', 'Users'],
            collectionRef: {
                collectionFilename: 'api.json',
                collectionName: 'My API',
                itemPath: ['v1', 'Users'],
            },
        });
        const tab = useAppStateStore.getState().getTabById(id)!;
        expect(tab.folderPath).toEqual(['My API', 'v1', 'Users']);
        expect(tab.folderPath).not.toContain('Get Users');
    });

    it('collectionRef is stored after save', () => {
        const id = loadAndDirtyTab('tm-ref');
        const ref = { collectionFilename: 'api.json', collectionName: 'My API', itemPath: ['v1'] };
        useAppStateStore.getState().updateTabMetadata(id, {
            name: 'Get Users',
            folderPath: ['My API', 'v1'],
            collectionRef: ref,
        });
        expect(useAppStateStore.getState().getTabById(id)!.collectionRef).toEqual(ref);
    });

    it('subsequent getCollectionRequest uses stored collectionRef for sourceRef', () => {
        const id = loadAndDirtyTab('tm-subsequent');
        const ref = { collectionFilename: 'saved.json', collectionName: 'Saved API', itemPath: ['auth'] };
        useAppStateStore.getState().updateTabMetadata(id, {
            name: 'Login',
            folderPath: ['Saved API', 'auth'],
            collectionRef: ref,
        });
        useAppStateStore.getState().setActiveTab(id);
        const req = useAppStateStore.getState().getCollectionRequest(id);
        expect(req.sourceRef?.collectionFilename).toBe('saved.json');
        expect(req.sourceRef?.collectionName).toBe('Saved API');
        expect(req.sourceRef?.itemPath).toEqual(['auth']);
    });
});
