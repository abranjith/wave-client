/**
 * Service initialization for the Wave Client server.
 * Sets up all required services before starting the server.
 */

import { 
    settingsService, 
    setSecurityServiceInstance,
    type ISecurityService
} from '@wave-client/shared';

/**
 * Simple security service implementation for server.
 * For MVP, encryption is disabled - files are read/written as plain JSON.
 * This can be enhanced later with proper encryption support.
 */
class ServerSecurityService implements ISecurityService {
    async readEncryptedFile<T>(filePath: string, defaultValue: T): Promise<T> {
        // For MVP, just read as plain JSON
        const fs = await import('fs');
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content) as T;
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            return defaultValue;
        }
    }

    async writeEncryptedFile<T>(filePath: string, data: T): Promise<void> {
        // For MVP, just write as plain JSON
        const fs = await import('fs');
        const path = await import('path');
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
}

/**
 * Initializes all services required by the server.
 */
export async function initializeServices(): Promise<void> {
    // Set up the security service
    const securityService = new ServerSecurityService();
    setSecurityServiceInstance(securityService);

    // Load settings to initialize the settings provider
    await settingsService.load();

    console.log('✅ Services initialized');
}
