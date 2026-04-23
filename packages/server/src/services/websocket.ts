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
    console.log(`[WebSocket Service] ✅ CLIENT ADDED at ${new Date().toISOString()}. Total clients: ${clients.size}, readyState: ${ws.readyState}`);
}

/**
 * Remove a WebSocket client
 */
export function removeClient(ws: WebSocket): void {
    clients.delete(ws);
    console.log(`[WebSocket Service] ❌ CLIENT REMOVED at ${new Date().toISOString()}. Total clients: ${clients.size}`);
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(type: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    const openClients = Array.from(clients).filter(c => c.readyState === 1);
    
    console.log(`[WebSocket Service] 📡 Broadcasting '${type}' at ${timestamp}`, { 
        totalClients: clients.size,
        openClients: openClients.length,
        type,
        clientReadyStates: Array.from(clients).map(c => c.readyState)
    });
    
    for (const client of openClients) {
        client.send(message);
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
