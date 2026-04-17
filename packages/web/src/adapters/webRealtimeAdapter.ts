import type { AxiosInstance } from 'axios';
import {
    err,
    ok,
    type ConnectionStatus,
    type IRealtimeAdapter,
    type Result,
    type SseConnectionConfig,
    type SseConnectionHandle,
    type SseEvent,
    type WsConnectionConfig,
    type WsConnectionHandle,
    type WsMessage,
} from '@wave-client/core';

/**
 * Internal extension of `WsConnectionHandle` that allows the web adapter's
 * push-event router to dispatch WS updates to registered listeners.
 */
export interface WsWebHandle extends WsConnectionHandle {
    dispatchMessage(msg: WsMessage): void;
    dispatchStatus(status: ConnectionStatus): void;
    dispatchError(error: string): void;
    dispatchHeaders(headers: Record<string, string>): void;
}

/**
 * Internal extension of `SseConnectionHandle` that allows push-event dispatch
 * from the shared browser WebSocket channel.
 */
export interface SseWebHandle extends SseConnectionHandle {
    dispatchEvent(event: SseEvent): void;
    dispatchStatus(status: ConnectionStatus): void;
    dispatchError(error: string): void;
    dispatchHeaders(headers: Record<string, string>): void;
}

/**
 * Active WS handles keyed by connection ID.
 *
 * `webAdapter.ts` routes `ws.*` push events into these handles.
 */
export const wsHandles = new Map<string, WsWebHandle>();

/**
 * Active SSE handles keyed by connection ID.
 *
 * `webAdapter.ts` routes `sse.*` push events into these handles.
 */
export const sseHandles = new Map<string, SseWebHandle>();

function createWsWebHandle(connectionId: string): WsWebHandle {
    const messageListeners = new Set<(msg: WsMessage) => void>();
    const statusListeners = new Set<(status: ConnectionStatus) => void>();
    const errorListeners = new Set<(error: string) => void>();
    const headerListeners = new Set<(headers: Record<string, string>) => void>();

    return {
        connectionId,
        onMessage(cb) {
            messageListeners.add(cb);
            return () => messageListeners.delete(cb);
        },
        onStatusChange(cb) {
            statusListeners.add(cb);
            return () => statusListeners.delete(cb);
        },
        onError(cb) {
            errorListeners.add(cb);
            return () => errorListeners.delete(cb);
        },
        onHeaders(cb) {
            headerListeners.add(cb);
            return () => headerListeners.delete(cb);
        },
        dispatchMessage(msg) {
            messageListeners.forEach((cb) => cb(msg));
        },
        dispatchStatus(status) {
            statusListeners.forEach((cb) => cb(status));
        },
        dispatchError(error) {
            errorListeners.forEach((cb) => cb(error));
        },
        dispatchHeaders(headers) {
            headerListeners.forEach((cb) => cb(headers));
        },
    };
}

function createSseWebHandle(connectionId: string): SseWebHandle {
    const eventListeners = new Set<(event: SseEvent) => void>();
    const statusListeners = new Set<(status: ConnectionStatus) => void>();
    const errorListeners = new Set<(error: string) => void>();
    const headerListeners = new Set<(headers: Record<string, string>) => void>();

    return {
        connectionId,
        onEvent(cb) {
            eventListeners.add(cb);
            return () => eventListeners.delete(cb);
        },
        onStatusChange(cb) {
            statusListeners.add(cb);
            return () => statusListeners.delete(cb);
        },
        onError(cb) {
            errorListeners.add(cb);
            return () => errorListeners.delete(cb);
        },
        onHeaders(cb) {
            headerListeners.add(cb);
            return () => headerListeners.delete(cb);
        },
        dispatchEvent(event) {
            eventListeners.forEach((cb) => cb(event));
        },
        dispatchStatus(status) {
            statusListeners.forEach((cb) => cb(status));
        },
        dispatchError(error) {
            errorListeners.forEach((cb) => cb(error));
        },
        dispatchHeaders(headers) {
            headerListeners.forEach((cb) => cb(headers));
        },
    };
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string' && error.length > 0) {
        return error;
    }

    return fallback;
}

/**
 * Creates the web implementation of `IRealtimeAdapter`.
 *
 * The adapter calls server-side routes for connect/disconnect/send while
 * message/event streaming is delivered via the existing `/ws` push channel.
 *
 * @param api Axios instance configured for the web server.
 * @returns Realtime adapter for WS + SSE operations.
 */
export function createWebRealtimeAdapter(api: AxiosInstance): IRealtimeAdapter {
    return {
        connectWebSocket(config: WsConnectionConfig): WsConnectionHandle {
            const handle = createWsWebHandle(config.id);
            wsHandles.set(config.id, handle);

            void (async () => {
                try {
                    const response = await api.post('/api/ws/connect', { config });
                    if (!response.data?.isOk) {
                        const message = response.data?.error || 'Failed to connect WebSocket';
                        wsHandles.delete(config.id);
                        handle.dispatchStatus('error');
                        handle.dispatchError(message);
                    }
                    if (response.data.value?.status) {
                        handle.dispatchStatus(response.data.value.status);
                    }
                } catch (error) {
                    wsHandles.delete(config.id);
                    handle.dispatchStatus('error');
                    handle.dispatchError(normalizeErrorMessage(error, 'Failed to connect WebSocket'));
                }
            })();

            return handle;
        },

        async disconnectWebSocket(connectionId: string): Promise<Result<void, string>> {
            try {
                const response = await api.post('/api/ws/disconnect', { connectionId });
                wsHandles.delete(connectionId);

                if (response.data?.isOk) {
                    return ok(undefined);
                }

                return err(response.data?.error || 'Failed to disconnect WebSocket');
            } catch (error) {
                wsHandles.delete(connectionId);
                return err(normalizeErrorMessage(error, 'Failed to disconnect WebSocket'));
            }
        },

        async sendWebSocketMessage(connectionId: string, message: string): Promise<Result<void, string>> {
            try {
                const response = await api.post('/api/ws/send', { connectionId, message });
                if (response.data?.isOk) {
                    return ok(undefined);
                }

                return err(response.data?.error || 'Failed to send WebSocket message');
            } catch (error) {
                return err(normalizeErrorMessage(error, 'Failed to send WebSocket message'));
            }
        },

        connectSse(config: SseConnectionConfig): SseConnectionHandle {
            const handle = createSseWebHandle(config.id);
            sseHandles.set(config.id, handle);

            void (async () => {
                try {
                    const response = await api.post('/api/sse/connect', { config });
                    if (!response.data?.isOk) {
                        const message = response.data?.error || 'Failed to connect SSE';
                        sseHandles.delete(config.id);
                        handle.dispatchStatus('error');
                        handle.dispatchError(message);
                    }
                } catch (error) {
                    sseHandles.delete(config.id);
                    handle.dispatchStatus('error');
                    handle.dispatchError(normalizeErrorMessage(error, 'Failed to connect SSE'));
                }
            })();

            return handle;
        },

        async disconnectSse(connectionId: string): Promise<Result<void, string>> {
            try {
                const response = await api.post('/api/sse/disconnect', { connectionId });
                sseHandles.delete(connectionId);

                if (response.data?.isOk) {
                    return ok(undefined);
                }

                return err(response.data?.error || 'Failed to disconnect SSE');
            } catch (error) {
                sseHandles.delete(connectionId);
                return err(normalizeErrorMessage(error, 'Failed to disconnect SSE'));
            }
        },
    };
}
