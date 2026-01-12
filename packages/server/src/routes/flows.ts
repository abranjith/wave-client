/**
 * Flow API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { flowService, type Flow } from '@wave-client/shared';
import { emitStateChange, emitBanner } from '../services/websocket.js';

export async function registerFlowRoutes(fastify: FastifyInstance): Promise<void> {
    // Get all flows
    fastify.get('/api/flows', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const flows = await flowService.loadAll();
            return reply.send({ isOk: true, value: flows });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save flow
    fastify.post('/api/flows', async (request: FastifyRequest<{ Body: Flow }>, reply: FastifyReply) => {
        try {
            const flow = request.body;
            const savedFlow = await flowService.save(flow);
            emitStateChange('flowsChanged');
            emitBanner('success', `Flow "${flow.name}" saved`);
            return reply.send({ isOk: true, value: savedFlow });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to save flow: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Delete flow
    fastify.delete('/api/flows/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            await flowService.delete(id);
            emitStateChange('flowsChanged');
            emitBanner('success', 'Flow deleted');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to delete flow: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
