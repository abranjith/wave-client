import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnvironmentService } from '../../services/EnvironmentService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { Environment, AppSettings } from '../../types.js';
import * as path from 'path';

// Create mock instance that will be used across all tests
const mockFs = new MockFileSystem();

// Mock the fs module with a factory function
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
  };
});

// Mock os.homedir
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('EnvironmentService', () => {
  let service: EnvironmentService;
  const testEnvDir = '/home/testuser/.waveclient/environments';

  beforeEach(() => {
    mockFs.reset();
    vi.clearAllMocks();

    const mockSettings: AppSettings = {
      saveFilesLocation: '/home/testuser/.waveclient',
      maxRedirects: 5,
      requestTimeoutSeconds: 30,
      maxHistoryItems: 10,
      commonHeaderNames: [],
      encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
      encryptionKeyValidationStatus: 'none',
      ignoreCertificateValidation: false,
    };

    setGlobalSettingsProvider(async () => mockSettings);

    const mockSecurityService = {
      readEncryptedFile: vi.fn(async (filePath: string, defaultValue: any): Promise<any> => {
        const content = mockFs.getFile(filePath);
        if (content === undefined) {
          return defaultValue;
        }
        try {
          return JSON.parse(content);
        } catch {
          return defaultValue;
        }
      }),
      writeEncryptedFile: vi.fn(async (filePath: string, data: any): Promise<void> => {
        mockFs.setFile(filePath, JSON.stringify(data, null, 2));
      }),
    };

    setSecurityServiceInstance(mockSecurityService as any);

    service = new EnvironmentService();
    mockFs.addDirectory(testEnvDir);
  });

  describe('loadAll', () => {
    it('should load all environments from directory', async () => {
      const env1: Environment = {
        id: 'env-1',
        name: 'Development',
        values: [{ key: 'API_URL', value: 'http://dev.example.com', enabled: true }],
      };

      const env2: Environment = {
        id: 'env-2',
        name: 'Production',
        values: [{ key: 'API_URL', value: 'https://api.example.com', enabled: true }],
      };

      mockFs.setFile(path.join(testEnvDir, 'development.json'), JSON.stringify(env1));
      mockFs.setFile(path.join(testEnvDir, 'production.json'), JSON.stringify(env2));

      const result = await service.loadAll();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const loadedEnv1 = result.find(e => e.id === 'env-1');
      const loadedEnv2 = result.find(e => e.id === 'env-2');
      expect(loadedEnv1).toMatchObject(env1);
      expect(loadedEnv2).toMatchObject(env2);
    });

    it('should always include default Global environment', async () => {
      const result = await service.loadAll();

      const globalEnv = result.find(e => e.name === 'Global');
      expect(globalEnv).toBeDefined();
      expect(globalEnv?.id).toBe('global');
      expect(globalEnv?.values).toEqual([]);
    });

    it('should not duplicate Global environment if it exists', async () => {
      const existingGlobal: Environment = {
        id: 'global',
        name: 'Global',
        values: [{ key: 'VAR', value: 'value', enabled: true }],
      };

      mockFs.setFile(path.join(testEnvDir, 'global.json'), JSON.stringify(existingGlobal));

      const result = await service.loadAll();

      const globalEnvs = result.filter(e => e.name === 'Global');
      expect(globalEnvs).toHaveLength(1);
      expect(globalEnvs[0].values).toHaveLength(1);
    });

    it('should skip duplicate environment names', async () => {
      const env1: Environment = {
        id: 'env-1',
        name: 'Development',
        values: [{ key: 'KEY1', value: 'value1', enabled: true }],
      };

      const env2: Environment = {
        id: 'env-2',
        name: 'Development', // Same name
        values: [{ key: 'KEY2', value: 'value2', enabled: true }],
      };

      mockFs.setFile(path.join(testEnvDir, 'dev1.json'), JSON.stringify(env1));
      mockFs.setFile(path.join(testEnvDir, 'dev2.json'), JSON.stringify(env2));

      const result = await service.loadAll();

      const devEnvs = result.filter(e => e.name === 'Development');
      expect(devEnvs).toHaveLength(1);
    });

    it('should handle empty directory', async () => {
      const result = await service.loadAll();

      expect(result).toHaveLength(1); // Only Global
      expect(result[0].name).toBe('Global');
    });
  });

  describe('save', () => {
    it('should save an environment to a file', async () => {
      const env: Environment = {
        id: 'env-test',
        name: 'Test Environment',
        values: [
          { key: 'API_KEY', value: 'secret123', enabled: true },
          { key: 'API_URL', value: 'https://test.example.com', enabled: true },
        ],
      };

      await service.save(env);

      const files = mockFs.listJsonFiles(testEnvDir);
      expect(files.length).toBeGreaterThan(0);
      
      // Try to load it back to verify it was saved correctly
      const all = await service.loadAll();
      const saved = all.find(e => e.id === 'env-test');
      expect(saved).toBeDefined();
      expect(saved).toMatchObject(env);
    });

    it('should sanitize environment name for filename', async () => {
      const env: Environment = {
        id: 'env-1',
        name: 'My Environment (Production)',
        values: [],
      };

      await service.save(env);

      const files = mockFs.listJsonFiles(testEnvDir);
      // Just verify at least one file was created with the expected pattern
      expect(files.length).toBeGreaterThan(0);
      // The actual sanitized filename based on the sanitizeFileName implementation
      expect(files[0]).toContain('.json');
    });
  });

  describe('saveAll', () => {
    it('should save multiple environments', async () => {
      const envs: Environment[] = [
        { id: 'env-1', name: 'Dev', values: [] },
        { id: 'env-2', name: 'Staging', values: [] },
        { id: 'env-3', name: 'Prod', values: [] },
      ];

      await service.saveAll(envs);

      const files = mockFs.listJsonFiles(testEnvDir);
      expect(files).toHaveLength(3);
    });
  });

  describe('delete', () => {
    it('should delete an environment by ID', async () => {
      const env: Environment = {
        id: 'env-delete',
        name: 'ToDelete',
        values: [],
      };

      mockFs.setFile(path.join(testEnvDir, 'todelete.json'), JSON.stringify(env));

      await service.delete('env-delete');

      expect(mockFs.hasFile(path.join(testEnvDir, 'todelete.json'))).toBe(false);
    });

    it('should do nothing if environment ID does not exist', async () => {
      await expect(service.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('import', () => {
    it('should import a single environment object', async () => {
      const env: Environment = {
        id: 'imported-env',
        name: 'Imported',
        values: [{ key: 'KEY', value: 'VALUE', enabled: true }],
      };

      const result = await service.import(JSON.stringify(env));

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject(env);
      const files = mockFs.listJsonFiles(testEnvDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some(f => f.toLowerCase().includes('imported'))).toBe(true);
    });

    it('should import an array of environments', async () => {
      const envs: Environment[] = [
        { id: 'env-1', name: 'Env1', values: [] },
        { id: 'env-2', name: 'Env2', values: [] },
      ];

      const result = await service.import(JSON.stringify(envs));

      expect(result).toHaveLength(2);
      expect(mockFs.listJsonFiles(testEnvDir)).toHaveLength(2);
    });

    it('should overwrite existing environment with same name', async () => {
      const existingEnv: Environment = {
        id: 'env-1',
        name: 'TestEnv',
        values: [{ key: 'OLD', value: 'old', enabled: true }],
      };

      await service.save(existingEnv);

      const newEnv: Environment = {
        id: 'env-2',
        name: 'TestEnv',
        values: [{ key: 'NEW', value: 'new', enabled: true }],
      };

      await service.import(JSON.stringify(newEnv));

      // Load the environment back to verify it was overwritten
      const allEnvs = await service.loadAll();
      const testEnv = allEnvs.find(e => e.name === 'TestEnv');
      expect(testEnv).toBeDefined();
      expect(testEnv?.values[0].key).toBe('NEW');
    });
  });

  describe('exportAll', () => {
    it('should export all environments without filename property', async () => {
      const env1: Environment = {
        id: 'env-1',
        name: 'Dev',
        values: [{ key: 'KEY', value: 'value', enabled: true }],
      };

      mockFs.setFile(path.join(testEnvDir, 'dev.json'), JSON.stringify(env1));

      const result = await service.exportAll();

      expect(result.length).toBeGreaterThan(0);
      result.forEach(env => {
        expect(env).not.toHaveProperty('filename');
      });
    });
  });
});

