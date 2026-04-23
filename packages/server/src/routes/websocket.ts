/**
 * WebSocket route for push events
 */

import type { FastifyInstance } from 'fastify';
import { addClient, removeClient } from '../services/websocket.js';

export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
    console.log('[Push Channel] /ws endpoint registered and ready');
    
    fastify.get('/ws', { websocket: true }, (socket, request) => {
        console.log('[Push Channel] ✅ Browser client CONNECTING from:', request.headers.origin || request.headers.host);
        addClient(socket);
        console.log('[Push Channel] ✅ Client ADDED, readyState:', socket.readyState);

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

        socket.on('close', (code, reason) => {
            console.log('[Push Channel] ❌ Client DISCONNECTED - code:', code, 'reason:', reason.toString());
            removeClient(socket);
        });

        socket.on('error', (error) => {
            console.error('[Push Channel] ❌ WebSocket ERROR:', error);
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
