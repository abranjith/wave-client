import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWsConnect = vi.fn();
const mockWsDisconnect = vi.fn();
const mockWsSendMessage = vi.fn();
const mockBroadcast = vi.fn();

vi.mock('@wave-client/shared', () => ({
    webSocketService: {
        connect: mockWsConnect,
        disconnect: mockWsDisconnect,
        sendMessage: mockWsSendMessage,
    },
}));

vi.mock('../../services/websocket.js', () => ({
    broadcast: mockBroadcast,
}));

interface MockWsHandle {
    connectionId: string;
    onStatusChange: ReturnType<typeof vi.fn>;
    onMessage: ReturnType<typeof vi.fn>;
    onHeaders: ReturnType<typeof vi.fn>;
    onError: ReturnType<typeof vi.fn>;
    _emitStatus: (status: string) => void;
    _emitMessage: (message: unknown) => void;
    _emitHeaders: (headers: Record<string, string>) => void;
    _emitError: (error: string) => void;
}

function createMockWsHandle(connectionId: string, initialStatus = 'connected'): MockWsHandle {
    const statusListeners = new Set<(status: string) => void>();
    const messageListeners = new Set<(message: unknown) => void>();
    const headerListeners = new Set<(headers: Record<string, string>) => void>();
    const errorListeners = new Set<(error: string) => void>();

    return {
        connectionId,
        onStatusChange: vi.fn((cb: (status: string) => void) => {
            statusListeners.add(cb);
            cb(initialStatus);
            return () => statusListeners.delete(cb);
        }),
        onMessage: vi.fn((cb: (message: unknown) => void) => {
            messageListeners.add(cb);
            return () => messageListeners.delete(cb);
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
        _emitMessage: (message) => {
            messageListeners.forEach((cb) => cb(message));
        },
        _emitHeaders: (headers) => {
            headerListeners.forEach((cb) => cb(headers));
        },
        _emitError: (error) => {
            errorListeners.forEach((cb) => cb(error));
        },
    };
}

describe('registerRealtimeWsRoutes', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        const { registerRealtimeWsRoutes } = await import('../../routes/realtime-ws.js');
        app = Fastify();
        await registerRealtimeWsRoutes(app);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('returns 400 when connect payload has invalid URL scheme', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: {
                config: {
                    id: 'conn-invalid',
                    url: 'https://example.com/ws',
                },
            },
        });

        expect(response.statusCode).toBe(400);
        expect(mockWsConnect).not.toHaveBeenCalled();
    });

    it('returns 500 when websocket service connect returns null', async () => {
        mockWsConnect.mockResolvedValueOnce(null);

        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: {
                config: {
                    id: 'conn-null',
                    url: 'wss://example.com/ws',
                },
            },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ isOk: false, error: 'Connection failed' });
    });

    it('connects successfully, stores listeners, and returns connection id + status', async () => {
        const handle = createMockWsHandle('conn-1');
        mockWsConnect.mockResolvedValueOnce(handle);

        const config = { id: 'conn-1', url: 'wss://example.com/ws' };
        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            isOk: true,
            value: { connectionId: 'conn-1', status: 'connected' },
        });
        expect(mockWsConnect).toHaveBeenCalledWith(config);
        expect(handle.onStatusChange).toHaveBeenCalledOnce();
        expect(handle.onMessage).toHaveBeenCalledOnce();
        expect(handle.onHeaders).toHaveBeenCalledOnce();
        expect(handle.onError).toHaveBeenCalledOnce();
    });

    it('broadcasts status, message, and headers from handle callbacks', async () => {
        const handle = createMockWsHandle('conn-2');
        mockWsConnect.mockResolvedValueOnce(handle);

        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-2', url: 'wss://example.com/socket' } },
        });

        const wsMessage = {
            id: 'msg-1',
            direction: 'received',
            content: 'hello',
            timestamp: Date.now(),
            size: 5,
        };

        handle._emitStatus('connected');
        handle._emitMessage(wsMessage);
        handle._emitHeaders({ upgrade: 'websocket' });

        expect(mockBroadcast).toHaveBeenCalledWith('ws.status', {
            connectionId: 'conn-2',
            status: 'connected',
        });
        expect(mockBroadcast).toHaveBeenCalledWith('ws.message', {
            connectionId: 'conn-2',
            message: wsMessage,
        });
        expect(mockBroadcast).toHaveBeenCalledWith('ws.headers', {
            connectionId: 'conn-2',
            headers: { upgrade: 'websocket' },
        });
    });

    it('does not broadcast ws.message for sent-direction echoes', async () => {
        const handle = createMockWsHandle('conn-2b');
        mockWsConnect.mockResolvedValueOnce(handle);

        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-2b', url: 'wss://example.com/socket' } },
        });

        const sentEcho = {
            id: 'msg-sent',
            direction: 'sent',
            content: 'hello',
            timestamp: Date.now(),
            size: 5,
        };

        mockBroadcast.mockClear();
        handle._emitMessage(sentEcho);

        expect(mockBroadcast).not.toHaveBeenCalledWith('ws.message', {
            connectionId: 'conn-2b',
            message: sentEcho,
        });
    });

    it('broadcasts error and removes the connection on handle error callback', async () => {
        const handle = createMockWsHandle('conn-3');
        mockWsConnect.mockResolvedValueOnce(handle);

        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-3', url: 'wss://example.com/socket' } },
        });

        handle._emitError('socket failed');

        expect(mockBroadcast).toHaveBeenCalledWith('ws.error', {
            connectionId: 'conn-3',
            error: 'socket failed',
        });

        const disconnectResponse = await app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-3' },
        });

        expect(disconnectResponse.statusCode).toBe(200);
        expect(disconnectResponse.json()).toEqual({ isOk: true, value: undefined });
        expect(mockWsDisconnect).not.toHaveBeenCalled();
    });

    it('disconnects an active connection and is idempotent for missing ids', async () => {
        const handle = createMockWsHandle('conn-4');
        mockWsConnect.mockResolvedValueOnce(handle);
        mockWsDisconnect.mockResolvedValue({ isOk: true, value: undefined });

        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-4', url: 'wss://example.com/socket' } },
        });

        const first = await app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-4' },
        });
        expect(first.statusCode).toBe(200);
        expect(mockWsDisconnect).toHaveBeenCalledWith('conn-4');

        // Simulate the async 'disconnected' status that triggers cleanup
        handle._emitStatus('disconnected');

        // Now the handle should be removed, so second disconnect is idempotent
        const second = await app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-4' },
        });
        expect(second.statusCode).toBe(200);
        expect(mockWsDisconnect).toHaveBeenCalledTimes(1); // Not called again
    });

    it('returns 500 when service disconnect reports an error', async () => {
        const handle = createMockWsHandle('conn-5');
        mockWsConnect.mockResolvedValueOnce(handle);
        mockWsDisconnect.mockResolvedValueOnce({ isOk: false, error: 'disconnect failed' });

        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-5', url: 'wss://example.com/socket' } },
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-5' },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ isOk: false, error: 'disconnect failed' });
    });

    it('broadcasts disconnected status after async disconnect completes', async () => {
        // REGRESSION TEST: Fix for disconnect getting stuck in 'disconnecting' state
        // The disconnect route must NOT remove the connection handle immediately.
        // Instead, cleanup happens when the status listener receives 'disconnected'.
        const handle = createMockWsHandle('conn-5b', 'connecting');
        mockWsConnect.mockResolvedValueOnce(handle);
        mockWsDisconnect.mockResolvedValueOnce({ isOk: true, value: undefined });

        // 1. Connect
        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-5b', url: 'wss://example.com/socket' } },
        });

        // 2. Simulate connection becoming connected
        handle._emitStatus('connected');
        mockBroadcast.mockClear();

        // 3. Call disconnect route
        const disconnectResponse = await app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-5b' },
        });

        expect(disconnectResponse.statusCode).toBe(200);
        expect(mockWsDisconnect).toHaveBeenCalledWith('conn-5b');

        // 4. At this point, the handle should still exist (not yet removed)
        // Now simulate the async WebSocket 'close' event firing (which emits 'disconnected')
        handle._emitStatus('disconnected');

        // 5. Verify that 'disconnected' status was broadcast
        expect(mockBroadcast).toHaveBeenCalledWith('ws.status', {
            connectionId: 'conn-5b',
            status: 'disconnected',
        });

        // 6. Verify cleanup happened after status broadcast
        // (Connection handle should now be removed, so second disconnect is idempotent)
        const secondDisconnect = await app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-5b' },
        });

        expect(secondDisconnect.statusCode).toBe(200);
        expect(mockWsDisconnect).toHaveBeenCalledTimes(1); // Not called again
    });

    it('broadcasts disconnecting status before disconnect completes', async () => {
        // REGRESSION TEST: Verify that 'disconnecting' status is properly broadcast
        const handle = createMockWsHandle('conn-5c', 'connected');
        mockWsConnect.mockResolvedValueOnce(handle);
        mockWsDisconnect.mockResolvedValueOnce({ isOk: true, value: undefined });

        // 1. Connect
        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-5c', url: 'wss://example.com/socket' } },
        });

        mockBroadcast.mockClear();

        // 2. Call disconnect route
        const disconnectPromise = app.inject({
            method: 'POST',
            url: '/api/ws/disconnect',
            payload: { connectionId: 'conn-5c' },
        });

        // 3. Simulate WebSocketService emitting 'disconnecting' synchronously
        handle._emitStatus('disconnecting');

        // 4. Verify 'disconnecting' was broadcast
        expect(mockBroadcast).toHaveBeenCalledWith('ws.status', {
            connectionId: 'conn-5c',
            status: 'disconnecting',
        });

        await disconnectPromise;

        // 5. Simulate async 'disconnected' status
        handle._emitStatus('disconnected');

        // 6. Verify 'disconnected' was also broadcast
        expect(mockBroadcast).toHaveBeenCalledWith('ws.status', {
            connectionId: 'conn-5c',
            status: 'disconnected',
        });
    });

    it('sends websocket message and returns ok result', async () => {
        mockWsSendMessage.mockResolvedValueOnce({ isOk: true, value: undefined });

        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/send',
            payload: { connectionId: 'conn-6', message: 'ping' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ isOk: true, value: undefined });
        expect(mockWsSendMessage).toHaveBeenCalledWith('conn-6', 'ping');
    });

    it('broadcasts received messages but not sent echoes', async () => {
        // REGRESSION TEST: Verify message reception flow and sent/received filtering
        const handle = createMockWsHandle('conn-6b');
        mockWsConnect.mockResolvedValueOnce(handle);

        await app.inject({
            method: 'POST',
            url: '/api/ws/connect',
            payload: { config: { id: 'conn-6b', url: 'wss://echo.example.com' } },
        });

        mockBroadcast.mockClear();

        // 1. Simulate receiving a message from the WebSocket server
        const receivedMsg = {
            id: 'msg-recv-1',
            direction: 'received',
            content: 'hello from server',
            timestamp: Date.now(),
            size: 17,
        };
        handle._emitMessage(receivedMsg);

        // 2. Verify received message was broadcast
        expect(mockBroadcast).toHaveBeenCalledWith('ws.message', {
            connectionId: 'conn-6b',
            message: receivedMsg,
        });

        mockBroadcast.mockClear();

        // 3. Simulate a sent message echo (WebSocketService echoes sent messages)
        const sentEcho = {
            id: 'msg-sent-1',
            direction: 'sent',
            content: 'hello from client',
            timestamp: Date.now(),
            size: 17,
        };
        handle._emitMessage(sentEcho);

        // 4. Verify sent echo was NOT broadcast (filtered out)
        expect(mockBroadcast).not.toHaveBeenCalledWith('ws.message', {
            connectionId: 'conn-6b',
            message: sentEcho,
        });
    });

    it('returns 500 when send message fails', async () => {
        mockWsSendMessage.mockResolvedValueOnce({ isOk: false, error: 'send failed' });

        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/send',
            payload: { connectionId: 'conn-7', message: 'ping' },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ isOk: false, error: 'send failed' });
    });

    it('returns 400 when send payload is missing connectionId or message', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/api/ws/send',
            payload: { connectionId: 'conn-8' },
        });

        expect(response.statusCode).toBe(400);
        expect(mockWsSendMessage).not.toHaveBeenCalled();
    });
});
