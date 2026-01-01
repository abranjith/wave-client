/**
 * HTTP execution API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { httpService, type HttpRequestConfig } from '@wave-client/shared';

export async function registerHttpRoutes(fastify: FastifyInstance): Promise<void> {
    // Execute HTTP request
    fastify.post('/api/http/execute', async (request: FastifyRequest<{ Body: HttpRequestConfig }>, reply: FastifyReply) => {
        try {
            const config = request.body;
            const result = await httpService.execute(config);
            return reply.send({ isOk: true, value: result });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
