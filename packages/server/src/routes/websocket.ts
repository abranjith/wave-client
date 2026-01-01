/**
 * WebSocket route for push events
 */

import type { FastifyInstance } from 'fastify';
import { addClient, removeClient } from '../services/websocket.js';

export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/ws', { websocket: true }, (socket, _request) => {
        addClient(socket);

        socket.on('message', (message: Buffer) => {
            try {
                const data = JSON.parse(message.toString());
                // Handle ping/pong for connection keep-alive
                if (data.type === 'ping') {
                    socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                }
            } catch {
                // Ignore invalid messages
            }
        });

        socket.on('close', () => {
            removeClient(socket);
        });

        socket.on('error', (error) => {
            console.error('WebSocket error:', error);
            removeClient(socket);
        });

        // Send welcome message
        socket.send(JSON.stringify({ 
            type: 'connected', 
            message: 'Connected to Wave Client Server',
            timestamp: Date.now() 
        }));
    });
}
