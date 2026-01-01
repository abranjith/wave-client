/**
 * Collection API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { collectionService, type Collection } from '@wave-client/shared';
import { emitStateChange, emitBanner } from '../services/websocket.js';

export async function registerCollectionRoutes(fastify: FastifyInstance): Promise<void> {
    // Get all collections
    fastify.get('/api/collections', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const collections = await collectionService.loadAll();
            return reply.send({ isOk: true, value: collections });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Get single collection by filename
    fastify.get('/api/collections/:filename', async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
        try {
            const { filename } = request.params;
            const collection = await collectionService.loadOne(filename);
            if (!collection) {
                return reply.status(404).send({ isOk: false, error: 'Collection not found' });
            }
            return reply.send({ isOk: true, value: collection });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save collection
    fastify.post('/api/collections', async (request: FastifyRequest<{ Body: { collection: Collection; filename: string } }>, reply: FastifyReply) => {
        try {
            const { collection, filename } = request.body;
            const saved = await collectionService.save(collection, filename);
            emitStateChange('collections');
            emitBanner('success', `Collection "${collection.info.name}" saved`);
            return reply.send({ isOk: true, value: { ...saved, filename } });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to save collection: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Delete collection
    fastify.delete('/api/collections/:filename', async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
        try {
            const { filename } = request.params;
            await collectionService.delete(filename);
            emitStateChange('collections');
            emitBanner('success', 'Collection deleted');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to delete collection: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save request to collection
    fastify.post('/api/collections/:filename/requests', async (
        request: FastifyRequest<{
            Params: { filename: string };
            Body: { requestContent: string; requestName: string; folderPath: string[]; newCollectionName?: string };
        }>,
        reply: FastifyReply
    ) => {
        try {
            const { filename } = request.params;
            const { requestContent, requestName, folderPath, newCollectionName } = request.body;
            const resultFilename = await collectionService.saveRequest(
                requestContent,
                requestName,
                filename,
                folderPath,
                newCollectionName
            );
            emitStateChange('collections');
            emitBanner('success', `Request "${requestName}" saved`);
            return reply.send({ isOk: true, value: { filename: resultFilename } });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to save request: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Import collection
    fastify.post('/api/collections/import', async (
        request: FastifyRequest<{ Body: { fileName: string; fileContent: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { fileName, fileContent } = request.body;
            const imported = await collectionService.import(fileName, fileContent);
            emitStateChange('collections');
            emitBanner('success', `Collection "${imported.info.name}" imported`);
            return reply.send({ isOk: true, value: [imported] });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to import collection: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Export collection
    fastify.get('/api/collections/:filename/export', async (
        request: FastifyRequest<{ Params: { filename: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { filename } = request.params;
            const collection = await collectionService.loadOne(filename);
            if (!collection) {
                return reply.status(404).send({ isOk: false, error: 'Collection not found' });
            }
            const exported = await collectionService.export(collection);
            return reply.send({ isOk: true, value: exported });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
