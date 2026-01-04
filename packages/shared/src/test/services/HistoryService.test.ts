import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryService } from '../../services/HistoryService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { ParsedRequest, AppSettings } from '../../types.js';
import * as path from 'path';

// Create mock instance
const mockFs = new MockFileSystem();

// Mock fs module
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

    renameSync: vi.fn((oldPath: string, newPath: string) => {
      const content = mockFs.getFile(oldPath);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`);
      }
      mockFs.setFile(newPath, content);
      mockFs.deleteFile(oldPath);
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

// Mock crypto.randomUUID
vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-' + Date.now()),
}));

describe('HistoryService', () => {
  let service: HistoryService;
  const testHistoryDir = '/home/testuser/.waveclient/history';

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

    service = new HistoryService();
    mockFs.addDirectory(testHistoryDir);
  });

  describe('loadAll', () => {
    it('should load all history items sorted by most recent first', async () => {
      const req1: ParsedRequest = {
        id: 'req-1',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      const req2: ParsedRequest = {
        id: 'req-2',
        name: 'Create Post',
        method: 'POST',
        url: 'https://api.example.com/posts',
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      mockFs.setFile(path.join(testHistoryDir, '1.json'), JSON.stringify(req1));
      mockFs.setFile(path.join(testHistoryDir, '2.json'), JSON.stringify(req2));

      const result = await service.loadAll();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('req-2'); // Most recent first
      expect(result[1].id).toBe('req-1');
    });

    it('should return empty array when no history exists', async () => {
      const result = await service.loadAll();

      expect(result).toEqual([]);
    });

    it('should handle corrupted history files gracefully', async () => {
      const validReq: ParsedRequest = {
        id: 'req-1', name: 'Test Request', method: 'GET',
        url: 'https://api.example.com',
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      mockFs.setFile(path.join(testHistoryDir, '1.json'), JSON.stringify(validReq));
      mockFs.setFile(path.join(testHistoryDir, '2.json'), 'invalid json {');

      const result = await service.loadAll();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('req-1');
    });
  });

  describe('save', () => {
    it('should save a new request to history', async () => {
      const request: ParsedRequest = {
        id: 'req-new', name: 'Test Request', method: 'GET',
        url: 'https://api.example.com/data',
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      await service.save(JSON.stringify(request));

      const files = mockFs.listJsonFiles(testHistoryDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('1.json');
    });

    it('should remove duplicate requests', async () => {
      const request: ParsedRequest = {
        id: 'req-1', name: 'Test Request', method: 'GET',
        url: 'https://api.example.com/data',
        headers: [{ key: 'Accept', value: 'application/json' }],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      // Save initial request
      await service.save(JSON.stringify(request));
      expect(mockFs.listJsonFiles(testHistoryDir)).toHaveLength(1);

      // Save duplicate (same content, different ID)
      const duplicate = { ...request, id: 'req-2' };
      await service.save(JSON.stringify(duplicate));

      // Should still have only 1 file
      const files = mockFs.listJsonFiles(testHistoryDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe('1.json');
    });

    it('should enforce maximum history items limit', async () => {
      // Create history with max items (10)
      for (let i = 1; i <= 10; i++) {
        const req: ParsedRequest = {
          id: `req-${i}`,
          name: `Request ${i}`,
          method: 'GET',
          url: `https://api.example.com/item${i}`,
          headers: [],
          params: [],
          body: { mode: 'none' },
          timestamp: Date.now(),
        };
        mockFs.setFile(path.join(testHistoryDir, `${i}.json`), JSON.stringify(req));
      }

      // Add one more (11th item)
      const newReq: ParsedRequest = {
        id: 'req-new', name: 'Test Request', method: 'GET',
        url: 'https://api.example.com/new',
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      await service.save(JSON.stringify(newReq));

      const files = mockFs.listJsonFiles(testHistoryDir);
      expect(files).toHaveLength(10); // Should maintain max of 10
    });

    it('should renumber files after removing duplicate', async () => {
      // Create files 1.json, 2.json, 3.json
      for (let i = 1; i <= 3; i++) {
        const req: ParsedRequest = {
          id: `req-${i}`,
          name: `Request ${i}`,
          method: 'GET',
          url: `https://api.example.com/item${i}`,
          headers: [],
          params: [],
          body: { mode: 'none' },
          timestamp: Date.now(),
        };
        mockFs.setFile(path.join(testHistoryDir, `${i}.json`), JSON.stringify(req));
      }

      // Save duplicate of req-2
      const duplicate: ParsedRequest = {
        id: 'req-duplicate', name: 'Test Request', method: 'GET',
        url: 'https://api.example.com/item2', // Same as req-2
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      await service.save(JSON.stringify(duplicate));

      const files = mockFs.listJsonFiles(testHistoryDir).sort();
      expect(files).toEqual(['1.json', '2.json', '3.json']);
    });

    it('should assign new ID to saved request', async () => {
      const request: ParsedRequest = {
        id: 'original-id', name: 'Test Request', method: 'GET',
        url: 'https://api.example.com',
        headers: [],
        params: [],
        body: { mode: 'none' },
        timestamp: Date.now(),
      };

      await service.save(JSON.stringify(request));

      const savedContent = mockFs.getFile(path.join(testHistoryDir, '1.json'));
      const saved = JSON.parse(savedContent!);
      expect(saved.id).not.toBe('original-id');
      expect(saved.id).toContain('original-id');
      expect(saved.id).toContain('hist');
    });
  });

  describe('clearAll', () => {
    it('should delete all history files', async () => {
      // Create some history files
      for (let i = 1; i <= 5; i++) {
        const req: ParsedRequest = {
          id: `req-${i}`,
          name: `Request ${i}`,
          method: 'GET',
          url: `https://api.example.com/item${i}`,
          headers: [],
          params: [],
          body: { mode: 'none' },
          timestamp: Date.now(),
        };
        mockFs.setFile(path.join(testHistoryDir, `${i}.json`), JSON.stringify(req));
      }

      expect(mockFs.listJsonFiles(testHistoryDir)).toHaveLength(5);

      await service.clearAll();

      expect(mockFs.listJsonFiles(testHistoryDir)).toHaveLength(0);
    });

    it('should not throw when history is already empty', async () => {
      await expect(service.clearAll()).resolves.not.toThrow();
    });
  });
});


