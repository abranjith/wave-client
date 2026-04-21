/**
 * Realtime WebSocket API routes for the web platform.
 *
 * These routes delegate connection lifecycle to `webSocketService` and relay
 * runtime events back to browser clients via the existing server push channel.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
    ConnectionStatus,
    WsConnectionConfig,
    WsConnectionHandle,
    WsMessage,
} from '@wave-client/core';
import { webSocketService } from '@wave-client/shared';
import { broadcast } from '../services/websocket.js';

interface WsRouteConnection {
    handle: WsConnectionHandle;
    unsubscribers: Array<() => void>;
}

const CONNECT_STATUS_WAIT_MS = 800;

const wsHandles = new Map<string, WsRouteConnection>();

function isValidWsUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
        return false;
    }
}

function removeWsConnection(connectionId: string): void {
    const existing = wsHandles.get(connectionId);
    if (!existing) {
        return;
    }

    existing.unsubscribers.forEach((unsubscribe) => unsubscribe());
    wsHandles.delete(connectionId);
}

/**
 * Registers REST endpoints for server-side WebSocket lifecycle operations.
 *
 * @param fastify Fastify app instance.
 * @returns Promise that resolves when all WS routes are registered.
 */
export async function registerRealtimeWsRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * Opens a WebSocket connection in the server runtime and starts relaying
     * WS lifecycle events/messages to all connected browser clients.
     */
    fastify.post('/api/ws/connect', async (
        request: FastifyRequest<{ Body: { config?: WsConnectionConfig } }>,
        reply: FastifyReply
    ) => {
        const config = request.body?.config;
        if (!config?.id || !config?.url || !isValidWsUrl(config.url)) {
            return reply.status(400).send({
                isOk: false,
                error: 'Invalid WebSocket config. Expected id and ws:// or wss:// URL.',
            });
        }

        try {
            console.info('[Realtime WS] connect requested', {
                connectionId: config.id,
                url: config.url,
            });

            const handle = await webSocketService.connect(config);
            if (!handle) {
                console.error('[Realtime WS] connect failed', {
                    connectionId: config.id,
                    url: config.url,
                });
                return reply.status(500).send({ isOk: false, error: 'Connection failed' });
            }

            let latestStatus: ConnectionStatus = 'connecting';
            let resolveReady: (() => void) | null = null;
            const ready = new Promise<void>((resolve) => {
                resolveReady = resolve;
            });

            const unsubscribers: Array<() => void> = [
                handle.onStatusChange((status: ConnectionStatus) => {
                    latestStatus = status;
                    broadcast('ws.status', { connectionId: config.id, status });
                    if (status === 'disconnected' || status === 'error') {
                        removeWsConnection(config.id);
                    }
                    if (
                        resolveReady &&
                        (status === 'connected' || status === 'disconnected' || status === 'error')
                    ) {
                        resolveReady();
                        resolveReady = null;
                    }
                }),
                handle.onMessage((message: WsMessage) => {
                    if (message.direction === 'sent') {
                        return;
                    }
                    broadcast('ws.message', { connectionId: config.id, message });
                }),
                handle.onHeaders((headers: Record<string, string>) => {
                    broadcast('ws.headers', { connectionId: config.id, headers });
                }),
                handle.onError((error: string) => {
                    broadcast('ws.error', { connectionId: config.id, error });
                    latestStatus = 'error';
                    removeWsConnection(config.id);
                    if (resolveReady) {
                        resolveReady();
                        resolveReady = null;
                    }
                }),
            ];

            wsHandles.set(config.id, { handle, unsubscribers });

            console.info('[Realtime WS] connection handle registered', {
                connectionId: config.id,
                url: config.url,
            });

            await Promise.race([
                ready,
                new Promise<void>((resolve) => setTimeout(resolve, CONNECT_STATUS_WAIT_MS)),
            ]);

            return reply.send({
                isOk: true,
                value: { connectionId: config.id, status: latestStatus },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Realtime WS] connect route error', {
                connectionId: config.id,
                url: config.url,
                error: message,
            });
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    /**
     * Closes an active server-managed WebSocket connection.
     */
    fastify.post('/api/ws/disconnect', async (
        request: FastifyRequest<{ Body: { connectionId?: string } }>,
        reply: FastifyReply
    ) => {
        const connectionId = request.body?.connectionId;
        if (!connectionId) {
            return reply.status(400).send({ isOk: false, error: 'Missing connectionId' });
        }

        const existing = wsHandles.get(connectionId);
        if (!existing) {
            return reply.send({ isOk: true, value: undefined });
        }

        try {
            console.info('[Realtime WS] disconnect requested', { connectionId });
            const result = await webSocketService.disconnect(connectionId);
            removeWsConnection(connectionId);

            if (!result.isOk) {
                console.error('[Realtime WS] disconnect failed', {
                    connectionId,
                    error: result.error,
                });
                return reply.status(500).send({ isOk: false, error: result.error });
            }

            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Realtime WS] disconnect route error', { connectionId, error: message });
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    /**
     * Sends a text message over an active server-managed WebSocket connection.
     */
    fastify.post('/api/ws/send', async (
        request: FastifyRequest<{ Body: { connectionId?: string; message?: string } }>,
        reply: FastifyReply
    ) => {
        const connectionId = request.body?.connectionId;
        const message = request.body?.message;

        if (!connectionId || typeof message !== 'string') {
            return reply.status(400).send({ isOk: false, error: 'Missing connectionId or message' });
        }

        try {
            const result = await webSocketService.sendMessage(connectionId, message);
            if (!result.isOk) {
                console.error('[Realtime WS] send failed', {
                    connectionId,
                    error: result.error,
                });
                return reply.status(500).send({ isOk: false, error: result.error });
            }

            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Realtime WS] send route error', {
                connectionId,
                error: errorMessage,
            });
            return reply.status(500).send({ isOk: false, error: errorMessage });
        }
    });
}
