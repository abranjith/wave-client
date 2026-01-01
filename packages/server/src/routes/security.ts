/**
 * Security API routes
 * 
 * Note: For MVP, encryption is disabled. This provides stub endpoints
 * that can be enhanced later with full encryption support.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { EncryptionStatus } from '@wave-client/shared';

export async function registerSecurityRoutes(fastify: FastifyInstance): Promise<void> {
    // Get encryption status
    fastify.get('/api/security/status', async (_request: FastifyRequest, reply: FastifyReply) => {
        // For MVP, encryption is always disabled
        const status: EncryptionStatus = {
            enabled: false,
            keyConfigured: false,
            envVarName: '',
            envVarFound: false
        };
        return reply.send({ isOk: true, value: status });
    });

    // Enable encryption (stub for MVP)
    fastify.post('/api/security/enable', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.status(501).send({ 
            isOk: false, 
            error: 'Encryption is not yet supported in the web version' 
        });
    });

    // Disable encryption (stub for MVP)
    fastify.post('/api/security/disable', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.status(501).send({ 
            isOk: false, 
            error: 'Encryption is not yet supported in the web version' 
        });
    });

    // Change password (stub for MVP)
    fastify.post('/api/security/change-password', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.status(501).send({ 
            isOk: false, 
            error: 'Encryption is not yet supported in the web version' 
        });
    });

    // Export recovery key (stub for MVP)
    fastify.post('/api/security/export-recovery-key', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.status(501).send({ 
            isOk: false, 
            error: 'Encryption is not yet supported in the web version' 
        });
    });

    // Recover with key (stub for MVP)
    fastify.post('/api/security/recover', async (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.status(501).send({ 
            isOk: false, 
            error: 'Encryption is not yet supported in the web version' 
        });
    });
}
