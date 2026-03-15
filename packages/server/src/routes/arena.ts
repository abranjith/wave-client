/**
 * Arena AI chat API routes.
 *
 * Provides REST endpoints for Arena session/message/settings persistence
 * (via `arenaStorageService`) and chat operations (via `ArenaService`).
 *
 * Streaming uses Server-Sent Events (SSE): the client opens a `POST` to
 * `/api/arena/chat/stream` and receives `text/event-stream` chunks until
 * the stream completes, errors, or the client disconnects.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
    arenaStorageService,
    type ArenaSession,
    type ArenaMessage,
    type ArenaSettings,
    type ArenaProviderSettingsMap,
    type ArenaReference,
    type ArenaChatRequest,
    type ArenaChatStreamChunk,
} from '@wave-client/shared';
import { emitStateChange } from '../services/websocket.js';

// ---------------------------------------------------------------------------
// Lazy-loaded ArenaService (heavy LangGraph dependency)
// ---------------------------------------------------------------------------

let _arenaServicePromise: Promise<typeof import('@wave-client/arena')> | null = null;

async function getArenaService() {
    if (!_arenaServicePromise) {
        _arenaServicePromise = import('@wave-client/arena');
    }
    const mod = await _arenaServicePromise;
    return mod.arenaService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function registerArenaRoutes(fastify: FastifyInstance): Promise<void> {
    // ========================================================================
    // Session Management
    // ========================================================================

    fastify.get('/api/arena/sessions', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const sessions = await arenaStorageService.loadSessions();
            return reply.send({ isOk: true, value: sessions });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.post('/api/arena/sessions', async (request: FastifyRequest<{ Body: ArenaSession }>, reply: FastifyReply) => {
        try {
            await arenaStorageService.saveSession(request.body);
            emitStateChange('arenaSessions');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.delete('/api/arena/sessions/:sessionId', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
        try {
            await arenaStorageService.deleteSession(request.params.sessionId);
            emitStateChange('arenaSessions');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Message Management
    // ========================================================================

    fastify.get('/api/arena/sessions/:sessionId/messages', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
        try {
            const messages = await arenaStorageService.loadMessages(request.params.sessionId);
            return reply.send({ isOk: true, value: messages });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.post('/api/arena/messages', async (request: FastifyRequest<{ Body: ArenaMessage }>, reply: FastifyReply) => {
        try {
            const msg: ArenaMessage = request.body;
            // Upsert: load current array, replace/push, write back
            const existing = await arenaStorageService.loadMessages(msg.sessionId);
            const idx = existing.findIndex((m) => m.id === msg.id);
            if (idx >= 0) {
                existing[idx] = msg;
            } else {
                existing.push(msg);
            }
            await arenaStorageService.saveMessages(msg.sessionId, existing);
            emitStateChange('arenaMessages');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.delete('/api/arena/sessions/:sessionId/messages', async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
        try {
            await arenaStorageService.clearSessionMessages(request.params.sessionId);
            emitStateChange('arenaMessages');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Settings
    // ========================================================================

    fastify.get('/api/arena/settings', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const settings = await arenaStorageService.loadSettings();
            return reply.send({ isOk: true, value: settings });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.put('/api/arena/settings', async (request: FastifyRequest<{ Body: ArenaSettings }>, reply: FastifyReply) => {
        try {
            await arenaStorageService.saveSettings(request.body);
            emitStateChange('arenaSettings');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // References
    // ========================================================================

    fastify.get('/api/arena/references', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const refs = await arenaStorageService.loadReferences();
            return reply.send({ isOk: true, value: refs });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.put('/api/arena/references', async (request: FastifyRequest<{ Body: ArenaReference[] }>, reply: FastifyReply) => {
        try {
            await arenaStorageService.saveReferences(request.body);
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Provider Settings
    // ========================================================================

    fastify.get('/api/arena/provider-settings', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const settings = await arenaStorageService.loadProviderSettings();
            return reply.send({ isOk: true, value: settings });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    fastify.put('/api/arena/provider-settings', async (request: FastifyRequest<{ Body: ArenaProviderSettingsMap }>, reply: FastifyReply) => {
        try {
            await arenaStorageService.saveProviderSettings(request.body);
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Validate API Key
    // ========================================================================

    fastify.post('/api/arena/validate-api-key', async (request: FastifyRequest<{ Body: { provider: string; apiKey: string } }>, reply: FastifyReply) => {
        try {
            const { provider, apiKey } = request.body;
            const providerSettings = { provider: provider as any, enabled: true, apiKey };
            const svc = await getArenaService();
            const result = await svc.validateApiKey(provider as any, providerSettings);
            return reply.send({ isOk: true, value: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Available Models
    // ========================================================================

    fastify.get('/api/arena/models/:provider', async (request: FastifyRequest<{ Params: { provider: string } }>, reply: FastifyReply) => {
        try {
            const { provider } = request.params;
            const allSettings = await arenaStorageService.loadProviderSettings();
            const providerSettings = (allSettings as any)[provider] ?? { provider, enabled: true };
            const svc = await getArenaService();
            const models = await svc.getAvailableModels(provider as any, providerSettings);
            return reply.send({ isOk: true, value: models });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Non-streaming Chat
    // ========================================================================

    fastify.post('/api/arena/chat', async (request: FastifyRequest<{ Body: ArenaChatRequest }>, reply: FastifyReply) => {
        try {
            const svc = await getArenaService();
            const response = await svc.streamChat(
                request.body,
                () => { /* non-streaming — discard intermediate chunks */ },
            );
            return reply.send({ isOk: true, value: response });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ========================================================================
    // Streaming Chat (SSE)
    // ========================================================================

    fastify.post('/api/arena/chat/stream', async (request: FastifyRequest<{ Body: ArenaChatRequest }>, reply: FastifyReply) => {
        const chatRequest = request.body;

        // Set SSE headers.
        // CORS headers must be set explicitly here because reply.raw.writeHead()
        // bypasses the @fastify/cors plugin pipeline entirely.
        const requestOrigin = request.headers.origin;
        reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            ...(requestOrigin && {
                'Access-Control-Allow-Origin': requestOrigin,
                'Access-Control-Allow-Credentials': 'true',
            }),
        });

        const controller = new AbortController();

        // Abort when the client disconnects.
        // IMPORTANT: Must listen on the underlying socket, NOT request.raw.
        // request.raw is an IncomingMessage (readable stream) whose 'close'
        // event fires as soon as the POST body is fully consumed — long before
        // the SSE response finishes.  The socket 'close' event fires only when
        // the TCP connection actually drops (client navigates away, tab closed,
        // explicit abort, etc.).
        request.raw.socket.on('close', () => {
            controller.abort();
        });

        /** Write an SSE frame to the response. */
        function sendEvent(event: string, data: unknown): void {
            reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }

        // Emit immediate heartbeat so the UI gets instant feedback
        sendEvent('chunk', { messageId: '', content: '', done: false, heartbeat: true });

        // Keep the client's safety timer alive during slow LLM warm-up
        const heartbeatInterval = setInterval(() => {
            sendEvent('chunk', { messageId: '', content: '', done: false, heartbeat: true });
        }, 15_000);

        try {
            const svc = await getArenaService();
            const response = await svc.streamChat(
                chatRequest,
                (chunk: ArenaChatStreamChunk) => {
                    sendEvent('chunk', chunk);
                },
                controller.signal,
            );

            sendEvent('complete', response);
        } catch (error: any) {
            sendEvent('error', { message: error.message ?? 'Unknown stream error' });
        } finally {
            clearInterval(heartbeatInterval);
            reply.raw.end();
        }
    });
}
