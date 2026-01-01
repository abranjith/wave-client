/**
 * Cookie API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cookieService, type Cookie } from '@wave-client/shared';
import { emitStateChange } from '../services/websocket.js';

export async function registerCookieRoutes(fastify: FastifyInstance): Promise<void> {
    // Get all cookies
    fastify.get('/api/cookies', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const cookies = await cookieService.loadAll();
            return reply.send({ isOk: true, value: cookies });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save cookies
    fastify.post('/api/cookies', async (request: FastifyRequest<{ Body: Cookie[] }>, reply: FastifyReply) => {
        try {
            const cookies = request.body;
            await cookieService.saveAll(cookies);
            emitStateChange('cookies');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
