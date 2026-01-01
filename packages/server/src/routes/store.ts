/**
 * Store API routes (auths, proxies, certs, validation rules)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { storeService, type AuthEntry, type Proxy, type Cert, type GlobalValidationRule } from '@wave-client/shared';
import { emitStateChange } from '../services/websocket.js';

export async function registerStoreRoutes(fastify: FastifyInstance): Promise<void> {
    // ==================== Auth Routes ====================

    // Get all auths
    fastify.get('/api/auths', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const auths = await storeService.loadAuths();
            return reply.send({ isOk: true, value: auths });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save auths
    fastify.post('/api/auths', async (request: FastifyRequest<{ Body: AuthEntry[] }>, reply: FastifyReply) => {
        try {
            const auths = request.body;
            await storeService.saveAuths(auths);
            emitStateChange('auths');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ==================== Proxy Routes ====================

    // Get all proxies
    fastify.get('/api/proxies', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const proxies = await storeService.loadProxies();
            return reply.send({ isOk: true, value: proxies });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save proxies
    fastify.post('/api/proxies', async (request: FastifyRequest<{ Body: Proxy[] }>, reply: FastifyReply) => {
        try {
            const proxies = request.body;
            await storeService.saveProxies(proxies);
            emitStateChange('proxies');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ==================== Cert Routes ====================

    // Get all certs
    fastify.get('/api/certs', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const certs = await storeService.loadCerts();
            return reply.send({ isOk: true, value: certs });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save certs
    fastify.post('/api/certs', async (request: FastifyRequest<{ Body: Cert[] }>, reply: FastifyReply) => {
        try {
            const certs = request.body;
            await storeService.saveCerts(certs);
            emitStateChange('certs');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // ==================== Validation Rules Routes ====================

    // Get all validation rules
    fastify.get('/api/validation-rules', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const rules = await storeService.loadValidationRules();
            return reply.send({ isOk: true, value: rules });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save validation rules
    fastify.post('/api/validation-rules', async (request: FastifyRequest<{ Body: GlobalValidationRule[] }>, reply: FastifyReply) => {
        try {
            const rules = request.body;
            await storeService.saveValidationRules(rules);
            emitStateChange('validationRules');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
