import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSseConnect = vi.fn();
const mockSseDisconnect = vi.fn();
const mockBroadcast = vi.fn();

vi.mock('@wave-client/shared', () => ({
    sseService: {
        connect: mockSseConnect,
        disconnect: mockSseDisconnect,
    },
}));

vi.mock('../../services/websocket.js', () => ({
    broadcast: mockBroadcast,
}));

interface MockSseHandle {
    connectionId: string;
    onStatusChange: ReturnType<typeof vi.fn>;
    onEvent: ReturnType<typeof vi.fn>;
    onHeaders: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
    _emitStatus: (status: string) => void;
    _emitEvent: (event: unknown) => void;
    _emitHeaders: (headers: Record<string, string>) => void;
    _emitError: (error: string) => void;
}

function createMockSseHandle(connectionId: string): MockSseHandle {
    const statusListeners = new Set<(status: string) => void>();
    const eventListeners = new Set<(event: unknown) => void>();
    const headerListeners = new Set<(headers: Record<string, string>) => void>();
    const errorListeners = new Set<(error: string) => void>();

    return {
        connectionId,
        onStatusChange: vi.fn((cb: (status: string) => void) => {
            statusListeners.add(cb);
            return () => statusListeners.delete(cb);
        }),
        onEvent: vi.fn((cb: (event: unknown) => void) => {
            eventListeners.add(cb);
            return () => eventListeners.delete(cb);
        }),
        onHeaders: vi.fn((cb: (headers: Record<string, string>) => void) => {
            headerListeners.add(cb);
            return () => headerListeners.delete(cb);
        }),
        onError: vi.fn((cb: (error: string) => void) => {
            errorListeners.add(cb);
            return () => errorListeners.delete(cb);
        }),
        _emitStatus: (status) => {
            statusListeners.forEach((cb) => cb(status));
        },
        _emitEvent: (event) => {
            eventListeners.forEach((cb) => cb(event));
        },
        _emitHeaders: (headers) => {
            headerListeners.forEach((cb) => cb(headers));
        },
        _emitError: (error) => {
            errorListeners.forEach((cb) => cb(error));
        },
    };
}

describe('registerRealtimeSseRoutes', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        const { registerRealtimeSseRoutes } = await import('../../routes/realtime-sse.js');
        app = Fastify();
        await registerRealtimeSseRoutes(app);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('returns 400 when connect payload is missing required config fields', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: {
                config: {
                    id: 'sse-1',
                },
            },
        });

        expect(response.statusCode).toBe(400);
        expect(mockSseConnect).not.toHaveBeenCalled();
    });

    it('returns 500 when sse service connect returns null', async () => {
        mockSseConnect.mockResolvedValueOnce(null);

        const response = await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: {
                config: {
                    id: 'sse-null',
                    method: 'GET',
                    url: 'https://example.com/events',
                },
            },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ isOk: false, error: 'Connection failed' });
    });

    it('connects successfully and registers all realtime callbacks', async () => {
        const handle = createMockSseHandle('sse-2');
        mockSseConnect.mockResolvedValueOnce(handle);

        const config = {
            id: 'sse-2',
            method: 'POST',
            url: 'https://example.com/events',
            body: { subscribe: true },
        };

        const response = await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: { config },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ isOk: true, value: { connectionId: 'sse-2' } });
        expect(mockSseConnect).toHaveBeenCalledWith(config);
        expect(handle.onStatusChange).toHaveBeenCalledOnce();
        expect(handle.onEvent).toHaveBeenCalledOnce();
        expect(handle.onHeaders).toHaveBeenCalledOnce();
        expect(handle.onError).toHaveBeenCalledOnce();
    });

    it('broadcasts status, event, and headers callbacks', async () => {
        const handle = createMockSseHandle('sse-3');
        mockSseConnect.mockResolvedValueOnce(handle);

        await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: {
                config: {
                    id: 'sse-3',
                    method: 'GET',
                    url: 'https://example.com/events',
                },
            },
        });

        const sseEvent = {
            id: 'evt-1',
            eventName: 'message',
            data: '{"ok":true}',
            timestamp: Date.now(),
        };

        handle._emitStatus('connected');
        handle._emitEvent(sseEvent);
        handle._emitHeaders({ 'content-type': 'text/event-stream' });

        expect(mockBroadcast).toHaveBeenCalledWith('sse.status', {
            connectionId: 'sse-3',
            status: 'connected',
        });
        expect(mockBroadcast).toHaveBeenCalledWith('sse.event', {
            connectionId: 'sse-3',
            event: sseEvent,
        });
        expect(mockBroadcast).toHaveBeenCalledWith('sse.headers', {
            connectionId: 'sse-3',
            headers: { 'content-type': 'text/event-stream' },
        });
    });

    it('broadcasts error and removes connection after error callback', async () => {
        const handle = createMockSseHandle('sse-4');
        mockSseConnect.mockResolvedValueOnce(handle);

        await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: {
                config: {
                    id: 'sse-4',
                    method: 'GET',
                    url: 'https://example.com/events',
                },
            },
        });

        handle._emitError('stream failed');

        expect(mockBroadcast).toHaveBeenCalledWith('sse.error', {
            connectionId: 'sse-4',
            error: 'stream failed',
        });

        const disconnectResponse = await app.inject({
            method: 'POST',
            url: '/api/sse/disconnect',
            payload: { connectionId: 'sse-4' },
        });

        expect(disconnectResponse.statusCode).toBe(200);
        expect(disconnectResponse.json()).toEqual({ isOk: true, value: undefined });
        expect(mockSseDisconnect).not.toHaveBeenCalled();
    });

    it('disconnects active SSE stream and is idempotent for missing ids', async () => {
        const handle = createMockSseHandle('sse-5');
        mockSseConnect.mockResolvedValueOnce(handle);
        mockSseDisconnect.mockResolvedValue({ isOk: true, value: undefined });

        await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: {
                config: {
                    id: 'sse-5',
                    method: 'GET',
                    url: 'https://example.com/events',
                },
            },
        });

        const first = await app.inject({
            method: 'POST',
            url: '/api/sse/disconnect',
            payload: { connectionId: 'sse-5' },
        });
        expect(first.statusCode).toBe(200);
        expect(mockSseDisconnect).toHaveBeenCalledWith('sse-5');

        const second = await app.inject({
            method: 'POST',
            url: '/api/sse/disconnect',
            payload: { connectionId: 'sse-5' },
        });
        expect(second.statusCode).toBe(200);
        expect(mockSseDisconnect).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when disconnect reports service failure', async () => {
        const handle = createMockSseHandle('sse-6');
        mockSseConnect.mockResolvedValueOnce(handle);
        mockSseDisconnect.mockResolvedValueOnce({ isOk: false, error: 'disconnect failed' });

        await app.inject({
            method: 'POST',
            url: '/api/sse/connect',
            payload: {
                config: {
                    id: 'sse-6',
                    method: 'GET',
                    url: 'https://example.com/events',
                },
            },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/sse/disconnect',
            payload: { connectionId: 'sse-6' },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ isOk: false, error: 'disconnect failed' });
    });
});
