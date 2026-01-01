/**
 * Settings API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { settingsService, type AppSettings } from '@wave-client/shared';
import { emitStateChange } from '../services/websocket.js';

export async function registerSettingsRoutes(fastify: FastifyInstance): Promise<void> {
    // Get settings
    fastify.get('/api/settings', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const settings = await settingsService.load();
            return reply.send({ isOk: true, value: settings });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save settings
    fastify.post('/api/settings', async (request: FastifyRequest<{ Body: AppSettings }>, reply: FastifyReply) => {
        try {
            const settings = request.body;
            const saved = await settingsService.save(settings);
            emitStateChange('settings');
            return reply.send({ isOk: true, value: saved });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
