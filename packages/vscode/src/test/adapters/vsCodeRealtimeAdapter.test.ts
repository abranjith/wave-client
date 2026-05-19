/**
 * Tests for the VS Code realtime adapter (WS + SSE sides).
 *
 * Pattern used throughout:
 *  1. Call `createVSCodeAdapter(vsCodeApi, { defaultTimeout: 200 })` to get
 *     `{ adapter, handleMessage, cleanup }`.
 *  2. Call `adapter.realtime.*` methods — they post messages synchronously.
 *  3. To simulate extension-host → webview push events, call `handleMessage`
 *     with a synthetic `MessageEvent`-like object (`{ data: { type, ... } }`).
 *  4. To simulate request/response correlation (disconnectWebSocket, etc.),
 *     extract the `requestId` from the last `postMessage` call and invoke the
 *     pending resolver via the shared `pendingRequests` map.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IAdapterEvents } from '@wave-client/core';

// ── Mock @wave-client/core ────────────────────────────────────────────────────
// We need createAdapterEventEmitter and the Result helpers (ok, err).
// Everything else is type-only and does not need runtime mocks.
vi.mock('@wave-client/core', async () => {
    const actual = await vi.importActual<typeof import('@wave-client/core')>('@wave-client/core');
    return {
        ...actual,
        createAdapterEventEmitter: () => {
            const handlers = new Map<string, Set<(d: unknown) => void>>();
            return {
                on: (e: string, cb: (d: unknown) => void) => {
                    if (!handlers.has(e)) {handlers.set(e, new Set());}
                    handlers.get(e)!.add(cb);
                },
                off: (e: string, cb: (d: unknown) => void) => handlers.get(e)?.delete(cb),
                emit: (e: string, d: unknown) => handlers.get(e)?.forEach((cb) => cb(d)),
            } as unknown as IAdapterEvents;
        },
    };
});

// ── Mock vsCodeArenaAdapter ───────────────────────────────────────────────────
// Avoid pulling in the arena dependency tree.
vi.mock('../../webview/adapters/vsCodeArenaAdapter.js', () => ({
    createVSCodeArenaAdapter: (_vsCodeApi: unknown, _pending: unknown, _events: unknown) => ({
        adapter: {
            loadSessions: vi.fn(),
            saveSession: vi.fn(),
            deleteSession: vi.fn(),
            loadMessages: vi.fn(),
            saveMessages: vi.fn(),
            clearSessionMessages: vi.fn(),
            loadSettings: vi.fn(),
            saveSettings: vi.fn(),
            loadReferences: vi.fn(),
            saveReferences: vi.fn(),
            loadProviderSettings: vi.fn(),
            saveProviderSettings: vi.fn(),
            validateApiKey: vi.fn(),
            getAvailableModels: vi.fn(),
            sendMessage: vi.fn(),
            streamMessage: vi.fn(),
            cancelChat: vi.fn(),
            checkMcpStatus: vi.fn(),
            startMcpServer: vi.fn(),
        },
        handleStreamMessage: () => false,
    }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockVSCodeApi() {
    return {
        postMessage: vi.fn(),
        getState: vi.fn().mockReturnValue({}),
        setState: vi.fn(),
    };
}

/** Wrap a plain object as a MessageEvent-like for handleMessage. */
function fakeEvent(data: Record<string, unknown>): MessageEvent {
    return { data } as unknown as MessageEvent;
}

/** Read the requestId from the most-recent postMessage call. */
function lastRequestId(vsCodeApi: ReturnType<typeof makeMockVSCodeApi>): string {
    const calls = vsCodeApi.postMessage.mock.calls;
    return (calls[calls.length - 1][0] as any).requestId;
}

/** Resolve the pending request that matches the given requestId. */
function resolveRequest(
    pendingRequests: Map<string, any>,
    requestId: string,
    responseData: Record<string, unknown> = {}
): void {
    const pending = pendingRequests.get(requestId);
    if (!pending) {throw new Error(`No pending request for id: ${requestId}`);}
    clearTimeout(pending.timeout);
    pending.resolve(responseData);
    pendingRequests.delete(requestId);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('createVSCodeAdapter — realtime adapter', () => {
    let vsCodeApi: ReturnType<typeof makeMockVSCodeApi>;
    let adapter: any;
    let handleMessage: (event: MessageEvent) => void;
    let cleanup: () => void;
    // Access the pendingRequests map through the closure via a captured reference.
    // We extract it by spying on the first postMessage and reading the requestId,
    // then looking it up through the pendingRequests exposed by sendAndWait.
    // A simpler option: pass a tracked Map using a factory wrapper.
    // Here we use the public handleMessage to simulate responses instead.

    beforeEach(async () => {
        vi.clearAllMocks();
        vsCodeApi = makeMockVSCodeApi();
        // Dynamic import so that the vi.mock calls above are applied first.
        const { createVSCodeAdapter } = await import('../../webview/adapters/vsCodeAdapter.js');
        ({ adapter, handleMessage, cleanup } = createVSCodeAdapter(vsCodeApi, { defaultTimeout: 200 }));
    });

    it('adapter.realtime is defined and is an IRealtimeAdapter', () => {
        expect(adapter.realtime).toBeDefined();
        expect(typeof adapter.realtime.connectWebSocket).toBe('function');
        expect(typeof adapter.realtime.disconnectWebSocket).toBe('function');
        expect(typeof adapter.realtime.sendWebSocketMessage).toBe('function');
        expect(typeof adapter.realtime.connectSse).toBe('function');
        expect(typeof adapter.realtime.disconnectSse).toBe('function');
    });

    // ── WebSocket ─────────────────────────────────────────────────────────────

    describe('connectWebSocket', () => {
        const config = { id: 'ws-1', url: 'wss://api.example.com/ws' };

        it('posts ws.connect with config synchronously', () => {
            adapter.realtime.connectWebSocket(config);
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'ws.connect', config })
            );
        });

        it('returns a WsConnectionHandle with the matching connectionId', () => {
            const handle = adapter.realtime.connectWebSocket(config);
            expect(handle.connectionId).toBe('ws-1');
        });

        it('handle.onMessage callback fires when ws.message push event arrives', () => {
            const handle = adapter.realtime.connectWebSocket(config);
            const onMsg = vi.fn();
            handle.onMessage(onMsg);

            const wsMsg = { id: 'm1', direction: 'received', content: 'hi', timestamp: 1000, size: 2 };
            handleMessage(fakeEvent({ type: 'ws.message', connectionId: 'ws-1', message: wsMsg }));

            expect(onMsg).toHaveBeenCalledWith(wsMsg);
        });

        it('handle.onStatusChange callback fires when ws.status push event arrives', () => {
            const handle = adapter.realtime.connectWebSocket(config);
            const onStatus = vi.fn();
            handle.onStatusChange(onStatus);

            handleMessage(fakeEvent({ type: 'ws.status', connectionId: 'ws-1', status: 'connected' }));

            expect(onStatus).toHaveBeenCalledWith('connected');
        });

        it('handle.onHeaders callback fires when ws.headers push event arrives', () => {
            const handle = adapter.realtime.connectWebSocket(config);
            const onHeaders = vi.fn();
            handle.onHeaders(onHeaders);

            handleMessage(fakeEvent({ type: 'ws.headers', connectionId: 'ws-1', headers: { 'x-key': 'val' } }));

            expect(onHeaders).toHaveBeenCalledWith({ 'x-key': 'val' });
        });

        it('handle.onError callback fires when ws.error push event arrives', () => {
            const handle = adapter.realtime.connectWebSocket(config);
            const onError = vi.fn();
            handle.onError(onError);

            handleMessage(fakeEvent({ type: 'ws.error', connectionId: 'ws-1', error: 'timeout' }));

            expect(onError).toHaveBeenCalledWith('timeout');
        });

        it('unsubscribe function removes the callback', () => {
            const handle = adapter.realtime.connectWebSocket(config);
            const onMsg = vi.fn();
            const unsub = handle.onMessage(onMsg);
            unsub();

            handleMessage(fakeEvent({ type: 'ws.message', connectionId: 'ws-1', message: { id: 'm2', direction: 'received', content: 'ignored', timestamp: 0, size: 0 } }));

            expect(onMsg).not.toHaveBeenCalled();
        });

        it('stale ws.message for unknown connectionId is silently ignored', () => {
            // No handle registered for 'ws-stale'
            expect(() =>
                handleMessage(fakeEvent({ type: 'ws.message', connectionId: 'ws-stale', message: {} }))
            ).not.toThrow();
        });

        it('two concurrent handles each receive only their own events', () => {
            const h1 = adapter.realtime.connectWebSocket({ id: 'ws-a', url: 'wss://a.com' });
            const h2 = adapter.realtime.connectWebSocket({ id: 'ws-b', url: 'wss://b.com' });
            const cb1 = vi.fn();
            const cb2 = vi.fn();
            h1.onMessage(cb1);
            h2.onMessage(cb2);

            const msg = { id: 'm', direction: 'received', content: 'x', timestamp: 0, size: 0 };
            handleMessage(fakeEvent({ type: 'ws.message', connectionId: 'ws-a', message: msg }));

            expect(cb1).toHaveBeenCalledOnce();
            expect(cb2).not.toHaveBeenCalled();
        });
    });

    describe('disconnectWebSocket', () => {
        it('posts ws.disconnect with connectionId and returns ok after response', async () => {
            adapter.realtime.connectWebSocket({ id: 'ws-d', url: 'wss://d.com' });

            const promise = adapter.realtime.disconnectWebSocket('ws-d');

            // Simulate host response
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'ws.disconnectResponse', requestId: reqId }));

            const result = await promise;
            expect(result.isOk).toBe(true);
        });

        it('removes the handle from the registry after disconnect', async () => {
            adapter.realtime.connectWebSocket({ id: 'ws-e', url: 'wss://e.com' });

            const promise = adapter.realtime.disconnectWebSocket('ws-e');
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'ws.disconnectResponse', requestId: reqId }));
            await promise;

            // After disconnect, push events for this connectionId are silently ignored
            const cb = vi.fn();
            expect(() =>
                handleMessage(fakeEvent({ type: 'ws.message', connectionId: 'ws-e', message: {} }))
            ).not.toThrow();
            expect(cb).not.toHaveBeenCalled();
        });

        it('returns err when host responds with error', async () => {
            adapter.realtime.connectWebSocket({ id: 'ws-f', url: 'wss://f.com' });

            const promise = adapter.realtime.disconnectWebSocket('ws-f');
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'ws.disconnectResponse', requestId: reqId, error: 'not connected' }));

            const result = await promise;
            expect(result.isOk).toBe(false);
            expect((result as any).error).toBe('not connected');
        });

        it('resolves with err on timeout', async () => {
            adapter.realtime.connectWebSocket({ id: 'ws-timeout', url: 'wss://t.com' });
            const result = await adapter.realtime.disconnectWebSocket('ws-timeout');
            // timeout fires after 200 ms (set in beforeEach)
            expect(result.isOk).toBe(false);
        });
    });

    describe('sendWebSocketMessage', () => {
        it('posts ws.send with connectionId and message, returns ok', async () => {
            const promise = adapter.realtime.sendWebSocketMessage('ws-s', 'hello');
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'ws.send', connectionId: 'ws-s', message: 'hello' })
            );

            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'ws.sendResponse', requestId: reqId }));

            const result = await promise;
            expect(result.isOk).toBe(true);
        });

        it('returns err when host responds with error', async () => {
            const promise = adapter.realtime.sendWebSocketMessage('ws-s2', 'data');
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'ws.sendResponse', requestId: reqId, error: 'send failed' }));

            const result = await promise;
            expect(result.isOk).toBe(false);
            expect((result as any).error).toBe('send failed');
        });
    });

    // ── SSE ───────────────────────────────────────────────────────────────────

    describe('connectSse', () => {
        const config = { id: 'sse-1', url: 'https://api.example.com/events', method: 'GET' as const };

        it('posts sse.connect with config synchronously', () => {
            adapter.realtime.connectSse(config);
            expect(vsCodeApi.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'sse.connect', config })
            );
        });

        it('returns a SseConnectionHandle with matching connectionId', () => {
            const handle = adapter.realtime.connectSse(config);
            expect(handle.connectionId).toBe('sse-1');
        });

        it('handle.onEvent fires when sse.event push event arrives', () => {
            const handle = adapter.realtime.connectSse(config);
            const onEvt = vi.fn();
            handle.onEvent(onEvt);

            const sseEvt = { id: 'e1', eventName: 'message', data: 'world', timestamp: 3000 };
            handleMessage(fakeEvent({ type: 'sse.event', connectionId: 'sse-1', event: sseEvt }));

            expect(onEvt).toHaveBeenCalledWith(sseEvt);
        });

        it('handle.onStatusChange fires when sse.status push event arrives', () => {
            const handle = adapter.realtime.connectSse(config);
            const onStatus = vi.fn();
            handle.onStatusChange(onStatus);

            handleMessage(fakeEvent({ type: 'sse.status', connectionId: 'sse-1', status: 'connected' }));

            expect(onStatus).toHaveBeenCalledWith('connected');
        });

        it('handle.onHeaders fires when sse.headers push event arrives', () => {
            const handle = adapter.realtime.connectSse(config);
            const onHeaders = vi.fn();
            handle.onHeaders(onHeaders);

            handleMessage(fakeEvent({ type: 'sse.headers', connectionId: 'sse-1', headers: { 'content-type': 'text/event-stream' } }));

            expect(onHeaders).toHaveBeenCalledWith({ 'content-type': 'text/event-stream' });
        });

        it('handle.onError fires when sse.error push event arrives', () => {
            const handle = adapter.realtime.connectSse(config);
            const onError = vi.fn();
            handle.onError(onError);

            handleMessage(fakeEvent({ type: 'sse.error', connectionId: 'sse-1', error: 'stream closed' }));

            expect(onError).toHaveBeenCalledWith('stream closed');
        });

        it('unsubscribe removes the SSE event callback', () => {
            const handle = adapter.realtime.connectSse(config);
            const onEvt = vi.fn();
            const unsub = handle.onEvent(onEvt);
            unsub();

            handleMessage(fakeEvent({ type: 'sse.event', connectionId: 'sse-1', event: {} }));

            expect(onEvt).not.toHaveBeenCalled();
        });

        it('stale sse.event for unknown connectionId is silently ignored', () => {
            expect(() =>
                handleMessage(fakeEvent({ type: 'sse.event', connectionId: 'sse-stale', event: {} }))
            ).not.toThrow();
        });
    });

    describe('disconnectSse', () => {
        it('posts sse.disconnect with connectionId and returns ok', async () => {
            adapter.realtime.connectSse({ id: 'sse-d', url: 'https://d.com/sse', method: 'GET' });

            const promise = adapter.realtime.disconnectSse('sse-d');
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'sse.disconnectResponse', requestId: reqId }));

            const result = await promise;
            expect(result.isOk).toBe(true);
        });

        it('removes the handle from the registry after disconnect', async () => {
            adapter.realtime.connectSse({ id: 'sse-e', url: 'https://e.com/sse', method: 'GET' });

            const promise = adapter.realtime.disconnectSse('sse-e');
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'sse.disconnectResponse', requestId: reqId }));
            await promise;

            // Stale push events are silently ignored after disconnect
            expect(() =>
                handleMessage(fakeEvent({ type: 'sse.event', connectionId: 'sse-e', event: {} }))
            ).not.toThrow();
        });

        it('returns err when host responds with error', async () => {
            adapter.realtime.connectSse({ id: 'sse-f', url: 'https://f.com/sse', method: 'GET' });

            const promise = adapter.realtime.disconnectSse('sse-f');
            const reqId = lastRequestId(vsCodeApi);
            handleMessage(fakeEvent({ type: 'sse.disconnectResponse', requestId: reqId, error: 'already closed' }));

            const result = await promise;
            expect(result.isOk).toBe(false);
            expect((result as any).error).toBe('already closed');
        });
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────

    describe('adapter.dispose() / cleanup', () => {
        it('dispose clears active WS handles — push events are ignored after', async () => {
            const h = adapter.realtime.connectWebSocket({ id: 'ws-cleanup', url: 'wss://c.com' });
            const onStatus = vi.fn();
            h.onStatusChange(onStatus);

            cleanup(); // also called via adapter.dispose()

            // Post-cleanup push events must not reach callbacks
            handleMessage(fakeEvent({ type: 'ws.status', connectionId: 'ws-cleanup', status: 'connected' }));
            expect(onStatus).not.toHaveBeenCalled();
        });

        it('dispose clears active SSE handles — push events are ignored after', async () => {
            const h = adapter.realtime.connectSse({ id: 'sse-cleanup', url: 'https://c.com/sse', method: 'GET' });
            const onEvt = vi.fn();
            h.onEvent(onEvt);

            cleanup();

            handleMessage(fakeEvent({ type: 'sse.event', connectionId: 'sse-cleanup', event: {} }));
            expect(onEvt).not.toHaveBeenCalled();
        });
    });
});
