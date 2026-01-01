/**
 * WebSocket management for push events
 */

import type { WebSocket } from 'ws';

// Store connected WebSocket clients
const clients = new Set<WebSocket>();

/**
 * Add a WebSocket client
 */
export function addClient(ws: WebSocket): void {
    clients.add(ws);
    console.log(`WebSocket client connected. Total clients: ${clients.size}`);
}

/**
 * Remove a WebSocket client
 */
export function removeClient(ws: WebSocket): void {
    clients.delete(ws);
    console.log(`WebSocket client disconnected. Total clients: ${clients.size}`);
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(type: string, data?: unknown): void {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    
    for (const client of clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    }
}

/**
 * Emit a banner notification to all clients
 */
export function emitBanner(type: 'success' | 'error' | 'info' | 'warning', message: string): void {
    broadcast('banner', { type, message });
}

/**
 * Emit a state change event to all clients
 */
export function emitStateChange(stateType: string): void {
    broadcast(`${stateType}Changed`);
}
