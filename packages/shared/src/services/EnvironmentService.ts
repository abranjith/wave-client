import * as path from 'path';

import { BaseStorageService } from './BaseStorageService.js';
import type { Environment } from '../types.js';

/**
 * Service for managing environments (environment variables for requests).
 */
export class EnvironmentService extends BaseStorageService {
    private readonly subDir = 'environments';

    /**
     * Gets the environments directory path using current settings.
     */
    private async getEnvironmentsDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    /**
     * Creates the default Global environment.
     */
    private getDefaultGlobalEnv(): Environment {
        return {
            id: 'global',
            name: 'Global',
            values: []
        };
    }

    /**
     * Loads all environments from the environments directory.
     * @returns Array of environments with their filenames
     */
    async loadAll(): Promise<(Environment & { filename: string })[]> {
        const envDir = await this.getEnvironmentsDir();
        this.ensureDirectoryExists(envDir);

        const environments: (Environment & { filename: string })[] = [];
        const seenNames = new Set<string>(); // Track environment names to avoid duplicates
        const files = this.listJsonFiles(envDir);

        for (const file of files) {
            try {
                const filePath = path.join(envDir, file);
                const environmentData = await this.readJsonFileSecure<Environment | null>(filePath, null);

                if (environmentData && !seenNames.has(environmentData.name)) {
                    seenNames.add(environmentData.name);
                    environments.push({
                        ...environmentData,
                        filename: file
                    });
                } else if (environmentData) {
                    console.warn(`Skipping duplicate environment name "${environmentData.name}" from file ${file}`);
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error(`Error loading environment ${file}:`, message);
                // Continue loading other environments even if one fails
            }
        }

        // Add default global environment if not present
        const defaultEnv = this.getDefaultGlobalEnv();
        if (!seenNames.has(defaultEnv.name)) {
            environments.unshift({
                ...defaultEnv,
                filename: ''
            });
        }

        return environments;
    }

    /**
     * Saves an environment to the environments directory.
     * @param env The environment to save
     */
    async save(env: Environment): Promise<void> {
        const envDir = await this.getEnvironmentsDir();
        this.ensureDirectoryExists(envDir);

        const fileName = this.sanitizeFileName(env.name);
        const filePath = path.join(envDir, `${fileName}.json`);
        await this.writeJsonFileSecure(filePath, env);
    }

    /**
     * Saves multiple environments.
     * @param environments The environments to save
     */
    async saveAll(environments: Environment[]): Promise<void> {
        for (const env of environments) {
            await this.save(env);
        }
    }

    /**
     * Deletes an environment file by ID.
     * @param envId The environment ID to delete
     */
    async delete(envId: string): Promise<void> {
        const environments = await this.loadAll();
        const env = environments.find(e => e.id === envId);
        if (env && env.filename) {
            const envDir = await this.getEnvironmentsDir();
            const filePath = path.join(envDir, env.filename);
            this.deleteFile(filePath);
        }
    }

    /**
     * Imports environments from a JSON string (single object or array).
     * @param fileContent The JSON content to import
     * @returns The imported environments
     */
    async import(fileContent: string): Promise<Environment[]> {
        const envDir = await this.getEnvironmentsDir();
        this.ensureDirectoryExists(envDir);

        // Allow just a single environment object or an array of environments
        let environments: Environment[];
        if (fileContent.trim().startsWith('[')) {
            environments = JSON.parse(fileContent) as Environment[];
        } else {
            const env = JSON.parse(fileContent) as Environment;
            environments = [env];
        }

        // Save each environment as a separate file
        // If an environment with the same name exists, it will be overwritten
        for (const env of environments) {
            await this.save(env);
        }

        return environments;
    }

    /**
     * Exports all environments.
     * @returns Array of all environments
     */
    async exportAll(): Promise<Environment[]> {
        const environments = await this.loadAll();
        // Remove filename property for export
        return environments.map(({ filename, ...env }) => env);
    }
}

// Export singleton instance for convenience
export const environmentService = new EnvironmentService();
