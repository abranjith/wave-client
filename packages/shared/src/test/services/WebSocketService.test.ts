import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Hoist shared mocks before vi.mock factories ──────────────────────────────
// vi.mock calls are hoisted to the top of the file by Vitest; any class or
// variable they reference must be declared with vi.hoisted to be available.

const { MockWebSocket, lastWsRef } = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require('events') as typeof import('events');

    /**
     * Minimal WebSocket mock backed by EventEmitter.
     * Mirrors the parts of the `ws.WebSocket` API that WebSocketService exercises.
     */
    class MockWebSocket extends EventEmitter {
        static OPEN = 1;
        static CONNECTING = 0;
        static CLOSING = 2;
        static CLOSED = 3;

        readyState: number;
        close: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;

        constructor() {
            super();
            this.readyState = MockWebSocket.CONNECTING;
            this.close = vi.fn((code?: number) => {
                this.readyState = MockWebSocket.CLOSING;
                process.nextTick(() => {
                    this.readyState = MockWebSocket.CLOSED;
                    this.emit('close', code ?? 1000);
                });
            });
            this.send = vi.fn();
        }

        /**
         * Simulate the ws library's upgrade-then-open sequence.
         *
         * The real ws library emits 'upgrade' with the http.IncomingMessage BEFORE
         * setting _req = null and before emitting 'open'. This method replicates
         * that ordering so WebSocketService's 'upgrade' handler captures headers
         * before the 'open' handler runs.
         */
        simulateOpen(responseHeaders?: Record<string, string>): void {
            this.readyState = MockWebSocket.OPEN;
            if (responseHeaders) {
                // Fire 'upgrade' first, just like the real ws library does before
                // nullifying _req and calling setSocket (which emits 'open').
                this.emit('upgrade', { headers: responseHeaders });
            }
            this.emit('open');
        }

        /** Fire the 'message' event with a string payload (converted to Buffer). */
        simulateMessage(data: string): void {
            this.emit('message', Buffer.from(data, 'utf8'));
        }

        /** Fire the 'close' event synchronously. */
        simulateClose(code = 1000): void {
            this.readyState = MockWebSocket.CLOSED;
            this.emit('close', code);
        }

        /** Fire the 'error' event. */
        simulateError(message = 'connection refused'): void {
            this.emit('error', new Error(message));
        }
    }

    /** Mutable reference so test bodies can reach the latest created instance. */
    const lastWsRef = { current: null as MockWebSocket | null };

    return { MockWebSocket, lastWsRef };
});

const { mockGetGlobalSettings } = vi.hoisted(() => ({
    mockGetGlobalSettings: vi.fn(),
}));

// ── Module mocks (hoisted automatically by Vitest) ────────────────────────────

vi.mock('ws', () => {
    // IMPORTANT: Vitest 4.x requires a regular function (not an arrow function) as the
    // vi.fn() implementation when the mock is called as a constructor (`new WebSocket(...)`).
    // Arrow functions cannot be constructors, and Vitest skips the implementation entirely
    // when an arrow function is provided for a constructor call, emitting a warning.
    const MockWsCtor = vi.fn(function MockWsImpl() {
        const instance = new MockWebSocket();
        lastWsRef.current = instance;
        return instance;
    } as unknown as new (url: string, opts?: unknown) => MockWebSocket) as unknown as
        typeof import('ws').default &
        { OPEN: number; CONNECTING: number; CLOSING: number; CLOSED: number };

    MockWsCtor.OPEN = MockWebSocket.OPEN;
    MockWsCtor.CONNECTING = MockWebSocket.CONNECTING;
    MockWsCtor.CLOSING = MockWebSocket.CLOSING;
    MockWsCtor.CLOSED = MockWebSocket.CLOSED;

    return { default: MockWsCtor };
});

vi.mock('../../services/StoreService.js', () => ({
    storeService: {
        getHttpsAgentForUrl: vi.fn().mockResolvedValue(null),
    },
}));

vi.mock('../../services/BaseStorageService.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/BaseStorageService.js')>();
    return {
        ...actual,
        getGlobalSettings: mockGetGlobalSettings,
    };
});

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { WebSocketService, setWsAuthServiceFactory } from '../../services/WebSocketService.js';
import { storeService } from '../../services/StoreService.js';
import type { WsConnectionHandle, WsMessage, ConnectionStatus } from '@wave-client/core';
import { AuthType } from '../../services/auth/types.js';

const mockStoreService = storeService as { getHttpsAgentForUrl: ReturnType<typeof vi.fn> };

/** Convenience accessor so tests don't have to type `lastWsRef.current!` everywhere. */
function lastMockWs(): MockWebSocket {
    if (!lastWsRef.current) throw new Error('No MockWebSocket created yet');
    return lastWsRef.current;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ConnectConfig = Parameters<WebSocketService['connect']>[0];

/** Build a minimal WsConnectionConfig, applying optional overrides. */
function makeConfig(overrides: Partial<ConnectConfig> = {}): ConnectConfig {
    return {
        id: crypto.randomUUID(),
        url: 'ws://localhost:8080/chat',
        ...overrides,
    };
}

/**
 * Open a connection and trigger the 'open' WS event AFTER the handle is built.
 *
 * Calling `simulateOpen()` BEFORE `await handle` only works for synchronous
 * connection paths (ws:// with no auth). For paths that have async steps before
 * `new WebSocket()` (wss://, auth), we must await the handle first — the
 * construct-side microtasks need to flush before `lastWsRef.current` is set.
 */
async function connectAndOpen(
    service: WebSocketService,
    overrides: Partial<ConnectConfig> = {},
    responseHeaders?: Record<string, string>,
): Promise<WsConnectionHandle> {
    const config = makeConfig(overrides);
    const handle = await service.connect(config);
    if (!handle) throw new Error('Expected non-null WsConnectionHandle');
    lastMockWs().simulateOpen(responseHeaders);
    return handle;
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('WebSocketService', () => {
    let service: WebSocketService;

    beforeEach(() => {
        service = new WebSocketService();
        setWsAuthServiceFactory(null);
        lastWsRef.current = null;
        mockGetGlobalSettings.mockResolvedValue({
            saveFilesLocation: '',
            maxRedirects: 5,
            requestTimeoutSeconds: 0,
            maxHistoryItems: 10,
            commonHeaderNames: [],
            encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
            encryptionKeyValidationStatus: 'none',
            ignoreCertificateValidation: false,
        });
        // Avoid vi.clearAllMocks() — in Vitest 4.x it clears inline vi.fn(impl)
        // implementations, which would wipe the ws mock constructor factory.
        // Instead, selectively clear only the mocks that need call-history reset.
        mockStoreService.getHttpsAgentForUrl.mockClear();
        mockStoreService.getHttpsAgentForUrl.mockResolvedValue(null);
    });

    afterEach(() => {
        setWsAuthServiceFactory(null);
    });

    // ── T01: reject non-ws URL scheme ─────────────────────────────────────
    it('T01: returns null when URL scheme is not ws or wss', async () => {
        const handle = await service.connect(makeConfig({ url: 'http://example.com/socket' }));
        expect(handle).toBeNull();
    });

    // ── T02: reject malformed URL ─────────────────────────────────────────
    it('T02: returns null for a malformed URL', async () => {
        const handle = await service.connect(makeConfig({ url: 'not-a-url' }));
        expect(handle).toBeNull();
    });

    // ── T03: valid ws:// URL returns a handle ─────────────────────────────
    it('T03: returns a WsConnectionHandle for a valid ws:// URL', async () => {
        const config = makeConfig({ url: 'ws://localhost:9000' });
        const handlePromise = service.connect(config);
        lastMockWs().simulateOpen();
        const handle = await handlePromise;
        expect(handle).not.toBeNull();
        expect(handle?.connectionId).toBe(config.id);
    });

    // ── T04: wss:// fetches TLS agent ─────────────────────────────────────
    it('T04: retrieves HTTPS agent for wss:// connections', async () => {
        const fakeAgent = { options: { rejectUnauthorized: false } };
        mockStoreService.getHttpsAgentForUrl.mockResolvedValue(fakeAgent);

        const config = makeConfig({ url: 'wss://secure.example.com/ws' });
        // wss:// awaits storeService.getHttpsAgentForUrl BEFORE calling new WebSocket().
        // Await the handle directly so lastWsRef.current is populated when we drive the mock.
        const handle = await service.connect(config);
        expect(handle).not.toBeNull();
        if (handle) lastMockWs().simulateOpen();

        expect(mockStoreService.getHttpsAgentForUrl).toHaveBeenCalledWith(config.url);
    });

    // ── T05: plain ws:// does not fetch TLS agent ─────────────────────────
    it('T05: does not request HTTPS agent for plain ws:// connections', async () => {
        const config = makeConfig({ url: 'ws://localhost:9000/stream' });
        const hp = service.connect(config);
        lastMockWs().simulateOpen();
        await hp;

        expect(mockStoreService.getHttpsAgentForUrl).not.toHaveBeenCalled();
    });

    // ── T06: onStatusChange fires immediately with current status ─────────
    it('T06: onStatusChange fires immediately with current connection status', async () => {
        const handle = await connectAndOpen(service);

        const statuses: ConnectionStatus[] = [];
        handle.onStatusChange((s) => statuses.push(s));

        // Since open already fired, 'connected' should be emitted immediately
        expect(statuses).toContain('connected');
    });

    // ── T07: 'connected' status fires after socket open ───────────────────
    it('T07: emits connected status when the socket opens', async () => {
        const statuses: ConnectionStatus[] = [];
        const config = makeConfig();

        const handlePromise = service.connect(config);
        lastMockWs().simulateOpen();
        const handle = await handlePromise;
        if (!handle) throw new Error('null handle');

        handle.onStatusChange((s) => statuses.push(s));
        expect(statuses).toContain('connected');
    });

    // ── T08: onMessage delivers received messages ─────────────────────────
    it('T08: onMessage delivers incoming text frames with direction=received', async () => {
        const handle = await connectAndOpen(service);

        const msgs: WsMessage[] = [];
        handle.onMessage((m) => msgs.push(m));

        lastMockWs().simulateMessage('{"event":"ping"}');

        expect(msgs).toHaveLength(1);
        expect(msgs[0].direction).toBe('received');
        expect(msgs[0].content).toBe('{"event":"ping"}');
    });

    // ── T09: unsubscribe stops onMessage callbacks ────────────────────────
    it('T09: unsubscribing from onMessage stops future callbacks', async () => {
        const handle = await connectAndOpen(service);

        const msgs: WsMessage[] = [];
        const unsub = handle.onMessage((m) => msgs.push(m));

        lastMockWs().simulateMessage('first');
        unsub();
        lastMockWs().simulateMessage('second');

        expect(msgs).toHaveLength(1);
        expect(msgs[0].content).toBe('first');
    });

    // ── T10: onHeaders subscription is functional ─────────────────────────
    it('T10: onHeaders callback registration returns an unsubscribe function', async () => {
        const handle = await connectAndOpen(service, {}, { 'x-server-id': 'node-1' });

        // Verify the method returns a callable unsubscribe
        const unsub = handle.onHeaders((_h) => {});
        expect(typeof unsub).toBe('function');
    });

    // ── T10b: late onHeaders subscribers receive cached handshake headers ─
    it('T10b: late onHeaders subscriber immediately receives cached headers after open', async () => {
        const handle = await connectAndOpen(service, {}, { 'sec-websocket-protocol': 'chat' });

        const headersSeen: Record<string, string>[] = [];
        handle.onHeaders((headers) => headersSeen.push(headers));

        expect(headersSeen).toEqual([{ 'sec-websocket-protocol': 'chat' }]);
    });

    // ── T10c: early onHeaders subscriber receives headers via upgrade event ──
    it('T10c: early onHeaders subscriber receives upgrade headers when open fires', async () => {
        // Mirrors the real production pattern: useWsConnection registers onHeaders
        // on the handle BEFORE the network 'open' event fires.
        const config = makeConfig();
        const handle = await service.connect(config);
        if (!handle) throw new Error('Expected non-null WsConnectionHandle');

        const headersSeen: Record<string, string>[] = [];
        handle.onHeaders((headers) => headersSeen.push(headers));

        // Simulate the ws library sequence: 'upgrade' fires first with response
        // headers, then 'open' fires (at which point _req is already null in the
        // real ws library — hence why we no longer rely on _req?.res?.headers).
        lastMockWs().simulateOpen({ 'upgrade': 'websocket', 'sec-websocket-accept': 'abc123' });

        expect(headersSeen).toEqual([{ 'upgrade': 'websocket', 'sec-websocket-accept': 'abc123' }]);
    });

    // ── T11: onError delivers error messages ─────────────────────────────
    it('T11: onError delivers the error message string', async () => {
        const handle = await connectAndOpen(service);

        const errors: string[] = [];
        handle.onError((e) => errors.push(e));

        lastMockWs().simulateError('ECONNREFUSED');

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('ECONNREFUSED');
    });

    // ── T12: status transitions to error on ws error ──────────────────────
    it('T12: status transitions to error when socket emits error', async () => {
        const handle = await connectAndOpen(service);

        const statuses: ConnectionStatus[] = [];
        handle.onStatusChange((s) => statuses.push(s));

        lastMockWs().simulateError('network failure');

        expect(statuses).toContain('error');
    });

    // ── T13: disconnect sends close frame ────────────────────────────────
    it('T13: disconnect sends a close frame and returns ok()', async () => {
        const handle = await connectAndOpen(service);

        const statuses: ConnectionStatus[] = [];
        handle.onStatusChange((s) => statuses.push(s));

        const result = await service.disconnect(handle.connectionId);

        expect(result.isOk).toBe(true);
        expect(lastMockWs().close).toHaveBeenCalledWith(1000, 'client disconnect');
        expect(statuses).toContain('disconnecting');
    });

    // ── T14: disconnect returns err for unknown id ────────────────────────
    it('T14: disconnect returns err when connection id is unknown', async () => {
        const result = await service.disconnect('nonexistent-id');
        expect(result.isOk).toBe(false);
        expect((result as { isOk: false; error: string }).error).toMatch(/no connection/i);
    });

    // ── T15: connection limit ────────────────────────────────────────────
    it('T15: returns null when MAX_CONNECTIONS (10) limit is reached', async () => {
        // Fill the service with 10 open connections
        for (let i = 0; i < 10; i++) {
            const hp = service.connect(makeConfig({ id: `conn-${i}`, url: 'ws://localhost:8080/fill' }));
            lastMockWs().simulateOpen();
            await hp;
        }

        // 11th should be rejected
        const over = await service.connect(makeConfig({ id: 'over-limit', url: 'ws://localhost:8080/fill' }));
        expect(over).toBeNull();
    });

    // ── T16: sendMessage calls ws.send ───────────────────────────────────
    it('T16: sendMessage calls ws.send and returns ok()', async () => {
        const handle = await connectAndOpen(service);

        const result = await service.sendMessage(handle.connectionId, 'hello world');

        expect(result.isOk).toBe(true);
        expect(lastMockWs().send).toHaveBeenCalledWith('hello world');
    });

    // ── T17: sendMessage echoes to onMessage with direction=sent ──────────
    it('T17: sendMessage echoes sent message with direction=sent to onMessage listeners', async () => {
        const handle = await connectAndOpen(service);

        const msgs: WsMessage[] = [];
        handle.onMessage((m) => msgs.push(m));

        await service.sendMessage(handle.connectionId, 'ping');

        expect(msgs).toHaveLength(1);
        expect(msgs[0].direction).toBe('sent');
        expect(msgs[0].content).toBe('ping');
    });

    // ── T18: sendMessage returns err for unknown id ───────────────────────
    it('T18: sendMessage returns err when connection id is unknown', async () => {
        const result = await service.sendMessage('nonexistent-id', 'hello');
        expect(result.isOk).toBe(false);
        expect((result as { isOk: false; error: string }).error).toMatch(/no connection/i);
    });

    // ── T19: sendMessage returns err if not OPEN ──────────────────────────
    it('T19: sendMessage returns err when readyState is not OPEN', async () => {
        const handle = await connectAndOpen(service);

        // Simulate socket mid-close
        lastMockWs().readyState = MockWebSocket.CLOSING;

        const result = await service.sendMessage(handle.connectionId, 'late message');
        expect(result.isOk).toBe(false);
        expect((result as { isOk: false; error: string }).error).toMatch(/not OPEN/i);
    });

    // ── T20: query params appended ───────────────────────────────────────
    it('T20: appends query params to the WebSocket URL', async () => {
        const { default: MockWsCtor } = await import('ws');
        const wsMock = MockWsCtor as unknown as ReturnType<typeof vi.fn>;

        const config = makeConfig({ url: 'ws://api.example.com/ws', params: 'token=abc&v=2' });
        const hp = service.connect(config);
        lastMockWs().simulateOpen();
        await hp;

        const lastCall = wsMock.mock.calls[wsMock.mock.calls.length - 1];
        expect(lastCall[0]).toBe('ws://api.example.com/ws?token=abc&v=2');
    });

    // ── T21: custom headers propagated ───────────────────────────────────
    it('T21: passes custom headers to the WebSocket constructor', async () => {
        const { default: MockWsCtor } = await import('ws');
        const wsMock = MockWsCtor as unknown as ReturnType<typeof vi.fn>;

        const config = makeConfig({
            url: 'ws://api.example.com/ws',
            headers: { 'X-Client-Id': 'test-123' },
        });
        const hp = service.connect(config);
        lastMockWs().simulateOpen();
        await hp;

        const lastCall = wsMock.mock.calls[wsMock.mock.calls.length - 1];
        expect(lastCall[1].headers['X-Client-Id']).toBe('test-123');
    });

    // ── T22: auth factory headers merged into upgrade request ─────────────
    it('T22: auth headers from the factory are merged into upgrade headers', async () => {
        const { default: MockWsCtor } = await import('ws');
        const wsMock = MockWsCtor as unknown as ReturnType<typeof vi.fn>;

        const mockAuthResult = { isOk: true as const, value: { headers: { Authorization: 'Bearer test-token' } } };
        const mockAuthSvc = { applyAuth: vi.fn().mockResolvedValue(mockAuthResult) };
        const mockFactory = { getService: vi.fn().mockReturnValue(mockAuthSvc) };
        setWsAuthServiceFactory(mockFactory);

        const config = makeConfig({
            url: 'ws://api.example.com/ws',
            auth: { type: AuthType.OAUTH2_REFRESH, enabled: true } as ConnectConfig['auth'],
        });
        // Auth resolution has an await before new WebSocket(), so await the handle first
        const handle = await service.connect(config);
        expect(handle).not.toBeNull();

        const lastCall = wsMock.mock.calls[wsMock.mock.calls.length - 1];
        expect(lastCall[1].headers['Authorization']).toBe('Bearer test-token');
    });

    // ── T23: Digest auth is skipped with a console.warn ───────────────────
    it('T23: skips Digest auth and emits a console.warn, proceeding without auth headers', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const mockFactory = { getService: vi.fn() };
        setWsAuthServiceFactory(mockFactory);

        const config = makeConfig({
            url: 'ws://api.example.com/ws',
            auth: { type: AuthType.DIGEST, enabled: true } as ConnectConfig['auth'],
        });
        // Auth path has an await before new WebSocket(), so await the handle first
        const handle = await service.connect(config);

        expect(handle).not.toBeNull();
        // Factory must NOT be consulted — digest is rejected before getService
        expect(mockFactory.getService).not.toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('digest'),
        );

        consoleWarnSpy.mockRestore();
    });

    // ── T24: abnormal close should be treated as error ────────────────────
    it('T24: emits error status and onError message when closed with abnormal code', async () => {
        const handle = await connectAndOpen(service);

        const statuses: ConnectionStatus[] = [];
        const errors: string[] = [];
        handle.onStatusChange((s) => statuses.push(s));
        handle.onError((e) => errors.push(e));

        lastMockWs().simulateClose(1006);

        expect(statuses).toContain('error');
        expect(errors.some((e) => e.includes('1006'))).toBe(true);
    });

    // ── T25: terminal handling is idempotent across error + close ─────────
    it('T25: processes only the first terminal event when error and close both fire', async () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
        const handle = await connectAndOpen(service);

        const statuses: ConnectionStatus[] = [];
        const errors: string[] = [];
        handle.onStatusChange((s) => statuses.push(s));
        handle.onError((e) => errors.push(e));

        lastMockWs().simulateError('socket hang up');
        lastMockWs().simulateClose(1006);

        const disconnectLogs = infoSpy.mock.calls.filter((call) =>
            String(call[0]).includes(`[WebSocketService] disconnected id=${handle.connectionId}`),
        );

        expect(disconnectLogs).toHaveLength(1);
        expect(statuses.filter((s) => s === 'error')).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('socket hang up');

        infoSpy.mockRestore();
    });

    // ── T26: self-signed cert error includes actionable guidance ───────────
    it('T26: maps self-signed certificate errors to actionable TLS guidance', async () => {
        const handle = await connectAndOpen(service, { url: 'wss://localhost:7192/api/ws/Echo' });

        const errors: string[] = [];
        handle.onError((e) => errors.push(e));

        lastMockWs().simulateError('self-signed certificate');

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('self-signed certificate');
        expect(errors[0]).toContain('TLS certificate is not trusted');
        expect(errors[0]).toContain('configure Wave Client certificate settings');
    });

    // ── T27: global ignoreCertificateValidation applies to WebSocket TLS ──
    it('T27: sets rejectUnauthorized=false for wss when ignoreCertificateValidation is enabled', async () => {
        const { default: MockWsCtor } = await import('ws');
        const wsMock = MockWsCtor as unknown as ReturnType<typeof vi.fn>;

        mockGetGlobalSettings.mockResolvedValue({
            saveFilesLocation: '',
            maxRedirects: 5,
            requestTimeoutSeconds: 0,
            maxHistoryItems: 10,
            commonHeaderNames: [],
            encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
            encryptionKeyValidationStatus: 'none',
            ignoreCertificateValidation: true,
        });

        const handle = await service.connect(makeConfig({ url: 'wss://secure.example.com/ws' }));
        expect(handle).not.toBeNull();

        const lastCall = wsMock.mock.calls[wsMock.mock.calls.length - 1];
        const wsOptions = lastCall[1] as {
            agent?: { options?: { rejectUnauthorized?: boolean } };
        };

        expect(wsOptions.agent).toBeDefined();
        expect(wsOptions.agent?.options.rejectUnauthorized).toBe(false);
    });
});
