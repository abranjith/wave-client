/**
 * History API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { historyService } from '@wave-client/shared';
import { emitStateChange } from '../services/websocket.js';

export async function registerHistoryRoutes(fastify: FastifyInstance): Promise<void> {
    // Get all history
    fastify.get('/api/history', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const history = await historyService.loadAll();
            return reply.send({ isOk: true, value: history });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save request to history
    fastify.post('/api/history', async (request: FastifyRequest<{ Body: { requestContent: string } }>, reply: FastifyReply) => {
        try {
            const { requestContent } = request.body;
            await historyService.save(requestContent);
            emitStateChange('history');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Clear history
    fastify.delete('/api/history', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            await historyService.clearAll();
            emitStateChange('history');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
