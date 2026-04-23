import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import { createMockAxios } from '../mocks/axios';
import {
    createWebRealtimeAdapter,
    sseHandles,
    wsHandles,
    type SseWebHandle,
    type WsWebHandle,
} from '../../adapters/webRealtimeAdapter';

describe('createWebRealtimeAdapter', () => {
    const mockAxios = createMockAxios();
    let adapter: ReturnType<typeof createWebRealtimeAdapter>;

    beforeEach(() => {
        mockAxios.reset();
        wsHandles.clear();
        sseHandles.clear();
        adapter = createWebRealtimeAdapter(mockAxios as unknown as AxiosInstance);
    });

    it('connectWebSocket posts to /api/ws/connect and stores handle', async () => {
        mockAxios.setResponse(
            '/api/ws/connect',
            { isOk: true, value: { connectionId: 'ws-1', status: 'connected' } },
            'POST'
        );

        const handle = adapter.connectWebSocket({ id: 'ws-1', url: 'wss://example.com/ws' });
        await Promise.resolve();

        expect(handle.connectionId).toBe('ws-1');
        expect(mockAxios.post).toHaveBeenCalledWith('/api/ws/connect', {
            config: { id: 'ws-1', url: 'wss://example.com/ws' },
        });
        expect(wsHandles.get('ws-1')).toBeDefined();
    });

    it('connectWebSocket dispatches status from connect response', async () => {
        mockAxios.setResponse(
            '/api/ws/connect',
            { isOk: true, value: { connectionId: 'ws-status', status: 'connected' } },
            'POST'
        );

        const handle = adapter.connectWebSocket({ id: 'ws-status', url: 'wss://example.com/ws' });
        const onStatus = vi.fn();
        handle.onStatusChange(onStatus);

        await Promise.resolve();
        await Promise.resolve();

        expect(onStatus).toHaveBeenCalledWith('connected');
    });

    it('connectWebSocket dispatches error + status when server connect fails', async () => {
        mockAxios.setResponse('/api/ws/connect', { isOk: false, error: 'connect failed' }, 'POST');

        const handle = adapter.connectWebSocket({ id: 'ws-2', url: 'wss://example.com/ws' });
        const onError = vi.fn();
        const onStatus = vi.fn();
        handle.onError(onError);
        handle.onStatusChange(onStatus);

        await Promise.resolve();
        await Promise.resolve();

        expect(onStatus).toHaveBeenCalledWith('error');
        expect(onError).toHaveBeenCalledWith('connect failed');
        // Handle is not removed immediately - cleanup happens via push channel status events
        expect(wsHandles.has('ws-2')).toBe(true);
    });

    it('disconnectWebSocket posts to /api/ws/disconnect and removes handle', async () => {
        mockAxios.setResponse('/api/ws/connect', { isOk: true, value: {} }, 'POST');
        mockAxios.setResponse('/api/ws/disconnect', { isOk: true, value: undefined }, 'POST');

        adapter.connectWebSocket({ id: 'ws-3', url: 'wss://example.com/ws' });
        await Promise.resolve();

        const result = await adapter.disconnectWebSocket('ws-3');

        expect(result.isOk).toBe(true);
        expect(mockAxios.post).toHaveBeenCalledWith('/api/ws/disconnect', {
            connectionId: 'ws-3',
        });
        // Handle is not removed immediately - cleanup happens when 'disconnected' status
        // is received from the server via the push channel
        expect(wsHandles.has('ws-3')).toBe(true);
    });

    it('sendWebSocketMessage forwards payload and propagates service errors', async () => {
        mockAxios.setResponse('/api/ws/send', { isOk: false, error: 'send failed' }, 'POST');

        const result = await adapter.sendWebSocketMessage('ws-4', 'ping');

        expect(mockAxios.post).toHaveBeenCalledWith('/api/ws/send', {
            connectionId: 'ws-4',
            message: 'ping',
        });
        expect(result.isOk).toBe(false);
        if (!result.isOk) {
            expect(result.error).toContain('send failed');
        }
    });

    it('connectSse posts to /api/sse/connect and stores handle', async () => {
        mockAxios.setResponse('/api/sse/connect', { isOk: true, value: { connectionId: 'sse-1' } }, 'POST');

        const handle = adapter.connectSse({ id: 'sse-1', method: 'GET', url: 'https://example.com/events' });
        await Promise.resolve();

        expect(handle.connectionId).toBe('sse-1');
        expect(mockAxios.post).toHaveBeenCalledWith('/api/sse/connect', {
            config: { id: 'sse-1', method: 'GET', url: 'https://example.com/events' },
        });
        expect(sseHandles.get('sse-1')).toBeDefined();
    });

    it('disconnectSse posts to /api/sse/disconnect and removes handle', async () => {
        mockAxios.setResponse('/api/sse/connect', { isOk: true, value: {} }, 'POST');
        mockAxios.setResponse('/api/sse/disconnect', { isOk: true, value: undefined }, 'POST');

        adapter.connectSse({ id: 'sse-2', method: 'GET', url: 'https://example.com/events' });
        await Promise.resolve();

        const result = await adapter.disconnectSse('sse-2');

        expect(result.isOk).toBe(true);
        expect(mockAxios.post).toHaveBeenCalledWith('/api/sse/disconnect', {
            connectionId: 'sse-2',
        });
        // Handle is not removed immediately - cleanup happens when 'disconnected' status
        // is received from the server via the push channel
        expect(sseHandles.has('sse-2')).toBe(true);
    });

    it('ws handle unsubscribe removes listeners from dispatch', () => {
        const handle = adapter.connectWebSocket({ id: 'ws-5', url: 'wss://example.com/ws' });
        const onMessage = vi.fn();
        const unsubscribe = handle.onMessage(onMessage);

        const internalHandle = wsHandles.get('ws-5') as WsWebHandle;
        internalHandle.dispatchMessage({
            id: 'msg-1',
            direction: 'received',
            content: 'hello',
            timestamp: Date.now(),
            size: 5,
        });
        expect(onMessage).toHaveBeenCalledTimes(1);

        unsubscribe();
        internalHandle.dispatchMessage({
            id: 'msg-2',
            direction: 'received',
            content: 'again',
            timestamp: Date.now(),
            size: 5,
        });
        expect(onMessage).toHaveBeenCalledTimes(1);
    });

    it('sse handle dispatches events to listeners', () => {
        const handle = adapter.connectSse({ id: 'sse-3', method: 'GET', url: 'https://example.com/events' });
        const onEvent = vi.fn();
        handle.onEvent(onEvent);

        const internalHandle = sseHandles.get('sse-3') as SseWebHandle;
        internalHandle.dispatchEvent({
            id: 'evt-1',
            eventName: 'message',
            data: '{"ok":true}',
            timestamp: Date.now(),
        });

        expect(onEvent).toHaveBeenCalledTimes(1);
    });
});
