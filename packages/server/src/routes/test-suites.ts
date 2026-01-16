/**
 * Test Suite API routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { testSuiteService, type TestSuite } from '@wave-client/shared';
import { emitStateChange, emitBanner } from '../services/websocket.js';

export async function registerTestSuiteRoutes(fastify: FastifyInstance): Promise<void> {
    // Get all test suites
    fastify.get('/api/test-suites', async (_request: FastifyRequest, reply: FastifyReply) => {
        try {
            const testSuites = await testSuiteService.loadAll();
            return reply.send({ isOk: true, value: testSuites });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Save test suite
    fastify.post('/api/test-suites', async (request: FastifyRequest<{ Body: TestSuite }>, reply: FastifyReply) => {
        try {
            const testSuite = request.body;
            const savedTestSuite = await testSuiteService.save(testSuite);
            emitStateChange('testSuitesChanged');
            emitBanner('success', `Test suite "${testSuite.name}" saved`);
            return reply.send({ isOk: true, value: savedTestSuite });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to save test suite: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });

    // Delete test suite
    fastify.delete('/api/test-suites/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        try {
            const { id } = request.params;
            await testSuiteService.delete(id);
            emitStateChange('testSuitesChanged');
            emitBanner('success', 'Test suite deleted');
            return reply.send({ isOk: true, value: undefined });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            emitBanner('error', `Failed to delete test suite: ${message}`);
            return reply.status(500).send({ isOk: false, error: message });
        }
    });
}
