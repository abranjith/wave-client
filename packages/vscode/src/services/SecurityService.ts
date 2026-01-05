import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getGlobalSettings, setSecurityServiceInstance } from '@wave-client/shared';

/**
 * Encryption status information
 */
export interface EncryptionStatus {
    enabled: boolean;
    keyConfigured: boolean;
    envVarName: string;
    envVarFound: boolean;
}

/**
 * Recovery key data structure stored in .waveclient-key file
 */
interface RecoveryKeyData {
    version: number;
    salt: string;
    keyHash: string;
    createdAt: string;
    envVarName: string;
}

/**
 * Encrypted file format structure
 */
interface EncryptedData {
    version: number;
    iv: string;
    authTag: string;
    data: string;
}

/**
 * Service for managing file encryption using AES-256-GCM.
 * Uses VS Code's SecretStorage API for secure key management.
 * 
 * Encryption flow:
 * 1. Read encryptionKeyEnvVar from settings
 * 2. Get encryption key from environment variable (case-insensitive)
 * 3. Derive AES-256 key using PBKDF2 with stored salt
 * 4. Encrypt/decrypt files using AES-256-GCM
 * 
 * Recovery:
 * - Export recovery key file (.waveclient-key)
 * - Recover using the original environment variable value
 */
export class SecurityService {
    private static instance: SecurityService;
    private secretStorage: vscode.SecretStorage | null = null;

    // SecretStorage keys
    private readonly SALT_KEY = 'extension.waveClient.salt';
    private readonly KEY_HASH_KEY = 'extension.waveClient.keyHash';

    // Encryption constants
    private readonly ALGORITHM = 'aes-256-gcm';
    private readonly KEY_LENGTH = 32; // 256 bits
    private readonly IV_LENGTH = 16; // 128 bits
    private readonly AUTH_TAG_LENGTH = 16; // 128 bits
    private readonly SALT_LENGTH = 32; // 256 bits
    private readonly PBKDF2_ITERATIONS = 100000;
    private readonly ENCRYPTION_VERSION = 1;

    private constructor() {}

    /**
     * Gets the singleton instance of SecurityService.
     */
    static getInstance(): SecurityService {
        if (!SecurityService.instance) {
            SecurityService.instance = new SecurityService();
        }
        return SecurityService.instance;
    }

    /**
     * Initializes the service with VS Code's SecretStorage.
     * Must be called in extension.ts activate() before using encryption.
     * @param secrets The VS Code SecretStorage instance
     */
    initialize(secrets: vscode.SecretStorage): void {
        this.secretStorage = secrets;
    }

    /**
     * Checks if the service has been initialized with SecretStorage.
     */
    isInitialized(): boolean {
        return this.secretStorage !== null;
    }

    /**
     * Gets the current encryption status.
     * @returns EncryptionStatus object with details about encryption configuration
     */
    async getEncryptionStatus(): Promise<EncryptionStatus> {
        const settings = await getGlobalSettings();
        const envVarName = settings.encryptionKeyEnvVar || '';
        const envVarFound = envVarName ? this.getEnvVarValue(envVarName) !== null : false;
        const keyConfigured = await this.isKeyConfigured();

        return {
            enabled: envVarFound && keyConfigured,
            keyConfigured,
            envVarName,
            envVarFound
        };
    }

    /**
     * Checks if encryption is enabled and properly configured.
     * Encryption is enabled when:
     * 1. encryptionKeyEnvVar is set in settings
     * 2. The environment variable exists and has a value
     * 3. A salt has been stored (key has been set up)
     */
    async isEncryptionEnabled(): Promise<boolean> {
        const status = await this.getEncryptionStatus();
        return status.enabled;
    }

    /**
     * Gets the value of an environment variable (case-insensitive lookup).
     * @param envVarName The name of the environment variable
     * @returns The value or null if not found
     */
    private getEnvVarValue(envVarName: string): string | null {
        if (!envVarName) {
            return null;
        }

        // Case-insensitive lookup
        const upperName = envVarName.toUpperCase();
        for (const [key, value] of Object.entries(process.env)) {
            if (key.toUpperCase() === upperName && value) {
                return value;
            }
        }
        return null;
    }

    /**
     * Gets the encryption key from the configured environment variable.
     * @returns The encryption key or null if not configured
     */
    private async getEncryptionKey(): Promise<string | null> {
        const settings = await getGlobalSettings();
        const envVarName = settings.encryptionKeyEnvVar;
        return this.getEnvVarValue(envVarName);
    }

    /**
     * Checks if a key has been configured (salt exists in SecretStorage).
     */
    private async isKeyConfigured(): Promise<boolean> {
        if (!this.secretStorage) {
            return false;
        }
        const salt = await this.secretStorage.get(this.SALT_KEY);
        return salt !== undefined;
    }

    /**
     * Gets or generates the salt for key derivation.
     * @returns The salt as a Buffer
     */
    private async getOrCreateSalt(): Promise<Buffer> {
        if (!this.secretStorage) {
            throw new Error('SecurityService not initialized. Call initialize() first.');
        }

        let saltHex = await this.secretStorage.get(this.SALT_KEY);
        if (!saltHex) {
            // Generate new salt
            const salt = crypto.randomBytes(this.SALT_LENGTH);
            saltHex = salt.toString('hex');
            await this.secretStorage.store(this.SALT_KEY, saltHex);
        }
        return Buffer.from(saltHex, 'hex');
    }

    /**
     * Derives a 256-bit key from the password using PBKDF2.
     * @param password The password (from environment variable)
     * @param salt The salt for key derivation
     * @returns The derived key as a Buffer
     */
    private deriveKey(password: string, salt: Buffer): Buffer {
        return crypto.pbkdf2Sync(
            password,
            salt,
            this.PBKDF2_ITERATIONS,
            this.KEY_LENGTH,
            'sha256'
        );
    }

    /**
     * Computes a hash of the derived key for verification.
     * @param derivedKey The derived key
     * @returns The hash as a hex string
     */
    private computeKeyHash(derivedKey: Buffer): string {
        return crypto.createHash('sha256').update(derivedKey).digest('hex');
    }

    /**
     * Sets up encryption with the current environment variable value.
     * Stores salt and key hash in SecretStorage.
     * @throws Error if encryption key is not configured
     */
    async setupEncryption(): Promise<void> {
        if (!this.secretStorage) {
            throw new Error('SecurityService not initialized. Call initialize() first.');
        }

        const encryptionKey = await this.getEncryptionKey();
        if (!encryptionKey) {
            throw new Error('Encryption key not found. Set the environment variable specified in settings.');
        }

        const salt = await this.getOrCreateSalt();
        const derivedKey = this.deriveKey(encryptionKey, salt);
        const keyHash = this.computeKeyHash(derivedKey);

        await this.secretStorage.store(this.KEY_HASH_KEY, keyHash);
    }

    /**
     * Verifies that the current encryption key matches the stored key hash.
     * @returns true if the key is valid
     */
    async verifyCurrentKey(): Promise<boolean> {
        if (!this.secretStorage) {
            return false;
        }

        const encryptionKey = await this.getEncryptionKey();
        if (!encryptionKey) {
            return false;
        }

        const saltHex = await this.secretStorage.get(this.SALT_KEY);
        if (!saltHex) {
            return false;
        }

        const storedKeyHash = await this.secretStorage.get(this.KEY_HASH_KEY);
        if (!storedKeyHash) {
            return false;
        }

        const salt = Buffer.from(saltHex, 'hex');
        const derivedKey = this.deriveKey(encryptionKey, salt);
        const currentKeyHash = this.computeKeyHash(derivedKey);

        return currentKeyHash === storedKeyHash;
    }

    /**
     * Encrypts a string using AES-256-GCM.
     * @param plaintext The plaintext to encrypt
     * @returns The encrypted data as a JSON string
     * @throws Error if encryption is not enabled or key is invalid
     */
    async encrypt(plaintext: string): Promise<string> {
        const encryptionKey = await this.getEncryptionKey();
        if (!encryptionKey) {
            throw new Error('Encryption key not found. Set the environment variable specified in settings.');
        }

        const salt = await this.getOrCreateSalt();
        const derivedKey = this.deriveKey(encryptionKey, salt);

        // Generate random IV
        const iv = crypto.randomBytes(this.IV_LENGTH);

        // Create cipher
        const cipher = crypto.createCipheriv(this.ALGORITHM, derivedKey, iv, {
            authTagLength: this.AUTH_TAG_LENGTH
        });

        // Encrypt
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');

        // Get auth tag
        const authTag = cipher.getAuthTag();

        // Create encrypted data structure
        const encryptedData: EncryptedData = {
            version: this.ENCRYPTION_VERSION,
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            data: encrypted
        };

        return JSON.stringify(encryptedData);
    }

    /**
     * Decrypts a string using AES-256-GCM.
     * @param ciphertext The encrypted data as a JSON string
     * @returns The decrypted plaintext
     * @throws Error if decryption fails or key is invalid
     */
    async decrypt(ciphertext: string): Promise<string> {
        const encryptionKey = await this.getEncryptionKey();
        if (!encryptionKey) {
            throw new Error('Encryption key not found. Set the environment variable specified in settings.');
        }

        const salt = await this.getOrCreateSalt();
        const derivedKey = this.deriveKey(encryptionKey, salt);

        // Parse encrypted data
        let encryptedData: EncryptedData;
        try {
            encryptedData = JSON.parse(ciphertext);
        } catch {
            throw new Error('Invalid encrypted data format');
        }

        if (encryptedData.version !== this.ENCRYPTION_VERSION) {
            throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
        }

        // Decode components
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        const encrypted = encryptedData.data;

        // Create decipher
        const decipher = crypto.createDecipheriv(this.ALGORITHM, derivedKey, iv, {
            authTagLength: this.AUTH_TAG_LENGTH
        });
        decipher.setAuthTag(authTag);

        // Decrypt
        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Decrypts data using a provided key (for recovery).
     * @param ciphertext The encrypted data
     * @param recoveryKey The recovery key (original env var value)
     * @param salt The salt used for encryption
     * @returns The decrypted plaintext
     */
    private decryptWithKey(ciphertext: string, recoveryKey: string, salt: Buffer): string {
        const derivedKey = this.deriveKey(recoveryKey, salt);

        let encryptedData: EncryptedData;
        try {
            encryptedData = JSON.parse(ciphertext);
        } catch {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(encryptedData.iv, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        const encrypted = encryptedData.data;

        const decipher = crypto.createDecipheriv(this.ALGORITHM, derivedKey, iv, {
            authTagLength: this.AUTH_TAG_LENGTH
        });
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Encrypts data using a provided key (for recovery/re-encryption).
     * @param plaintext The plaintext to encrypt
     * @param key The encryption key
     * @param salt The salt for key derivation
     * @returns The encrypted data as a JSON string
     */
    private encryptWithKey(plaintext: string, key: string, salt: Buffer): string {
        const derivedKey = this.deriveKey(key, salt);
        const iv = crypto.randomBytes(this.IV_LENGTH);

        const cipher = crypto.createCipheriv(this.ALGORITHM, derivedKey, iv, {
            authTagLength: this.AUTH_TAG_LENGTH
        });

        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();

        const encryptedData: EncryptedData = {
            version: this.ENCRYPTION_VERSION,
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            data: encrypted
        };

        return JSON.stringify(encryptedData);
    }

    /**
     * Checks if a file content appears to be encrypted (has our encryption format).
     * @param content The file content
     * @returns true if the content appears encrypted
     */
    isEncryptedContent(content: string): boolean {
        try {
            const data = JSON.parse(content);
            return (
                typeof data === 'object' &&
                data.version === this.ENCRYPTION_VERSION &&
                typeof data.iv === 'string' &&
                typeof data.authTag === 'string' &&
                typeof data.data === 'string'
            );
        } catch {
            return false;
        }
    }

    /**
     * Reads and decrypts a JSON file.
     * @param filePath The path to the encrypted file
     * @param defaultValue The default value if file doesn't exist
     * @returns The decrypted and parsed JSON data
     * @throws Error if decryption fails
     */
    async readEncryptedFile<T>(filePath: string, defaultValue: T): Promise<T> {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }

        const content = fs.readFileSync(filePath, 'utf8');

        // Check if encryption is enabled
        const encryptionEnabled = await this.isEncryptionEnabled();

        if (encryptionEnabled) {
            // If encryption is enabled, content must be encrypted
            if (this.isEncryptedContent(content)) {
                const decrypted = await this.decrypt(content);
                return JSON.parse(decrypted);
            } else {
                // File is not encrypted but encryption is enabled
                // This could be a migration scenario - for now, throw error
                throw new Error(
                    `File ${filePath} is not encrypted but encryption is enabled. ` +
                    'Run encryptAllFiles() to encrypt existing files.'
                );
            }
        } else {
            // Encryption not enabled - read as plain JSON
            if (this.isEncryptedContent(content)) {
                throw new Error(
                    `File ${filePath} is encrypted but encryption is not enabled. ` +
                    'Configure the encryption key environment variable or use recovery.'
                );
            }
            return JSON.parse(content);
        }
    }

    /**
     * Encrypts and writes data to a JSON file.
     * @param filePath The path to the file
     * @param data The data to encrypt and write
     */
    async writeEncryptedFile<T>(filePath: string, data: T): Promise<void> {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const encryptionEnabled = await this.isEncryptionEnabled();
        const jsonData = JSON.stringify(data, null, 2);

        if (encryptionEnabled) {
            // Ensure encryption is set up
            if (!(await this.isKeyConfigured())) {
                await this.setupEncryption();
            }
            const encrypted = await this.encrypt(jsonData);
            fs.writeFileSync(filePath, encrypted);
        } else {
            // Write as plain JSON
            fs.writeFileSync(filePath, jsonData);
        }
    }

    /**
     * Gets all JSON files in the app directory that should be encrypted.
     * Excludes settings.json.
     * @returns Array of file paths
     */
    async getEncryptableFiles(): Promise<string[]> {
        const settings = await getGlobalSettings();
        const appDir = settings.saveFilesLocation;

        if (!fs.existsSync(appDir)) {
            return [];
        }

        const files: string[] = [];
        const scanDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    scanDir(fullPath);
                } else if (
                    entry.isFile() &&
                    entry.name.endsWith('.json') &&
                    entry.name !== 'settings.json'
                ) {
                    files.push(fullPath);
                }
            }
        };

        scanDir(appDir);
        return files;
    }

    /**
     * Encrypts all existing files in the app directory.
     * Rolls back all changes if any file fails.
     * @throws Error if encryption fails
     */
    async encryptAllFiles(): Promise<{ encrypted: number; skipped: number }> {
        const encryptionKey = await this.getEncryptionKey();
        if (!encryptionKey) {
            throw new Error('Encryption key not found. Set the environment variable specified in settings.');
        }

        // Ensure encryption is set up
        if (!(await this.isKeyConfigured())) {
            await this.setupEncryption();
        }

        const files = await this.getEncryptableFiles();
        const backups: Map<string, string> = new Map();
        let encrypted = 0;
        let skipped = 0;

        try {
            for (const filePath of files) {
                const content = fs.readFileSync(filePath, 'utf8');

                // Skip already encrypted files
                if (this.isEncryptedContent(content)) {
                    skipped++;
                    continue;
                }

                // Backup original content
                backups.set(filePath, content);

                // Verify it's valid JSON before encrypting
                try {
                    JSON.parse(content);
                } catch {
                    throw new Error(`File ${filePath} is not valid JSON`);
                }

                // Encrypt and save
                const encryptedContent = await this.encrypt(content);
                fs.writeFileSync(filePath, encryptedContent);
                encrypted++;
            }

            return { encrypted, skipped };
        } catch (error) {
            // Rollback all changes
            for (const [filePath, originalContent] of backups) {
                try {
                    fs.writeFileSync(filePath, originalContent);
                } catch (rollbackError) {
                    console.error(`Failed to rollback ${filePath}:`, rollbackError);
                }
            }
            throw error;
        }
    }

    /**
     * Decrypts all encrypted files (useful before key rotation or removal).
     * Rolls back all changes if any file fails.
     * @throws Error if decryption fails
     */
    async decryptAllFiles(): Promise<{ decrypted: number; skipped: number }> {
        const files = await this.getEncryptableFiles();
        const backups: Map<string, string> = new Map();
        let decrypted = 0;
        let skipped = 0;

        try {
            for (const filePath of files) {
                const content = fs.readFileSync(filePath, 'utf8');

                // Skip non-encrypted files
                if (!this.isEncryptedContent(content)) {
                    skipped++;
                    continue;
                }

                // Backup original content
                backups.set(filePath, content);

                // Decrypt and save as formatted JSON
                const decryptedContent = await this.decrypt(content);
                const formattedJson = JSON.stringify(JSON.parse(decryptedContent), null, 2);
                fs.writeFileSync(filePath, formattedJson);
                decrypted++;
            }

            return { decrypted, skipped };
        } catch (error) {
            // Rollback all changes
            for (const [filePath, originalContent] of backups) {
                try {
                    fs.writeFileSync(filePath, originalContent);
                } catch (rollbackError) {
                    console.error(`Failed to rollback ${filePath}:`, rollbackError);
                }
            }
            throw error;
        }
    }

    /**
     * Re-encrypts all files with the current key after key rotation.
     * @param oldKey The previous encryption key
     * @throws Error if re-encryption fails
     */
    async reEncryptAllFiles(oldKey: string): Promise<{ reEncrypted: number; skipped: number }> {
        if (!this.secretStorage) {
            throw new Error('SecurityService not initialized');
        }

        const newKey = await this.getEncryptionKey();
        if (!newKey) {
            throw new Error('New encryption key not found');
        }

        const saltHex = await this.secretStorage.get(this.SALT_KEY);
        if (!saltHex) {
            throw new Error('Salt not found. Run setupEncryption() first.');
        }

        const salt = Buffer.from(saltHex, 'hex');
        const files = await this.getEncryptableFiles();
        const backups: Map<string, string> = new Map();
        let reEncrypted = 0;
        let skipped = 0;

        try {
            for (const filePath of files) {
                const content = fs.readFileSync(filePath, 'utf8');

                // Skip non-encrypted files
                if (!this.isEncryptedContent(content)) {
                    skipped++;
                    continue;
                }

                // Backup original content
                backups.set(filePath, content);

                // Decrypt with old key and encrypt with new key
                const decrypted = this.decryptWithKey(content, oldKey, salt);
                const reEncrypted_content = this.encryptWithKey(decrypted, newKey, salt);
                fs.writeFileSync(filePath, reEncrypted_content);
                reEncrypted++;
            }

            // Update key hash with new key
            const derivedKey = this.deriveKey(newKey, salt);
            const keyHash = this.computeKeyHash(derivedKey);
            await this.secretStorage.store(this.KEY_HASH_KEY, keyHash);

            return { reEncrypted, skipped };
        } catch (error) {
            // Rollback all changes
            for (const [filePath, originalContent] of backups) {
                try {
                    fs.writeFileSync(filePath, originalContent);
                } catch (rollbackError) {
                    console.error(`Failed to rollback ${filePath}:`, rollbackError);
                }
            }
            throw error;
        }
    }

    /**
     * Exports a recovery key file that can be used to recover access.
     * @param outputPath The path to save the recovery key file
     * @throws Error if encryption is not set up
     */
    async exportRecoveryKey(outputPath: string): Promise<void> {
        if (!this.secretStorage) {
            throw new Error('SecurityService not initialized');
        }

        const saltHex = await this.secretStorage.get(this.SALT_KEY);
        const keyHash = await this.secretStorage.get(this.KEY_HASH_KEY);

        if (!saltHex || !keyHash) {
            throw new Error('Encryption not set up. No recovery key to export.');
        }

        const settings = await getGlobalSettings();

        const recoveryData: RecoveryKeyData = {
            version: this.ENCRYPTION_VERSION,
            salt: saltHex,
            keyHash: keyHash,
            createdAt: new Date().toISOString(),
            envVarName: settings.encryptionKeyEnvVar
        };

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(recoveryData, null, 2));
    }

    /**
     * Recovers encryption configuration from a recovery key file.
     * @param keyFilePath The path to the .waveclient-key file
     * @param recoveryKey The original encryption key (env var value)
     * @throws Error if recovery fails
     */
    async recoverWithKeyFile(keyFilePath: string, recoveryKey: string): Promise<void> {
        if (!this.secretStorage) {
            throw new Error('SecurityService not initialized');
        }

        if (!fs.existsSync(keyFilePath)) {
            throw new Error(`Recovery key file not found: ${keyFilePath}`);
        }

        const content = fs.readFileSync(keyFilePath, 'utf8');
        let recoveryData: RecoveryKeyData;

        try {
            recoveryData = JSON.parse(content);
        } catch {
            throw new Error('Invalid recovery key file format');
        }

        if (recoveryData.version !== this.ENCRYPTION_VERSION) {
            throw new Error(`Unsupported recovery file version: ${recoveryData.version}`);
        }

        // Verify the recovery key matches
        const salt = Buffer.from(recoveryData.salt, 'hex');
        const derivedKey = this.deriveKey(recoveryKey, salt);
        const keyHash = this.computeKeyHash(derivedKey);

        if (keyHash !== recoveryData.keyHash) {
            throw new Error('Recovery key does not match. Please provide the correct key.');
        }

        // Restore salt and key hash to SecretStorage
        await this.secretStorage.store(this.SALT_KEY, recoveryData.salt);
        await this.secretStorage.store(this.KEY_HASH_KEY, recoveryData.keyHash);
    }

    /**
     * Clears all encryption configuration from SecretStorage.
     * Use with caution - files will become unreadable if still encrypted.
     */
    async clearEncryptionConfig(): Promise<void> {
        if (!this.secretStorage) {
            throw new Error('SecurityService not initialized');
        }

        await this.secretStorage.delete(this.SALT_KEY);
        await this.secretStorage.delete(this.KEY_HASH_KEY);
    }
}

// Export singleton instance and register with BaseStorageService
export const securityService = SecurityService.getInstance();

// Register the security service instance with BaseStorageService to avoid circular dependency
setSecurityServiceInstance(securityService);
