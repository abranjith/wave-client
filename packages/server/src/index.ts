#!/usr/bin/env node
/**
 * Wave Client Server
 * 
 * A Fastify-based server that provides REST API and WebSocket support
 * for the Wave Client web application. Handles all I/O operations including
 * file system access, HTTP requests with proxy/cert support, and encryption.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';

import { registerCollectionRoutes } from './routes/collections.js';
import { registerEnvironmentRoutes } from './routes/environments.js';
import { registerHistoryRoutes } from './routes/history.js';
import { registerHttpRoutes } from './routes/http.js';
import { registerCookieRoutes } from './routes/cookies.js';
import { registerStoreRoutes } from './routes/store.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSecurityRoutes } from './routes/security.js';
import { registerWebSocketRoutes } from './routes/websocket.js';
import { initializeServices } from './services/init.js';

//TODO: Make PORT and HOST configurable via environment variables or config file
const PORT = 3456;
const HOST = '127.0.0.1';

async function main() {
    // Initialize services (settings, security, etc.)
    await initializeServices();

    const fastify = Fastify({
        logger: true,
    });

    // Register CORS support for web app
    await fastify.register(cors, {
        origin: true, // Allow all origins for local development
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });

    // Register WebSocket support
    await fastify.register(websocket);

    // Health check endpoint
    fastify.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Register all API routes
    await registerCollectionRoutes(fastify);
    await registerEnvironmentRoutes(fastify);
    await registerHistoryRoutes(fastify);
    await registerHttpRoutes(fastify);
    await registerCookieRoutes(fastify);
    await registerStoreRoutes(fastify);
    await registerSettingsRoutes(fastify);
    await registerSecurityRoutes(fastify);
    await registerWebSocketRoutes(fastify);

    // Start server
    try {
        await fastify.listen({ port: PORT, host: HOST });
        console.log(`\n🌊 Wave Client Server running at http://${HOST}:${PORT}`);
        console.log(`   Health check: http://${HOST}:${PORT}/health`);
        console.log(`   WebSocket: ws://${HOST}:${PORT}/ws\n`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

main();
