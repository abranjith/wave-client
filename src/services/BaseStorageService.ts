import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Forward declaration to avoid circular dependency
// SecurityService will be imported dynamically when needed
let securityServiceInstance: any = null;

/**
 * Sets the SecurityService instance for use in BaseStorageService.
 * Called after SecurityService is initialized.
 */
export function setSecurityServiceInstance(service: any): void {
    securityServiceInstance = service;
}

/**
 * Gets the SecurityService instance.
 * @throws Error if SecurityService is not initialized
 */
function getSecurityService(): any {
    if (!securityServiceInstance) {
        throw new Error('SecurityService not initialized. Ensure SecurityService is imported before use.');
    }
    return securityServiceInstance;
}
/**
 * Application settings interface (duplicated to avoid circular dependency)
 */
export interface AppSettings {
    saveFilesLocation: string;
    maxRedirects: number;
    requestTimeoutSeconds: number;
    maxHistoryItems: number;
    commonHeaderNames: string[];
    encryptionKeyEnvVar: string;
    encryptionKeyValidationStatus: 'none' | 'valid' | 'invalid';
    ignoreCertificateValidation: boolean;
}

/**
 * Settings provider type - a function that returns current settings
 */
export type SettingsProvider = () => Promise<AppSettings>;

/**
 * Global settings provider that can be set by SettingsService
 */
let globalSettingsProvider: SettingsProvider | null = null;

/**
 * Sets the global settings provider.
 * Called by SettingsService during initialization.
 */
export function setGlobalSettingsProvider(provider: SettingsProvider): void {
    globalSettingsProvider = provider;
}

/**
 * Gets the current global settings.
 * Returns default settings if no provider is set.
 */
export async function getGlobalSettings(): Promise<AppSettings> {
    if (globalSettingsProvider) {
        return globalSettingsProvider();
    }
    // Return default settings if no provider is set
    const homeDir = os.homedir();
    return {
        saveFilesLocation: path.join(homeDir, '.waveclient'),
        maxRedirects: 5,
        requestTimeoutSeconds: 0,
        maxHistoryItems: 10,
        commonHeaderNames: [],
        encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
        encryptionKeyValidationStatus: 'none',
        ignoreCertificateValidation: false,
    };
}

/**
 * Base class providing common file system operations for storage services.
 * All services that need to read/write files should extend this class.
 */
export abstract class BaseStorageService {
    protected readonly appName = '.waveclient';

    /**
     * Gets the current application settings.
     * @returns The current AppSettings
     */
    protected async getSettings(): Promise<AppSettings> {
        return getGlobalSettings();
    }

    /**
     * Gets the base application directory using current settings.
     * @returns The absolute path to the app directory
     */
    protected async getAppDirFromSettings(): Promise<string> {
        const settings = await this.getSettings();
        return this.getAppDir(settings.saveFilesLocation);
    }

    /**
     * Gets the base application directory.
     * @param customPath Optional custom path for the app directory
     * @returns The absolute path to the app directory
     */
    protected getAppDir(customPath?: string): string {
        const homeDir = os.homedir();
        if (!customPath || customPath.trim() === '') {
            return path.join(homeDir, this.appName);
        }
        return path.isAbsolute(customPath)
            ? customPath
            : path.join(homeDir, customPath);
    }

    /**
     * Ensures a directory exists, creating it recursively if needed.
     * @param dirPath The directory path to ensure exists
     */
    protected ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * Reads and parses a JSON file, returning a default value if the file doesn't exist or is invalid.
     * @param filePath The path to the JSON file
     * @param defaultValue The default value to return if the file doesn't exist or is invalid
     * @returns The parsed JSON content or the default value
     */
    protected readJsonFile<T>(filePath: string, defaultValue: T): T {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        } catch (error: any) {
            console.error(`Error reading ${filePath}:`, error.message);
            return defaultValue;
        }
    }

    /**
     * Writes data to a JSON file, creating the directory if needed.
     * @param filePath The path to the JSON file
     * @param data The data to write
     */
    protected writeJsonFile<T>(filePath: string, data: T): void {
        const dir = path.dirname(filePath);
        this.ensureDirectoryExists(dir);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }

    /**
     * Sanitizes a string to be used as a filename by replacing invalid characters.
     * @param name The name to sanitize
     * @returns A safe filename string
     */
    protected sanitizeFileName(name: string): string {
        // Replace characters that are invalid in Windows, Linux, and macOS filesystems
        // Invalid characters: < > : " / \ | ? * and control characters (0-31)
        // Also replace leading/trailing spaces and dots as they can cause issues
        return name
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/^[\s.]+|[\s.]+$/g, '_')
            .trim();
    }

    /**
     * Lists all JSON files in a directory.
     * @param dirPath The directory to list files from
     * @returns Array of JSON filenames
     */
    protected listJsonFiles(dirPath: string): string[] {
        this.ensureDirectoryExists(dirPath);
        return fs.readdirSync(dirPath)
            .filter(file => path.extname(file).toLowerCase() === '.json');
    }

    /**
     * Checks if a file exists.
     * @param filePath The file path to check
     * @returns True if the file exists, false otherwise
     */
    protected fileExists(filePath: string): boolean {
        return fs.existsSync(filePath);
    }

    /**
     * Deletes a file if it exists.
     * @param filePath The file path to delete
     */
    protected deleteFile(filePath: string): void {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    /**
     * Renames a file.
     * @param oldPath The current file path
     * @param newPath The new file path
     */
    protected renameFile(oldPath: string, newPath: string): void {
        fs.renameSync(oldPath, newPath);
    }

    /**
     * Reads and parses a JSON file with encryption support.
     * Uses SecurityService to decrypt if encryption is enabled.
     * @param filePath The path to the JSON file
     * @param defaultValue The default value to return if the file doesn't exist or is invalid
     * @returns The parsed JSON content or the default value
     * @throws Error if decryption fails
     */
    protected async readJsonFileSecure<T>(filePath: string, defaultValue: T): Promise<T> {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }

        try {
            const securityService = getSecurityService();
            return await securityService.readEncryptedFile(filePath, defaultValue) as T;
        } catch (error: any) {
            console.error(`Error reading secure file ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Writes data to a JSON file with encryption support.
     * Uses SecurityService to encrypt if encryption is enabled.
     * @param filePath The path to the JSON file
     * @param data The data to write
     * @throws Error if encryption fails
     */
    protected async writeJsonFileSecure<T>(filePath: string, data: T): Promise<void> {
        const dir = path.dirname(filePath);
        this.ensureDirectoryExists(dir);

        try {
            const securityService = getSecurityService();
            await securityService.writeEncryptedFile(filePath, data);
        } catch (error: any) {
            console.error(`Error writing secure file ${filePath}:`, error.message);
            throw error;
        }
    }
}
