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

    // Save request to collection.
    // The body carries the whole serialized CollectionItem (id, name,
    // description, request) so item identity survives moves — see FEAT-003.
    fastify.post('/api/collections/:filename/requests', async (
        request: FastifyRequest<{
            Params: { filename: string };
            Body: { item: string; folderPath: string[]; newCollectionName?: string };
        }>,
        reply: FastifyReply
    ) => {
        let itemName = 'Request';
        try {
            const { filename } = request.params;
            const { item, folderPath, newCollectionName } = request.body;
            itemName = JSON.parse(item)?.name ?? itemName;
            const resultFilename = await collectionService.saveRequest(
                item,
                filename,
                folderPath,
                newCollectionName
            );
            emitStateChange('collections');
            emitBanner('success', `Request "${itemName}" saved`);
            return reply.send({ isOk: true, value: { filename: resultFilename } });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to save request "${itemName}": ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Import collection
    fastify.post('/api/collections/import', async (
        request: FastifyRequest<{ Body: { fileName: string; fileContent: string; newCollectionName?: string } }>,
        reply: FastifyReply
    ) => {
        try {
            const { fileName, fileContent, newCollectionName } = request.body;
            const imported = await collectionService.import(fileName, fileContent, newCollectionName);
            emitStateChange('collections');
            return reply.send({ isOk: true, value: [imported] });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
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

    // Delete a nested item (folder or request) within a collection
    fastify.delete('/api/collections/:filename/items/:itemId', async (
        request: FastifyRequest<{
            Params: { filename: string; itemId: string };
            Body: { itemPath: string[] };
        }>,
        reply: FastifyReply
    ) => {
        try {
            const { filename, itemId } = request.params;
            const { itemPath = [] } = request.body ?? {};
            const updatedCollection = await collectionService.deleteItem(filename, itemPath, itemId);
            emitStateChange('collections');
            return reply.send({ isOk: true, value: updatedCollection });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Move a nested item (folder or request) within or across collections
    fastify.post('/api/collections/move', async (
        request: FastifyRequest<{
            Body: {
                sourceFileName: string;
                sourceItemPath: string[];
                itemId: string;
                destinationFileName: string;
                destinationItemPath: string[];
                newCollectionName?: string;
            };
        }>,
        reply: FastifyReply
    ) => {
        try {
            const { sourceFileName, sourceItemPath, itemId, destinationFileName, destinationItemPath, newCollectionName } = request.body;
            const result = await collectionService.moveItem(
                sourceFileName,
                sourceItemPath,
                itemId,
                destinationFileName,
                destinationItemPath,
                newCollectionName
            );
            emitStateChange('collections');
            return reply.send({ isOk: true, value: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
