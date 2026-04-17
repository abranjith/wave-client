/**
 * Realtime SSE API routes for the web platform.
 *
 * These routes delegate connection lifecycle to `sseService` and relay
 * event-stream updates to browser clients through the shared push channel.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
    ConnectionStatus,
    SseConnectionConfig,
    SseConnectionHandle,
    SseEvent,
} from '@wave-client/core';
import { sseService } from '@wave-client/shared';
import { broadcast } from '../services/websocket.js';

interface SseRouteConnection {
    handle: SseConnectionHandle;
    unsubscribers: Array<() => void>;
}

const sseHandles = new Map<string, SseRouteConnection>();

function removeSseConnection(connectionId: string): void {
    const existing = sseHandles.get(connectionId);
    if (!existing) {
        return;
    }

    existing.unsubscribers.forEach((unsubscribe) => unsubscribe());
    sseHandles.delete(connectionId);
}

/**
 * Registers REST endpoints for server-side SSE lifecycle operations.
 *
 * @param fastify Fastify app instance.
 * @returns Promise that resolves when all SSE routes are registered.
 */
export async function registerRealtimeSseRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * Opens an SSE stream in the server runtime and forwards events/statuses
     * to browser clients via the server push WebSocket channel.
     */
    fastify.post('/api/sse/connect', async (
        request: FastifyRequest<{ Body: { config?: SseConnectionConfig } }>,
        reply: FastifyReply
    ) => {
        const config = request.body?.config;
        if (!config?.id || !config?.url) {
            return reply.status(400).send({
                isOk: false,
                error: 'Invalid SSE config. Expected id and url.',
            });
        }

        try {
            console.info('[Realtime SSE] connect requested', {
                connectionId: config.id,
                url: config.url,
                method: config.method,
            });

            const handle = await sseService.connect(config);
            if (!handle) {
                console.error('[Realtime SSE] connect failed', {
                    connectionId: config.id,
                    url: config.url,
                    method: config.method,
                });
                return reply.status(500).send({ isOk: false, error: 'Connection failed' });
            }

            const unsubscribers: Array<() => void> = [
                handle.onStatusChange((status: ConnectionStatus) => {
                    broadcast('sse.status', { connectionId: config.id, status });
                    if (status === 'disconnected' || status === 'error') {
                        removeSseConnection(config.id);
                    }
                }),
                handle.onEvent((event: SseEvent) => {
                    broadcast('sse.event', { connectionId: config.id, event });
                }),
                handle.onHeaders((headers: Record<string, string>) => {
                    broadcast('sse.headers', { connectionId: config.id, headers });
                }),
                handle.onError((error: string) => {
                    broadcast('sse.error', { connectionId: config.id, error });
                    removeSseConnection(config.id);
                }),
            ];

            sseHandles.set(config.id, { handle, unsubscribers });

            console.info('[Realtime SSE] connected', {
                connectionId: config.id,
                url: config.url,
                method: config.method,
            });

            return reply.send({ isOk: true, value: { connectionId: config.id } });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Realtime SSE] connect route error', {
                connectionId: config.id,
                url: config.url,
                method: config.method,
                error: message,
            });
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    /**
     * Closes an active server-managed SSE stream.
     */
    fastify.post('/api/sse/disconnect', async (
        request: FastifyRequest<{ Body: { connectionId?: string } }>,
        reply: FastifyReply
    ) => {
        const connectionId = request.body?.connectionId;
        if (!connectionId) {
            return reply.status(400).send({ isOk: false, error: 'Missing connectionId' });
        }

        const existing = sseHandles.get(connectionId);
        if (!existing) {
            return reply.send({ isOk: true, value: undefined });
        }

        try {
            console.info('[Realtime SSE] disconnect requested', { connectionId });
            const result = await sseService.disconnect(connectionId);
            removeSseConnection(connectionId);

            if (!result.isOk) {
                console.error('[Realtime SSE] disconnect failed', {
                    connectionId,
                    error: result.error,
                });
                return reply.status(500).send({ isOk: false, error: result.error });
            }

            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Realtime SSE] disconnect route error', { connectionId, error: message });
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
