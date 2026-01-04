import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { SettingsService } from '../../services/SettingsService.js';
import type { AppSettings } from '../../types.js';
import { MockFileSystem } from '../mocks/fs.js';

// Create mock instance that will be used across all tests
const mockFs = new MockFileSystem();

// Get the actual homedir to use in tests (since we can't mock os.homedir effectively)
const testHomeDir = os.homedir();
const testAppDir = path.join(testHomeDir, '.waveclient');
const testSettingsPath = path.join(testAppDir, 'settings.json');

// Mock fs module with inline factory function
vi.mock('fs', () => {
    return {
        existsSync: vi.fn((path: string) => {
            return mockFs.hasFile(path) || mockFs.hasDirectory(path);
        }),

        readFileSync: vi.fn((path: string, _encoding?: string) => {
            const content = mockFs.getFile(path);
            if (content === undefined) {
                throw new Error(`ENOENT: no such file or directory, open '${path}'`);
            }
            return content;
        }),

        writeFileSync: vi.fn((path: string, data: string) => {
            mockFs.setFile(path, data);
        }),

        mkdirSync: vi.fn((path: string, _options?: { recursive?: boolean }) => {
            mockFs.addDirectory(path);
        }),

        unlinkSync: vi.fn((path: string) => {
            if (!mockFs.hasFile(path)) {
                throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
            }
            mockFs.deleteFile(path);
        }),

        readdirSync: vi.fn((path: string) => {
            return mockFs.getFilesInDirectory(path);
        }),

        renameSync: vi.fn((oldPath: string, newPath: string) => {
            mockFs.renameFile(oldPath, newPath);
        }),
    };
});

describe('SettingsService', () => {
    let service: SettingsService;

    beforeEach(() => {
        mockFs.reset();
        // Clear process.env for consistent testing
        delete process.env.WAVECLIENT_SECRET_KEY;
        delete process.env.MY_CUSTOM_KEY;
        
        // Ensure the directory exists in mock filesystem
        mockFs.addDirectory(testAppDir);
        
        service = new SettingsService();
        // Invalidate any cached settings from previous tests
        service.invalidateCache();
    });

    describe('getDefaultSettings', () => {
        it('should return default settings with correct structure', () => {
            const defaults = service.getDefaultSettings();

            expect(defaults).toMatchObject({
                saveFilesLocation: testAppDir,
                maxRedirects: 5,
                requestTimeoutSeconds: 0,
                maxHistoryItems: 10,
                commonHeaderNames: [],
                encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
                encryptionKeyValidationStatus: 'none',
                ignoreCertificateValidation: false,
            });
        });

        it('should use homedir for default save location', () => {
            const defaults = service.getDefaultSettings();
            expect(defaults.saveFilesLocation).toContain('.waveclient');
        });
    });

    describe('load', () => {
        it('should return default settings when file does not exist', async () => {
            const settings = await service.load();

            expect(settings).toMatchObject({
                saveFilesLocation: testAppDir,
                maxRedirects: 5,
                requestTimeoutSeconds: 0,
            });
        });

        it('should load settings from file when it exists', async () => {
            const savedSettings: Partial<AppSettings> = {
                maxRedirects: 10,
                requestTimeoutSeconds: 30,
                maxHistoryItems: 20,
            };

            mockFs.setFile(
                testSettingsPath,
                JSON.stringify(savedSettings)
            );

            const settings = await service.load();

            expect(settings.maxRedirects).toBe(10);
            expect(settings.requestTimeoutSeconds).toBe(30);
            expect(settings.maxHistoryItems).toBe(20);
            // Should merge with defaults
            expect(settings.saveFilesLocation).toBe(testAppDir);
        });

        it('should merge loaded settings with defaults to fill missing fields', async () => {
            const partialSettings = {
                maxRedirects: 15,
            };

            mockFs.setFile(
                testSettingsPath,
                JSON.stringify(partialSettings)
            );

            const settings = await service.load();

            expect(settings.maxRedirects).toBe(15);
            expect(settings.requestTimeoutSeconds).toBe(0); // default
            expect(settings.saveFilesLocation).toBe(testAppDir); // default
        });

        it('should return defaults if settings file is corrupted', async () => {
            mockFs.setFile(
                testSettingsPath,
                'invalid json {{{'
            );

            const settings = await service.load();

            // Should fall back to defaults
            expect(settings).toMatchObject({
                saveFilesLocation: testAppDir,
                maxRedirects: 5,
            });
        });

        it('should cache settings after loading', async () => {
            const savedSettings: Partial<AppSettings> = {
                maxRedirects: 8,
            };

            mockFs.setFile(
                testSettingsPath,
                JSON.stringify(savedSettings)
            );

            const settings1 = await service.load();
            const settings2 = await service.getCached();

            expect(settings1).toBe(settings2); // Same object reference (cached)
        });
    });

    describe('save', () => {
        it('should save settings to file', async () => {
            const settings: AppSettings = {
                saveFilesLocation: '/custom/path',
                maxRedirects: 7,
                requestTimeoutSeconds: 60,
                maxHistoryItems: 15,
                commonHeaderNames: ['X-Custom-Header'],
                encryptionKeyEnvVar: 'MY_KEY',
                encryptionKeyValidationStatus: 'none',
                ignoreCertificateValidation: true,
            };

            await service.save(settings);

            const savedContent = mockFs.getFile(
                testSettingsPath
            ) as string;
            const savedSettings = JSON.parse(savedContent);

            expect(savedSettings.maxRedirects).toBe(7);
            expect(savedSettings.requestTimeoutSeconds).toBe(60);
            expect(savedSettings.saveFilesLocation).toBe('/custom/path');
        });

        it('should update cache after saving', async () => {
            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                maxRedirects: 12,
            };

            await service.save(settings);
            const cached = await service.getCached();

            expect(cached.maxRedirects).toBe(12);
        });

        it('should validate encryption key env var and set status to "none" when not specified', async () => {
            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                encryptionKeyEnvVar: '',
            };

            const result = await service.save(settings);

            expect(result.encryptionKeyValidationStatus).toBe('none');
        });

        it('should validate encryption key env var and set status to "valid" when found', async () => {
            process.env.MY_CUSTOM_KEY = 'my-secret-value';

            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                encryptionKeyEnvVar: 'MY_CUSTOM_KEY',
                encryptionKeyValidationStatus: 'none', // Will be updated
            };

            const result = await service.save(settings);

            expect(result.encryptionKeyValidationStatus).toBe('valid');
        });

        it('should validate encryption key env var and set status to "invalid" when not found', async () => {
            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                encryptionKeyEnvVar: 'NONEXISTENT_KEY',
                encryptionKeyValidationStatus: 'none', // Will be updated
            };

            const result = await service.save(settings);

            expect(result.encryptionKeyValidationStatus).toBe('invalid');
        });

        it('should validate encryption key env var case-insensitively', async () => {
            process.env.MY_KEY = 'value';

            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                encryptionKeyEnvVar: 'my_key', // lowercase
                encryptionKeyValidationStatus: 'none',
            };

            const result = await service.save(settings);

            expect(result.encryptionKeyValidationStatus).toBe('valid');
        });

        it('should validate encryption key env var and set status to "invalid" when value is empty', async () => {
            process.env.EMPTY_KEY = '';

            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                encryptionKeyEnvVar: 'EMPTY_KEY',
                encryptionKeyValidationStatus: 'none',
            };

            const result = await service.save(settings);

            expect(result.encryptionKeyValidationStatus).toBe('invalid');
        });
    });

    describe('getCached', () => {
        it('should return cached settings without reloading', async () => {
            const savedSettings: Partial<AppSettings> = {
                maxRedirects: 9,
            };

            mockFs.setFile(
                testSettingsPath,
                JSON.stringify(savedSettings)
            );

            await service.load();
            
            // Change the file on disk
            mockFs.setFile(
                testSettingsPath,
                JSON.stringify({ maxRedirects: 99 })
            );

            const cached = await service.getCached();

            // Should still return the cached value, not the new one
            expect(cached.maxRedirects).toBe(9);
        });

        it('should load from disk if cache is empty', async () => {
            const savedSettings: Partial<AppSettings> = {
                maxRedirects: 11,
            };

            mockFs.setFile(
                testSettingsPath,
                JSON.stringify(savedSettings)
            );

            const cached = await service.getCached();

            expect(cached.maxRedirects).toBe(11);
        });
    });

    describe('invalidateCache', () => {
        it('should clear cached settings', async () => {
            const savedSettings: Partial<AppSettings> = {
                maxRedirects: 6,
            };

            mockFs.setFile(
                testSettingsPath,
                JSON.stringify(savedSettings)
            );

            await service.load();
            service.invalidateCache();

            // Change the file on disk
            mockFs.setFile(
                testSettingsPath,
                JSON.stringify({ maxRedirects: 66 })
            );

            const reloaded = await service.getCached();

            // Should reload from disk after invalidation
            expect(reloaded.maxRedirects).toBe(66);
        });
    });

    describe('getAppDirectory', () => {
        it('should return app directory from settings', () => {
            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                saveFilesLocation: '/custom/app/dir',
            };

            const appDir = service.getAppDirectory(settings);

            expect(appDir).toBe('/custom/app/dir');
        });

        it('should return default app directory when no settings provided', () => {
            const appDir = service.getAppDirectory();

            expect(appDir).toContain('.waveclient');
        });

        it('should return default app directory when saveFilesLocation is empty', () => {
            const settings: AppSettings = {
                ...service.getDefaultSettings(),
                saveFilesLocation: '',
            };

            const appDir = service.getAppDirectory(settings);

            expect(appDir).toContain('.waveclient');
        });
    });
});
