import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionService, normalizeRequestOnLoad, sanitizeRequestForSave } from '../../services/CollectionService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { Collection, AppSettings, AnyCollectionRequest } from '../../types.js';
import * as path from 'path';

// Create mock instance that will be used across all tests
const mockFs = new MockFileSystem();

// Mock the fs module with a factory function
vi.mock('fs', () => {
  // Create the mocks inline to avoid hoisting issues
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

describe('CollectionService', () => {
  let service: CollectionService;
  const testCollectionsDir = '/home/testuser/.waveclient/collections';

  beforeEach(() => {
    // Reset the mock file system
    mockFs.reset();
    vi.clearAllMocks();

    // Set up mock settings provider
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

    // Set up mock security service
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

    // Create service instance
    service = new CollectionService();

    // Ensure collections directory exists in mock
    mockFs.addDirectory(testCollectionsDir);
  });

  describe('loadAll', () => {
    it('should load all collections from the collections directory', async () => {
      // Arrange
      const collection1: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'Collection 1',
        },
        item: [
          {
            id: 'item-1',
            name: 'Request 1',
            request: {
              method: 'GET',
              url: { raw: 'https://api.example.com' },
            },
          },
        ],
      };

      const collection2: Collection = {
        info: {
          waveId: 'col-2',
          version: '0.0.1',
          name: 'Collection 2',
        },
        item: [],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'collection1.json'),
        JSON.stringify(collection1)
      );
      mockFs.setFile(
        path.join(testCollectionsDir, 'collection2.json'),
        JSON.stringify(collection2)
      );

      // Act
      const result = await service.loadAll();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        ...collection1,
        filename: 'collection1.json',
      });
      expect(result[1]).toMatchObject({
        ...collection2,
        filename: 'collection2.json',
      });
    });

    it('should return empty array when collections directory is empty', async () => {
      // Act
      const result = await service.loadAll();

      // Assert
      expect(result).toEqual([]);
    });

    it('should ensure all items have IDs', async () => {
      // Arrange
      const collectionWithoutIds: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'Test Collection',
        },
        item: [
          {
            name: 'Request without ID',
            request: {
              method: 'GET',
              url: { raw: 'https://api.example.com' },
            },
          } as any,
        ],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'test.json'),
        JSON.stringify(collectionWithoutIds)
      );

      // Act
      const result = await service.loadAll();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].item[0].id).toBeDefined();
      expect(typeof result[0].item[0].id).toBe('string');
    });

    it('should ensure collection has waveId and version', async () => {
      // Arrange
      const collectionWithoutMeta: any = {
        info: {
          name: 'Test Collection',
        },
        item: [],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'test.json'),
        JSON.stringify(collectionWithoutMeta)
      );

      // Act
      const result = await service.loadAll();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].info.waveId).toBeDefined();
      expect(result[0].info.version).toBe('0.0.1');
    });
  });

  describe('loadOne', () => {
    it('should load a single collection by filename', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'Test Collection',
        },
        item: [],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'test.json'),
        JSON.stringify(collection)
      );

      // Act
      const result = await service.loadOne('test.json');

      // Assert
      expect(result).toMatchObject(collection);
    });

    it('should return null if collection does not exist', async () => {
      // Act
      const result = await service.loadOne('nonexistent.json');

      // Assert
      expect(result).toBeNull();
    });

    it('should ensure nested items have IDs', async () => {
      // Arrange
      const collectionWithNestedItems: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'Test Collection',
        },
        item: [
          {
            name: 'Folder',
            item: [
              {
                name: 'Nested Request',
                request: {
                  method: 'POST',
                  url: { raw: 'https://api.example.com/post' },
                },
              } as any,
            ],
          } as any,
        ],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'nested.json'),
        JSON.stringify(collectionWithNestedItems)
      );

      // Act
      const result = await service.loadOne('nested.json');

      // Assert
      expect(result).not.toBeNull();
      expect(result!.item[0].id).toBeDefined();
      expect(result!.item[0].item![0].id).toBeDefined();
    });
  });

  describe('save', () => {
    it('should save a collection to the collections directory', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'New Collection',
        },
        item: [],
      };

      // Act
      const result = await service.save(collection, 'new.json');

      // Assert
      expect(result).toEqual(collection);
      expect(mockFs.hasFile(path.join(testCollectionsDir, 'new.json'))).toBe(true);
      
      const savedContent = mockFs.getFile(path.join(testCollectionsDir, 'new.json'));
      expect(JSON.parse(savedContent!)).toMatchObject(collection);
    });

    it('should create collections directory if it does not exist', async () => {
      // Arrange
      mockFs.reset();
      
      // Re-import fs to get the mock
      const fs = await import('fs');
      
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'New Collection',
        },
        item: [],
      };

      // Act
      await service.save(collection, 'new.json');

      // Assert
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('collections'),
        expect.objectContaining({ recursive: true })
      );
    });
  });

  describe('saveFromContent', () => {
    it('should parse and save collection from JSON string', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'From Content',
        },
        item: [],
      };
      const jsonContent = JSON.stringify(collection);

      // Act
      const result = await service.saveFromContent(jsonContent, 'content.json');

      // Assert
      expect(result).toMatchObject(collection);
      expect(mockFs.hasFile(path.join(testCollectionsDir, 'content.json'))).toBe(true);
    });
  });

  describe('saveRequest', () => {
    it('should save a request to an existing collection', async () => {
      // Arrange
      const existingCollection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'Existing Collection',
        },
        item: [],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'existing.json'),
        JSON.stringify(existingCollection)
      );

      const itemContent = JSON.stringify({
        name: 'Get Users',
        request: {
          method: 'GET',
          url: { raw: 'https://api.example.com/users' },
        },
      });

      // Act
      const result = await service.saveRequest(
        itemContent,
        'existing.json',
        []
      );

      // Assert
      expect(result).toBe('existing.json');
      
      const updatedCollection = await service.loadOne('existing.json');
      expect(updatedCollection).not.toBeNull();
      expect(updatedCollection!.item).toHaveLength(1);
      expect(updatedCollection!.item[0].name).toBe('Get Users');
      expect(updatedCollection!.item[0].request).toBeDefined();
    });

    it('should create a new collection if newCollectionName is provided', async () => {
      // Arrange
      const itemContent = JSON.stringify({
        name: 'Create User',
        request: {
          method: 'POST',
          url: { raw: 'https://api.example.com/users' },
        },
      });

      // Act
      const result = await service.saveRequest(
        itemContent,
        '',
        [],
        'New API Collection'
      );

      // Assert
      expect(result).toMatch(/new_api_collection\.json/);
      
      const newCollection = await service.loadOne(result);
      expect(newCollection).not.toBeNull();
      expect(newCollection!.info.name).toBe('New API Collection');
      expect(newCollection!.item).toHaveLength(1);
      expect(newCollection!.item[0].name).toBe('Create User');
    });

    it('should save request in nested folder path', async () => {
      // Arrange
      const existingCollection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'API Collection',
        },
        item: [],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'api.json'),
        JSON.stringify(existingCollection)
      );

      const itemContent = JSON.stringify({
        name: 'Get User by ID',
        request: {
          method: 'GET',
          url: { raw: 'https://api.example.com/users/1' },
        },
      });

      // Act
      await service.saveRequest(
        itemContent,
        'api.json',
        ['Users', 'Read']
      );

      // Assert
      const updatedCollection = await service.loadOne('api.json');
      expect(updatedCollection).not.toBeNull();
      
      const usersFolder = updatedCollection!.item.find(i => i.name === 'Users');
      expect(usersFolder).toBeDefined();
      expect(usersFolder!.item).toBeDefined();
      
      const readFolder = usersFolder!.item!.find(i => i.name === 'Read');
      expect(readFolder).toBeDefined();
      expect(readFolder!.item).toBeDefined();
      expect(readFolder!.item!).toHaveLength(1);
      expect(readFolder!.item![0].name).toBe('Get User by ID');
    });

    it('should overwrite existing request with same name in folder', async () => {
      // Arrange
      const existingCollection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'API Collection',
        },
        item: [
          {
            id: 'req-1',
            name: 'Get Users',
            request: {
              method: 'GET',
              url: { raw: 'https://old-api.example.com/users' },
            },
          },
        ],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'api.json'),
        JSON.stringify(existingCollection)
      );

      // Legacy id-less payload: matched by name (fallback path)
      const newItemContent = JSON.stringify({
        name: 'Get Users',
        request: {
          method: 'GET',
          url: { raw: 'https://new-api.example.com/users' },
        },
      });

      // Act
      await service.saveRequest(
        newItemContent,
        'api.json',
        []
      );

      // Assert
      const updatedCollection = await service.loadOne('api.json');
      expect(updatedCollection).not.toBeNull();
      expect(updatedCollection!.item).toHaveLength(1);
      const url = updatedCollection!.item[0].request?.url;
      const urlRaw = typeof url === 'string' ? url : url?.raw;
      expect(urlRaw).toBe('https://new-api.example.com/users');
    });

    it('should throw error if collection does not exist and no new name provided', async () => {
      // Arrange
      const itemContent = JSON.stringify({
        name: 'Get Users',
        request: {
          method: 'GET',
          url: { raw: 'https://api.example.com/users' },
        },
      });

      // Act & Assert
      await expect(
        service.saveRequest(
          itemContent,
          'nonexistent.json',
          []
        )
      ).rejects.toThrow('Collection file nonexistent.json does not exist');
    });
  });

  describe('delete', () => {
    it('should delete a collection file', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'To Delete',
        },
        item: [],
      };

      mockFs.setFile(
        path.join(testCollectionsDir, 'todelete.json'),
        JSON.stringify(collection)
      );
      
      // Re-import fs to get the mock
      const fs = await import('fs');

      // Act
      await service.delete('todelete.json');

      // Assert
      expect(mockFs.hasFile(path.join(testCollectionsDir, 'todelete.json'))).toBe(false);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        path.join(testCollectionsDir, 'todelete.json')
      );
    });
  });

  describe('import', () => {
    it('should import a collection from JSON content', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-import',
          version: '0.0.1',
          name: 'Imported Collection',
        },
        item: [
          {
            id: 'item-1',
            name: 'Request 1',
            request: {
              method: 'GET',
              url: { raw: 'https://api.example.com' },
            },
          },
        ],
      };

      const jsonContent = JSON.stringify(collection);

      // Act
      const result = await service.import('imported.json', jsonContent);

      // Assert
      expect(result.filename).toBe('imported.json');
      expect(result.info.name).toBe('Imported Collection');
      expect(mockFs.hasFile(path.join(testCollectionsDir, 'imported.json'))).toBe(true);
    });

    it('should add waveId and version if missing', async () => {
      // Arrange
      const collectionWithoutMeta: any = {
        info: {
          name: 'Imported Without Meta',
        },
        item: [],
      };

      const jsonContent = JSON.stringify(collectionWithoutMeta);

      // Act
      const result = await service.import('imported.json', jsonContent);

      // Assert
      expect(result.info.waveId).toBeDefined();
      expect(result.info.version).toBe('0.0.1');
    });

    it('should ensure all imported items have IDs', async () => {
      // Arrange
      const collectionWithoutItemIds: any = {
        info: {
          name: 'Imported Collection',
        },
        item: [
          {
            name: 'Request without ID',
            request: {
              method: 'GET',
              url: { raw: 'https://api.example.com' },
            },
          },
        ],
      };

      const jsonContent = JSON.stringify(collectionWithoutItemIds);

      // Act
      const result = await service.import('imported.json', jsonContent);

      // Assert
      expect(result.item[0].id).toBeDefined();
      expect(typeof result.item[0].id).toBe('string');
    });

    it('should throw error for invalid JSON', async () => {
      // Arrange
      const invalidJson = 'not valid json {';

      // Act & Assert
      await expect(
        service.import('invalid.json', invalidJson)
      ).rejects.toThrow('Failed to parse collection JSON');
    });

    it('should throw error if collection has no info section', async () => {
      // Arrange
      const invalidCollection = JSON.stringify({
        item: [],
      });

      // Act & Assert
      await expect(
        service.import('invalid.json', invalidCollection)
      ).rejects.toThrow('Invalid collection format: missing info section');
    });

    it('should replace file extension with .json', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          name: 'Test',
        },
        item: [],
      } as any;

      // Act
      const result = await service.import('test.txt', JSON.stringify(collection));

      // Assert
      expect(result.filename).toBe('test.json');
    });
  });

  describe('export', () => {
    it('should export collection as JSON with suggested filename', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'My API Collection',
        },
        item: [],
      };

      // Act
      const result = await service.export(collection);

      // Assert
      expect(result.suggestedFilename).toBe('my_api_collection.json');
      expect(result.content).toBe(JSON.stringify(collection, null, 2));
    });

    it('should handle special characters in collection name', async () => {
      // Arrange
      const collection: Collection = {
        info: {
          waveId: 'col-1',
          version: '0.0.1',
          name: 'API Collection! (v2.0)',
        },
        item: [],
      };

      // Act
      const result = await service.export(collection);

      // Assert
      expect(result.suggestedFilename).toBe('api_collection___v2_0_.json');
    });
  });

  // ==========================================================================
  // normalizeRequestOnLoad — protocol-aware load normalization (FEAT-010)
  // ==========================================================================
  describe('normalizeRequestOnLoad', () => {
    it('should default missing protocol to http', () => {
      const raw = { id: 'r1', name: 'Legacy', url: 'https://example.com', method: 'POST', body: { mode: 'raw', raw: '{}' } };
      const result = normalizeRequestOnLoad(raw);
      expect(result.protocol).toBe('http');
      expect((result as any).method).toBe('POST');
      expect((result as any).body).toEqual({ mode: 'raw', raw: '{}' });
    });

    it('should normalize http request and preserve all fields', () => {
      const raw = {
        id: 'r2', name: 'HTTP', protocol: 'http', url: 'https://example.com',
        method: 'PUT', body: { mode: 'raw', raw: 'data' }, validation: { rules: [] },
        header: [{ key: 'X-Test', value: '1' }], description: 'desc', authId: 'auth-1',
      };
      const result = normalizeRequestOnLoad(raw);
      expect(result.protocol).toBe('http');
      expect((result as any).method).toBe('PUT');
      expect((result as any).body).toEqual({ mode: 'raw', raw: 'data' });
      expect((result as any).validation).toEqual({ rules: [] });
      expect((result as any).header).toEqual([{ key: 'X-Test', value: '1' }]);
      expect((result as any).description).toBe('desc');
      expect((result as any).authId).toBe('auth-1');
    });

    it('should default http method to GET when absent', () => {
      const raw = { id: 'r3', name: 'No Method', protocol: 'http', url: 'https://example.com' };
      const result = normalizeRequestOnLoad(raw);
      expect((result as any).method).toBe('GET');
    });

    it('should normalize ws request and strip http-only fields', () => {
      const raw = {
        id: 'r4', name: 'WS', protocol: 'ws', url: 'wss://echo.example.com',
        method: 'GET', body: { mode: 'raw', raw: '' }, validation: { rules: [] },
      };
      const result = normalizeRequestOnLoad(raw);
      expect(result.protocol).toBe('ws');
      expect((result as any).method).toBeUndefined();
      expect((result as any).body).toBeUndefined();
      expect((result as any).validation).toBeUndefined();
    });

    it('should normalize sse request — keeps method and body, strips validation', () => {
      const raw = {
        id: 'r5', name: 'SSE', protocol: 'sse', url: 'https://stream.example.com',
        method: 'POST', body: { mode: 'raw', raw: '{}' }, validation: { rules: [] },
      };
      const result = normalizeRequestOnLoad(raw);
      expect(result.protocol).toBe('sse');
      expect((result as any).method).toBe('POST');
      expect((result as any).body).toEqual({ mode: 'raw', raw: '{}' });
      expect((result as any).validation).toBeUndefined();
    });

    it('should default sse method to GET when absent', () => {
      const raw = { id: 'r6', name: 'SSE No Method', protocol: 'sse', url: 'https://stream.example.com' };
      const result = normalizeRequestOnLoad(raw);
      expect((result as any).method).toBe('GET');
    });

    it('should preserve shared fields on ws request', () => {
      const raw = {
        id: 'r7', name: 'WS Full', protocol: 'ws', url: 'wss://ws.example.com',
        header: [{ key: 'Auth', value: 'token' }], query: [{ key: 'v', value: '2' }],
        description: 'websocket endpoint', authId: 'auth-ws',
      };
      const result = normalizeRequestOnLoad(raw);
      expect((result as any).header).toEqual([{ key: 'Auth', value: 'token' }]);
      expect((result as any).query).toEqual([{ key: 'v', value: '2' }]);
      expect((result as any).description).toBe('websocket endpoint');
      expect((result as any).authId).toBe('auth-ws');
    });
  });

  // ==========================================================================
  // sanitizeRequestForSave — protocol-aware save sanitization (FEAT-010)
  // ==========================================================================
  describe('sanitizeRequestForSave', () => {
    it('should strip sourceRef from http request', () => {
      const request = {
        id: 'r1', name: 'HTTP', protocol: 'http' as const, url: 'https://example.com',
        method: 'GET', sourceRef: { collectionFilename: 'col.json', collectionName: 'C', itemPath: [] },
      } as AnyCollectionRequest;
      const result = sanitizeRequestForSave(request);
      expect((result as any).sourceRef).toBeUndefined();
      expect(result.protocol).toBe('http');
      expect((result as any).method).toBe('GET');
    });

    it('should save http request with method, body, validation', () => {
      const request = {
        id: 'r2', name: 'HTTP Full', protocol: 'http' as const, url: 'https://example.com',
        method: 'POST', body: { mode: 'raw', raw: '{}' }, validation: { rules: [{ type: 'status', operator: 'eq', expected: 200 }] },
        header: [{ key: 'Content-Type', value: 'application/json' }],
        description: 'Creates a resource',
      } as unknown as AnyCollectionRequest;
      const result = sanitizeRequestForSave(request);
      expect((result as any).method).toBe('POST');
      expect((result as any).body).toEqual({ mode: 'raw', raw: '{}' });
      expect((result as any).validation).toBeDefined();
      expect((result as any).header).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
      expect((result as any).description).toBe('Creates a resource');
    });

    it('should save ws request stripping method, body, validation', () => {
      const request = {
        id: 'r3', name: 'WS', protocol: 'ws' as const, url: 'wss://echo.example.com',
        header: [{ key: 'Authorization', value: 'Bearer tok' }],
      } as AnyCollectionRequest;
      const result = sanitizeRequestForSave(request);
      expect(result.protocol).toBe('ws');
      expect((result as any).method).toBeUndefined();
      expect((result as any).body).toBeUndefined();
      expect((result as any).validation).toBeUndefined();
      expect((result as any).header).toEqual([{ key: 'Authorization', value: 'Bearer tok' }]);
    });

    it('should save sse request with method and body but no validation', () => {
      const request = {
        id: 'r4', name: 'SSE', protocol: 'sse' as const, url: 'https://stream.example.com',
        method: 'POST', body: { mode: 'raw', raw: '{"channel":"updates"}' },
      } as unknown as AnyCollectionRequest;
      const result = sanitizeRequestForSave(request);
      expect(result.protocol).toBe('sse');
      expect((result as any).method).toBe('POST');
      expect((result as any).body).toEqual({ mode: 'raw', raw: '{"channel":"updates"}' });
      expect((result as any).validation).toBeUndefined();
    });

    it('should default missing protocol to http on save', () => {
      const request = {
        id: 'r5', name: 'Legacy', url: 'https://example.com', method: 'DELETE',
      } as AnyCollectionRequest;
      const result = sanitizeRequestForSave(request);
      expect(result.protocol).toBe('http');
      expect((result as any).method).toBe('DELETE');
    });

    it('should omit empty header and query arrays', () => {
      const request = {
        id: 'r6', name: 'Sparse', protocol: 'http' as const, url: 'https://example.com',
        method: 'GET', header: [], query: [],
      } as unknown as AnyCollectionRequest;
      const result = sanitizeRequestForSave(request);
      expect((result as any).header).toBeUndefined();
      expect((result as any).query).toBeUndefined();
    });
  });

  // ==========================================================================
  // Protocol-aware round-trip through CollectionService (FEAT-010)
  // ==========================================================================
  describe('protocol-aware persistence round-trip', () => {
    it('should save and load a WS request with protocol fidelity', async () => {
      // Arrange — collection with a ws request
      const collection: Collection = {
        info: { waveId: 'col-ws', version: '0.0.1', name: 'WS Collection' },
        item: [],
      };
      mockFs.setFile(path.join(testCollectionsDir, 'ws_col.json'), JSON.stringify(collection));

      const wsItem = JSON.stringify({
        name: 'Echo WS',
        request: {
          protocol: 'ws',
          url: 'wss://echo.example.com',
          header: [{ key: 'Authorization', value: 'Bearer tok' }],
        },
      });

      // Act
      await service.saveRequest(wsItem, 'ws_col.json', []);
      const loaded = await service.loadOne('ws_col.json');

      // Assert
      const item = loaded!.item[0];
      expect(item.name).toBe('Echo WS');
      const req = item.request as any;
      expect(req.protocol).toBe('ws');
      expect(req.method).toBeUndefined();
      expect(req.body).toBeUndefined();
      expect(req.validation).toBeUndefined();
      expect(req.header).toEqual([{ key: 'Authorization', value: 'Bearer tok' }]);
    });

    it('should save and load an SSE request with protocol fidelity', async () => {
      const collection: Collection = {
        info: { waveId: 'col-sse', version: '0.0.1', name: 'SSE Collection' },
        item: [],
      };
      mockFs.setFile(path.join(testCollectionsDir, 'sse_col.json'), JSON.stringify(collection));

      const sseItem = JSON.stringify({
        name: 'Stream Events',
        request: {
          protocol: 'sse',
          url: 'https://stream.example.com/events',
          method: 'POST',
          body: { mode: 'raw', raw: '{"channel":"updates"}' },
        },
      });

      await service.saveRequest(sseItem, 'sse_col.json', []);
      const loaded = await service.loadOne('sse_col.json');

      const req = loaded!.item[0].request as any;
      expect(req.protocol).toBe('sse');
      expect(req.method).toBe('POST');
      expect(req.body).toEqual({ mode: 'raw', raw: '{"channel":"updates"}' });
      expect(req.validation).toBeUndefined();
    });

    it('should normalize legacy HTTP requests (no protocol field) on load', async () => {
      // Simulate a legacy collection on disk (no protocol field)
      const legacyCollection = {
        info: { waveId: 'col-legacy', version: '0.0.1', name: 'Legacy Collection' },
        item: [{
          id: 'legacy-1',
          name: 'Old Request',
          request: { method: 'POST', url: 'https://api.example.com/data', body: { mode: 'raw', raw: '{}' } },
        }],
      };
      mockFs.setFile(path.join(testCollectionsDir, 'legacy.json'), JSON.stringify(legacyCollection));

      const loaded = await service.loadOne('legacy.json');
      const req = loaded!.item[0].request as any;
      expect(req.protocol).toBe('http');
      expect(req.method).toBe('POST');
      expect(req.body).toEqual({ mode: 'raw', raw: '{}' });
    });

    it('should handle mixed-protocol collections on load', async () => {
      const mixedCollection = {
        info: { waveId: 'col-mix', version: '0.0.1', name: 'Mixed Collection' },
        item: [
          { id: 'http-1', name: 'HTTP Req', request: { protocol: 'http', method: 'GET', url: 'https://api.example.com' } },
          { id: 'ws-1', name: 'WS Req', request: { protocol: 'ws', url: 'wss://ws.example.com' } },
          { id: 'sse-1', name: 'SSE Req', request: { protocol: 'sse', url: 'https://stream.example.com', method: 'GET' } },
          { id: 'legacy-1', name: 'Legacy', request: { method: 'DELETE', url: 'https://api.example.com/old' } },
        ],
      };
      mockFs.setFile(path.join(testCollectionsDir, 'mixed.json'), JSON.stringify(mixedCollection));

      const loaded = await service.loadOne('mixed.json');
      const items = loaded!.item;

      expect((items[0].request as any).protocol).toBe('http');
      expect((items[1].request as any).protocol).toBe('ws');
      expect((items[1].request as any).method).toBeUndefined();
      expect((items[2].request as any).protocol).toBe('sse');
      expect((items[3].request as any).protocol).toBe('http'); // legacy defaulted
    });

    it('should strip sourceRef on save via saveRequest', async () => {
      const collection: Collection = {
        info: { waveId: 'col-sr', version: '0.0.1', name: 'SourceRef Test' },
        item: [],
      };
      mockFs.setFile(path.join(testCollectionsDir, 'sr.json'), JSON.stringify(collection));

      const itemWithSourceRef = JSON.stringify({
        name: 'SR Test',
        request: {
          protocol: 'http',
          method: 'GET',
          url: 'https://api.example.com',
          sourceRef: { collectionFilename: 'sr.json', collectionName: 'SourceRef Test', itemPath: [] },
        },
      });

      await service.saveRequest(itemWithSourceRef, 'sr.json', []);

      // Read raw file to confirm sourceRef is not persisted
      const rawContent = mockFs.getFile(path.join(testCollectionsDir, 'sr.json'));
      const parsed = JSON.parse(rawContent!);
      expect(parsed.item[0].request.sourceRef).toBeUndefined();
    });
  });

  // ==========================================================================
  // ID retention through saveRequest (FEAT-003)
  // ==========================================================================
  describe('saveRequest — id retention', () => {
    const seedCollection = (filename: string, items: unknown[]) => {
      mockFs.setFile(
        path.join(testCollectionsDir, filename),
        JSON.stringify({
          info: { waveId: 'col-idr', version: '0.0.1', name: 'IDR Collection' },
          item: items,
        })
      );
    };

    it('keeps item.id and request.id when saving an item with an existing id into a new folder', async () => {
      seedCollection('idr.json', []);
      const item = JSON.stringify({
        id: 'item-keep',
        name: 'Moved Request',
        description: 'carried along',
        request: { id: 'req-keep', method: 'GET', url: 'https://api.example.com/moved' },
      });

      await service.saveRequest(item, 'idr.json', ['Target Folder']);

      const loaded = await service.loadOne('idr.json');
      const folder = loaded!.item.find(i => i.name === 'Target Folder');
      const saved = folder!.item![0];
      expect(saved.id).toBe('item-keep');
      expect(saved.request!.id).toBe('req-keep');
      expect(saved.description).toBe('carried along');
    });

    it('updates in place when re-saving the same id (no duplicate)', async () => {
      seedCollection('idr.json', [
        { id: 'item-1', name: 'Original', request: { id: 'req-1', method: 'GET', url: 'https://old.example.com' } },
      ]);
      const item = JSON.stringify({
        id: 'item-1',
        name: 'Renamed',
        request: { id: 'req-1', method: 'POST', url: 'https://new.example.com' },
      });

      await service.saveRequest(item, 'idr.json', []);

      const loaded = await service.loadOne('idr.json');
      expect(loaded!.item).toHaveLength(1);
      expect(loaded!.item[0].id).toBe('item-1');
      expect(loaded!.item[0].name).toBe('Renamed');
      expect(loaded!.item[0].request!.name).toBe('Renamed');
    });

    it('does not overwrite a same-named item with a different id', async () => {
      seedCollection('idr.json', [
        { id: 'item-existing', name: 'Shared Name', request: { id: 'req-existing', method: 'GET', url: 'https://a.example.com' } },
      ]);
      const incoming = JSON.stringify({
        id: 'item-incoming',
        name: 'Shared Name 2',
        request: { id: 'req-incoming', method: 'GET', url: 'https://b.example.com' },
      });

      await service.saveRequest(incoming, 'idr.json', []);

      const loaded = await service.loadOne('idr.json');
      expect(loaded!.item).toHaveLength(2);
      expect(loaded!.item.map(i => i.id).sort()).toEqual(['item-existing', 'item-incoming']);
    });

    it('assigns a fresh id to a new item without one', async () => {
      seedCollection('idr.json', []);
      const item = JSON.stringify({
        name: 'Fresh',
        request: { method: 'GET', url: 'https://fresh.example.com' },
      });

      await service.saveRequest(item, 'idr.json', []);

      const loaded = await service.loadOne('idr.json');
      expect(loaded!.item[0].id).toBeTruthy();
      expect(loaded!.item[0].request!.id).toBeTruthy();
    });

    it('keeps the existing slot id when a legacy id-less payload matches by name', async () => {
      seedCollection('idr.json', [
        { id: 'item-slot', name: 'Legacy Match', request: { id: 'req-slot', method: 'GET', url: 'https://old.example.com' } },
      ]);
      const legacy = JSON.stringify({
        name: 'Legacy Match',
        request: { method: 'PUT', url: 'https://updated.example.com' },
      });

      await service.saveRequest(legacy, 'idr.json', []);

      const loaded = await service.loadOne('idr.json');
      expect(loaded!.item).toHaveLength(1);
      expect(loaded!.item[0].id).toBe('item-slot');
      const url = loaded!.item[0].request!.url;
      expect(typeof url === 'string' ? url : url.raw).toBe('https://updated.example.com');
    });

    it('rejects a payload without a request or name', async () => {
      seedCollection('idr.json', []);
      await expect(service.saveRequest(JSON.stringify({ name: 'No Request' }), 'idr.json', []))
        .rejects.toThrow(/Invalid item payload/);
      await expect(service.saveRequest(JSON.stringify({ request: { method: 'GET', url: 'x' } }), 'idr.json', []))
        .rejects.toThrow(/Invalid item payload/);
    });
  });

  // ==========================================================================
  // Tree validation on save (FEAT-003)
  // ==========================================================================
  describe('save — tree validation', () => {
    it('rejects a collection with duplicate sibling names and does not write', async () => {
      const collection: Collection = {
        info: { waveId: 'col-dup', version: '0.0.1', name: 'Dup Collection' },
        item: [
          { id: 'a', name: 'Same', request: { id: 'ra', name: 'Same', method: 'GET', url: 'https://a' } },
          { id: 'b', name: 'same', request: { id: 'rb', name: 'same', method: 'GET', url: 'https://b' } },
        ],
      };

      await expect(service.save(collection, 'dup.json')).rejects.toThrow(/Duplicate item name "same"/i);
      expect(mockFs.getFile(path.join(testCollectionsDir, 'dup.json'))).toBeUndefined();
    });

    it('rejects a collection with an empty item name, naming the level', async () => {
      const collection: Collection = {
        info: { waveId: 'col-empty', version: '0.0.1', name: 'Empty Name Collection' },
        item: [{ id: 'a', name: '   ', request: { id: 'ra', name: '', method: 'GET', url: 'https://a' } }],
      };

      await expect(service.save(collection, 'empty.json')).rejects.toThrow(/empty name/i);
    });
  });

  // ==========================================================================
  // Schema validation at load & import boundaries (FEAT-001)
  // ==========================================================================
  describe('schema validation boundaries', () => {
    it('should return null and log for a structurally invalid collection file on loadOne', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // `item` must be an array — an object is structurally invalid
      mockFs.setFile(
        path.join(testCollectionsDir, 'broken.json'),
        JSON.stringify({ info: { waveId: 'w', name: 'Broken', version: '0.0.1' }, item: { not: 'an array' } })
      );

      const result = await service.loadOne('broken.json');

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('broken.json'));
      errorSpy.mockRestore();
    });

    it('should stamp version and waveId on a legacy file and pass validation on loadOne', async () => {
      // Legacy file: no waveId, no version
      mockFs.setFile(
        path.join(testCollectionsDir, 'legacy_stamp.json'),
        JSON.stringify({ info: { name: 'Legacy' }, item: [] })
      );

      const result = await service.loadOne('legacy_stamp.json');

      expect(result).not.toBeNull();
      expect(result!.info.waveId).toBeTruthy();
      expect(result!.info.version).toBe('0.0.1');
    });

    it('should reject invalid JSON in saveFromContent with a descriptive message', async () => {
      await expect(service.saveFromContent('{ not json', 'x.json')).rejects.toThrow(/Invalid JSON/);
    });

    it('should reject a shape-invalid collection in saveFromContent and not write the file', async () => {
      const invalid = JSON.stringify({ info: { name: 'X' }, item: [{ name: 'no id', request: 'not-an-object' }] });

      await expect(service.saveFromContent(invalid, 'invalid_save.json')).rejects.toThrow(/Invalid collection/);
      expect(mockFs.getFile(path.join(testCollectionsDir, 'invalid_save.json'))).toBeUndefined();
    });

    it('should accept and stamp a valid collection missing version in saveFromContent', async () => {
      const content = JSON.stringify({ info: { name: 'NoVersion' }, item: [] });

      const saved = await service.saveFromContent(content, 'no_version.json');

      expect(saved.info.version).toBe('0.0.1');
      expect(saved.info.waveId).toBeTruthy();
      const raw = mockFs.getFile(path.join(testCollectionsDir, 'no_version.json'));
      expect(JSON.parse(raw!).info.version).toBe('0.0.1');
    });

    it('should reject a structurally invalid collection on import and persist nothing', async () => {
      const invalid = JSON.stringify({ info: { name: 'Bad' }, item: [{ id: 1, name: 2 }] });

      await expect(service.import('bad_import.json', invalid)).rejects.toThrow(/Invalid collection/);
      expect(mockFs.getFile(path.join(testCollectionsDir, 'bad_import.json'))).toBeUndefined();
    });
  });
});
