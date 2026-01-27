/**
 * Environment API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { environmentService, type Environment } from '@wave-client/shared';
import { emitStateChange, emitBanner } from '../services/websocket.js';

export async function registerEnvironmentRoutes(fastify: FastifyInstance): Promise<void> {
    // Get all environments
    fastify.get('/api/environments', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const environments = await environmentService.loadAll();
            return reply.send({ isOk: true, value: environments });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save single environment
    fastify.post('/api/environments', async (request: FastifyRequest<{ Body: Environment }>, reply: FastifyReply) => {
        try {
            const environment = request.body as Environment;
            await environmentService.save(environment);
            emitStateChange('environments');
            emitBanner('success', `Environment "${environment.name}" saved`);
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to save environment: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save multiple environments
    fastify.put('/api/environments', async (request: FastifyRequest<{ Body: Environment[] }>, reply: FastifyReply) => {
        try {
            const environments = request.body;
            await environmentService.saveAll(environments);
            emitStateChange('environments');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Delete environment
    fastify.delete('/api/environments/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            await environmentService.delete(id);
            emitStateChange('environments');
            emitBanner('success', 'Environment deleted');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to delete environment: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Import environments
    fastify.post('/api/environments/import', async (request: FastifyRequest<{ Body: { fileContent: string } }>, reply: FastifyReply) => {
        try {
            const { fileContent } = request.body;
            const environments = await environmentService.import(fileContent);
            emitStateChange('environments');
            emitBanner('success', `${environments.length} environment(s) imported`);
            return reply.send({ isOk: true, value: environments });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to import environments: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Export environments
    fastify.get('/api/environments/export', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const environments = await environmentService.exportAll();
            const content = JSON.stringify(environments, null, 2);
            return reply.send({ isOk: true, value: { filePath: '', fileName: 'environments.json', content } });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
