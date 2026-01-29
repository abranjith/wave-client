/**
 * File routes for Wave Client Server
 * 
 * Provides endpoints for reading files from the file system.
 * Used by the web adapter to read FileReferences for request bodies.
 */

import { FastifyInstance } from 'fastify';
import { fileService } from '../services/init.js';

// Type for path type parameter
type PathType = 'absolute' | 'relative';

/**
 * Registers file-related routes
 */
export async function registerFileRoutes(fastify: FastifyInstance): Promise<void> {
    /**
     * Read file as text
     * POST /api/files/read
     */
    fastify.post<{
        Body: { path: string; pathType?: PathType };
    }>('/api/files/read', async (request, reply) => {
        const { path, pathType = 'absolute' } = request.body;
        
        if (!path) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'File path is required' 
            });
        }

        const result = await fileService.readFile(path, pathType);
        return result;
    });

    /**
     * Read file as binary (base64 encoded for transport)
     * POST /api/files/read-binary
     */
    fastify.post<{
        Body: { path: string; pathType?: PathType };
    }>('/api/files/read-binary', async (request, reply) => {
        const { path, pathType = 'absolute' } = request.body;
        
        if (!path) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'File path is required' 
            });
        }

        const result = await fileService.readFileAsBinary(path, pathType);
        
        if (result.isOk && result.value) {
            // Convert Uint8Array to base64 for JSON transport
            const base64 = Buffer.from(result.value).toString('base64');
            return {
                isOk: true,
                value: base64,
                encoding: 'base64'
            };
        }
        
        return result;
    });

    /**
     * Check if file exists
     * POST /api/files/exists
     */
    fastify.post<{
        Body: { path: string; pathType?: PathType };
    }>('/api/files/exists', async (request, reply) => {
        const { path, pathType = 'absolute' } = request.body;
        
        if (!path) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'File path is required' 
            });
        }

        const exists = await fileService.exists(path, pathType);
        return { isOk: true, value: exists };
    });

    /**
     * Get file stats (size, modified time)
     * POST /api/files/stats
     */
    fastify.post<{
        Body: { path: string; pathType?: PathType };
    }>('/api/files/stats', async (request, reply) => {
        const { path, pathType = 'absolute' } = request.body;
        
        if (!path) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'File path is required' 
            });
        }

        const result = await fileService.getFileStats(path, pathType);
        return result;
    });

    /**
     * Write file (text content)
     * POST /api/files/write
     */
    fastify.post<{
        Body: { path: string; content: string; pathType?: PathType };
    }>('/api/files/write', async (request, reply) => {
        const { path, content, pathType = 'absolute' } = request.body;
        
        if (!path) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'File path is required' 
            });
        }

        if (content === undefined || content === null) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'Content is required' 
            });
        }

        const result = await fileService.writeFile(path, content, pathType);
        return result;
    });

    /**
     * Write binary file (base64 encoded content)
     * POST /api/files/write-binary
     */
    fastify.post<{
        Body: { path: string; data: string; encoding?: 'base64'; pathType?: PathType };
    }>('/api/files/write-binary', async (request, reply) => {
        const { path, data, encoding = 'base64', pathType = 'absolute' } = request.body;
        
        if (!path) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'File path is required' 
            });
        }

        if (!data) {
            return reply.status(400).send({ 
                isOk: false, 
                error: 'Data is required' 
            });
        }

        // Decode base64 to Uint8Array
        const buffer = Buffer.from(data, encoding === 'base64' ? 'base64' : 'utf8');
        const uint8Array = new Uint8Array(buffer);

        const result = await fileService.writeBinaryFile(path, uint8Array, pathType);
        return result;
    });
}
