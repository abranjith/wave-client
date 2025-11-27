import * as path from 'path';
import * as os from 'os';
import { BaseStorageService, setGlobalSettingsProvider, AppSettings } from './BaseStorageService';

// Re-export AppSettings from this module for convenience
export { AppSettings } from './BaseStorageService';

/**
 * Service for managing application settings.
 * Settings are always stored in homeDir/.waveclient to avoid data loss.
 * Uses caching to avoid repeated disk reads.
 */
export class SettingsService extends BaseStorageService {
    private readonly settingsFileName = 'settings.json';
    private cachedSettings: AppSettings | null = null;

    constructor() {
        super();
        // Register this service as the global settings provider (uses cached version)
        setGlobalSettingsProvider(() => this.getCached());
    }

    /**
     * Gets the default settings configuration.
     * @returns Default AppSettings object
     */
    getDefaultSettings(): AppSettings {
        const homeDir = os.homedir();
        return {
            saveFilesLocation: path.join(homeDir, this.appName),
            maxRedirects: 5,
            requestTimeoutSeconds: 0,
            maxHistoryItems: 10,
            commonHeaderNames: [],
            encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
            ignoreCertificateValidation: false,
        };
    }

    /**
     * Gets the path to the settings file.
     * Always stored in homeDir/.waveclient to avoid data loss.
     */
    private getSettingsFilePath(): string {
        const homeDir = os.homedir();
        return path.join(homeDir, this.appName, this.settingsFileName);
    }

    /**
     * Gets cached settings, loading from disk only if cache is empty.
     * This is used by the global settings provider for efficient access.
     * @returns The cached or freshly loaded settings
     */
    async getCached(): Promise<AppSettings> {
        if (this.cachedSettings) {
            return this.cachedSettings;
        }
        return this.load();
    }

    /**
     * Loads settings from the settings file and updates the cache.
     * Merges with defaults to ensure all properties exist.
     * @returns The application settings
     */
    async load(): Promise<AppSettings> {
        const settingsFile = this.getSettingsFilePath();
        const dir = path.dirname(settingsFile);
        this.ensureDirectoryExists(dir);

        if (!this.fileExists(settingsFile)) {
            this.cachedSettings = this.getDefaultSettings();
            return this.cachedSettings;
        }

        try {
            const savedSettings = this.readJsonFile<Partial<AppSettings>>(settingsFile, {});
            // Merge with defaults to ensure all properties exist
            this.cachedSettings = { ...this.getDefaultSettings(), ...savedSettings };
            return this.cachedSettings;
        } catch (error: any) {
            console.error('Error loading settings:', error.message);
            this.cachedSettings = this.getDefaultSettings();
            return this.cachedSettings;
        }
    }

    /**
     * Saves settings to the settings file and updates the cache.
     * @param settings The settings to save
     */
    async save(settings: AppSettings): Promise<void> {
        const settingsFile = this.getSettingsFilePath();
        this.writeJsonFile(settingsFile, settings);
        // Update cache after saving
        this.cachedSettings = settings;
    }

    /**
     * Clears the cached settings, forcing a reload on next access.
     * Useful if settings might have been changed externally.
     */
    invalidateCache(): void {
        this.cachedSettings = null;
    }

    /**
     * Gets the application directory based on settings.
     * @param settings Optional settings to use for determining the app directory
     * @returns The absolute path to the app directory
     */
    getAppDirectory(settings?: AppSettings): string {
        const saveLocation = settings?.saveFilesLocation || '';
        return this.getAppDir(saveLocation);
    }
}

// Export singleton instance for convenience
export const settingsService = new SettingsService();
