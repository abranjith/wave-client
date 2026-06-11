/**
 * HTTP execution API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { httpService } from '@wave-client/shared';
import type { HttpRequestConfig } from '@wave-client/core';

export async function registerHttpRoutes(fastify: FastifyInstance): Promise<void> {
    // Execute HTTP request
    fastify.post('/api/http/execute', async (request: FastifyRequest<{ Body: HttpRequestConfig }>, reply: FastifyReply) => {
        try {
            const config = request.body as HttpRequestConfig;
            const result = await httpService.execute(config);
            return reply.send({ isOk: true, value: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Server HTTP Route] Error:', message);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Cancel an in-flight HTTP request. Aborting here stops the server-side axios
    // call (the outbound request), which is what a client-side fetch abort alone
    // could not do. Responds with `cancelled: false` when the request had already
    // finished (nothing to abort) — this is still a success.
    fastify.post('/api/http/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            const cancelled = httpService.cancel(id);
            return reply.send({ isOk: true, value: { cancelled } });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Server HTTP Route] Cancel error:', message);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
