import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollectionService } from '../../services/CollectionService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { Collection, AppSettings } from '../../types.js';
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

      const requestContent = JSON.stringify({
        method: 'GET',
        url: { raw: 'https://api.example.com/users' },
      });

      // Act
      const result = await service.saveRequest(
        requestContent,
        'Get Users',
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
      const requestContent = JSON.stringify({
        method: 'POST',
        url: { raw: 'https://api.example.com/users' },
      });

      // Act
      const result = await service.saveRequest(
        requestContent,
        'Create User',
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

      const requestContent = JSON.stringify({
        method: 'GET',
        url: { raw: 'https://api.example.com/users/1' },
      });

      // Act
      await service.saveRequest(
        requestContent,
        'Get User by ID',
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

      const newRequestContent = JSON.stringify({
        method: 'GET',
        url: { raw: 'https://new-api.example.com/users' },
      });

      // Act
      await service.saveRequest(
        newRequestContent,
        'Get Users',
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
      const requestContent = JSON.stringify({
        method: 'GET',
        url: { raw: 'https://api.example.com/users' },
      });

      // Act & Assert
      await expect(
        service.saveRequest(
          requestContent,
          'Get Users',
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
});
