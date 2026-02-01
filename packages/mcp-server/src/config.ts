import * as fs from 'fs';
import * as path from 'path';
import {
    settingsService,
    setSecurityServiceInstance,
    type ISecurityService
} from '@wave-client/shared';

// Simple pass-through security service for MCP (read-only mostly)
// In a real scenario, we might want to read the key from env
export class SimpleSecurityService implements ISecurityService {

    async readEncryptedFile<T>(filePath: string, defaultValue: T): Promise<T> {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content) as T;
        } catch (error) {
            console.error(`Error reading content from ${filePath}:`, error);
            return defaultValue;
        }
    }

    async writeEncryptedFile<T>(filePath: string, data: T): Promise<void> {
        // For MVP, just write as plain JSON
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
}

// Initialize shared services
export async function initializeServices() {
    setSecurityServiceInstance(new SimpleSecurityService());
    await settingsService.load();
}
