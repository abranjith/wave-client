import { describe, it, expect } from 'vitest';
import {
  generateUniqueId,
  urlToString,
  extractUrlParams,
  stringToCollectionUrl,
  findItemById,
  findItemWithPath,
  getAllRequestItems,
  countRequests,
  getFolderPathOptions,
  ensureItemIds,
  formDataToCollectionRequest,
  type RequestFormData,
} from '../../utils/collectionParser';
import type {
  Collection,
  CollectionItem,
  CollectionUrl,
  CollectionRequest,
} from '../../types/collection';

describe('collectionParser', () => {
  describe('generateUniqueId', () => {
    it('should generate a valid UUID', () => {
      const id = generateUniqueId();
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(id).toMatch(uuidRegex);
    });

    it('should generate unique IDs', () => {
      const id1 = generateUniqueId();
      const id2 = generateUniqueId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('urlToString', () => {
    it('should return empty string for undefined', () => {
      expect(urlToString(undefined)).toBe('');
    });

    it('should return the same string if input is string', () => {
      expect(urlToString('https://api.example.com')).toBe('https://api.example.com');
    });

    it('should return raw URL if available', () => {
      const url: CollectionUrl = {
        raw: 'https://api.example.com/users',
      };
      expect(urlToString(url)).toBe('https://api.example.com/users');
    });

    it('should reconstruct URL from parts', () => {
      const url: CollectionUrl = {
        raw: 'https://api.example.com/users/123',
        protocol: 'https',
        host: ['api', 'example', 'com'],
        path: ['users', '123'],
      };
      expect(urlToString(url)).toBe('https://api.example.com/users/123');
    });

    it('should use default protocol if not provided', () => {
      const url: CollectionUrl = {
        raw: 'https://example.com/api',
        host: ['example', 'com'],
        path: ['api'],
      };
      expect(urlToString(url)).toBe('https://example.com/api');
    });
  });

  describe('extractUrlParams', () => {
    it('should return empty array for undefined URL', () => {
      expect(extractUrlParams(undefined)).toEqual([]);
    });

    it('should extract params from CollectionUrl query', () => {
      const url: CollectionUrl = {
        raw: 'https://api.example.com?page=1&limit=10',
        query: [
          { id: '1', key: 'page', value: '1', disabled: false },
          { id: '2', key: 'limit', value: '10', disabled: false },
        ],
      };

      const params = extractUrlParams(url);

      expect(params).toHaveLength(2);
      expect(params[0].key).toBe('page');
      expect(params[0].value).toBe('1');
      expect(params[1].key).toBe('limit');
      expect(params[1].value).toBe('10');
    });

    it('should parse params from raw URL string', () => {
      const params = extractUrlParams('https://api.example.com?search=test&filter=active');

      expect(params).toHaveLength(2);
      expect(params.find((p) => p.key === 'search')?.value).toBe('test');
      expect(params.find((p) => p.key === 'filter')?.value).toBe('active');
    });

    it('should handle malformed URLs gracefully', () => {
      const params = extractUrlParams('not-a-valid-url');
      expect(params).toEqual([]);
    });
  });

  describe('stringToCollectionUrl', () => {
    it('should parse valid URL into CollectionUrl', () => {
      const url = stringToCollectionUrl('https://api.example.com/users/123');

      expect(url.raw).toBe('https://api.example.com/users/123');
      expect(url.protocol).toBe('https');
      expect(url.host).toEqual(['api', 'example', 'com']);
      expect(url.path).toEqual(['users', '123']);
    });

    it('should include query params if provided', () => {
      const params = [
        { id: '1', key: 'page', value: '1', disabled: false },
        { id: '2', key: 'limit', value: '10', disabled: false },
      ];

      const url = stringToCollectionUrl('https://api.example.com', params);

      expect(url.query).toHaveLength(2);
      expect(url.query?.[0].key).toBe('page');
    });

    it('should handle invalid URLs by returning raw URL only', () => {
      const url = stringToCollectionUrl('not-a-url');

      expect(url.raw).toBe('not-a-url');
      expect(url.protocol).toBeUndefined();
      expect(url.host).toBeUndefined();
    });
  });

  describe('findItemById', () => {
    const mockItems: CollectionItem[] = [
      {
        id: 'req-1',
        name: 'Get Users',
        request: { method: 'GET', url: 'https://api.example.com/users' },
      },
      {
        id: 'folder-1',
        name: 'Auth',
        item: [
          {
            id: 'req-2',
            name: 'Login',
            request: { method: 'POST', url: 'https://api.example.com/login' },
          },
        ],
      },
    ];

    it('should find item at root level', () => {
      const item = findItemById(mockItems, 'req-1');
      expect(item?.name).toBe('Get Users');
    });

    it('should find item in nested folder', () => {
      const item = findItemById(mockItems, 'req-2');
      expect(item?.name).toBe('Login');
    });

    it('should return null if item not found', () => {
      const item = findItemById(mockItems, 'non-existent');
      expect(item).toBeNull();
    });

    it('should find folder by ID', () => {
      const item = findItemById(mockItems, 'folder-1');
      expect(item?.name).toBe('Auth');
    });
  });

  describe('findItemWithPath', () => {
    const mockItems: CollectionItem[] = [
      {
        id: 'folder-1',
        name: 'API',
        item: [
          {
            id: 'folder-2',
            name: 'Users',
            item: [
              {
                id: 'req-1',
                name: 'Get User',
                request: { method: 'GET', url: 'https://api.example.com/users/1' },
              },
            ],
          },
        ],
      },
    ];

    it('should find item with correct path', () => {
      const result = findItemWithPath(mockItems, 'req-1');

      expect(result).not.toBeNull();
      expect(result?.item.name).toBe('Get User');
      expect(result?.path).toEqual(['API', 'Users']);
    });

    it('should return empty path for root-level item', () => {
      const result = findItemWithPath(mockItems, 'folder-1');

      expect(result?.path).toEqual([]);
    });

    it('should return null if item not found', () => {
      const result = findItemWithPath(mockItems, 'non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getAllRequestItems', () => {
    const mockItems: CollectionItem[] = [
      {
        id: 'req-1',
        name: 'Request 1',
        request: { method: 'GET', url: 'https://api.example.com' },
      },
      {
        id: 'folder-1',
        name: 'Folder',
        item: [
          {
            id: 'req-2',
            name: 'Request 2',
            request: { method: 'POST', url: 'https://api.example.com' },
          },
          {
            id: 'subfolder',
            name: 'Subfolder',
            item: [
              {
                id: 'req-3',
                name: 'Request 3',
                request: { method: 'DELETE', url: 'https://api.example.com' },
              },
            ],
          },
        ],
      },
    ];

    it('should return all request items flattened', () => {
      const requests = getAllRequestItems(mockItems);

      expect(requests).toHaveLength(3);
      expect(requests.map((r) => r.id)).toEqual(['req-1', 'req-2', 'req-3']);
    });

    it('should return empty array for collection with only folders', () => {
      const items: CollectionItem[] = [
        { id: 'folder-1', name: 'Folder', item: [] },
      ];

      const requests = getAllRequestItems(items);
      expect(requests).toEqual([]);
    });
  });

  describe('countRequests', () => {
    it('should count all requests including nested', () => {
      const items: CollectionItem[] = [
        {
          id: 'req-1',
          name: 'Request 1',
          request: { method: 'GET', url: 'https://api.example.com' },
        },
        {
          id: 'folder-1',
          name: 'Folder',
          item: [
            {
              id: 'req-2',
              name: 'Request 2',
              request: { method: 'POST', url: 'https://api.example.com' },
            },
          ],
        },
      ];

      expect(countRequests(items)).toBe(2);
    });

    it('should return 0 for empty collection', () => {
      expect(countRequests([])).toBe(0);
    });
  });

  describe('getFolderPathOptions', () => {
    const mockCollection: Collection = {
      info: {
        waveId: 'test-id',
        name: 'Test Collection',
      },
      filename: 'test-collection',
      item: [
        {
          id: 'folder-1',
          name: 'API',
          item: [
            {
              id: 'folder-2',
              name: 'Users',
              item: [],
            },
          ],
        },
        {
          id: 'folder-3',
          name: 'Auth',
          item: [],
        },
      ],
    };

    it('should include root option', () => {
      const options = getFolderPathOptions(mockCollection);

      expect(options[0]).toEqual({
        path: [],
        displayPath: '(Root)',
        depth: 0,
      });
    });

    it('should include all folder paths', () => {
      const options = getFolderPathOptions(mockCollection);

      expect(options.find((o) => o.displayPath === 'API')).toBeDefined();
      expect(options.find((o) => o.displayPath === 'API / Users')).toBeDefined();
      expect(options.find((o) => o.displayPath === 'Auth')).toBeDefined();
    });

    it('should set correct depth levels', () => {
      const options = getFolderPathOptions(mockCollection);

      const apiOption = options.find((o) => o.displayPath === 'API');
      const usersOption = options.find((o) => o.displayPath === 'API / Users');

      expect(apiOption?.depth).toBe(1);
      expect(usersOption?.depth).toBe(2);
    });
  });

  describe('urlToString', () => {
    it('should handle string URLs', () => {
      const result = urlToString('https://example.com/api');
      expect(result).toBe('https://example.com/api');
    });

    it('should handle URL object with raw property', () => {
      const url: CollectionUrl = { raw: 'https://example.com/api' };
      const result = urlToString(url);
      expect(result).toBe('https://example.com/api');
    });

    it('should handle undefined URL', () => {
      const result = urlToString(undefined);
      expect(result).toBe('');
    });
  });

  describe('extractUrlParams', () => {
    it('should extract params from raw URL string', () => {
      const result = extractUrlParams('https://api.com?page=1&limit=10');
      expect(result).toHaveLength(2);
      expect(result.find((p) => p.key === 'page')?.value).toBe('1');
      expect(result.find((p) => p.key === 'limit')?.value).toBe('10');
    });

    it('should handle URL without params', () => {
      const result = extractUrlParams('https://api.com/users');
      expect(result).toHaveLength(0);
    });

    it('should handle invalid URL gracefully', () => {
      const result = extractUrlParams('not a valid url');
      expect(result).toHaveLength(0);
    });

    it('should handle undefined URL', () => {
      const result = extractUrlParams(undefined);
      expect(result).toHaveLength(0);
    });
  });

  describe('ensureItemIds', () => {
    it('should add IDs to items without IDs', () => {
      const items: any[] = [
        { name: 'Request 1', request: { method: 'GET', url: 'https://api.com' } },
        { name: 'Folder 1', item: [{ name: 'Request 2', request: { method: 'POST', url: 'https://api.com' } }] },
      ];
      ensureItemIds(items);
      expect(items[0].id).toBeDefined();
      expect(items[1].id).toBeDefined();
      expect(items[1].item[0].id).toBeDefined();
    });

    it('should preserve existing IDs', () => {
      const items: any[] = [
        { id: 'existing-id', name: 'Request', request: { method: 'GET', url: 'https://api.com' } },
      ];
      ensureItemIds(items);
      expect(items[0].id).toBe('existing-id');
    });
  });

  describe('formDataToCollectionRequest', () => {
    it('should convert form data to collection request', () => {
      const formData: RequestFormData = {
        id: 'req-1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.com/users',
        headers: [
          { id: '1', key: 'Content-Type', value: 'application/json', disabled: false },
        ],
        params: [
          { id: '2', key: 'page', value: '1', disabled: false },
        ],
        body: '{"test":true}',
        sourceRef: { collectionFilename: 'test.json', collectionName: 'Test Collection', itemPath: [] },
      };
      
      const result = formDataToCollectionRequest(formData);
      
      expect(result.method).toBe('POST');
      expect(result.url).toBeDefined();
      expect(result.header).toHaveLength(1);
    });

    it('should handle request without body', () => {
      const formData: RequestFormData = {
        id: 'req-1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://api.com/users',
        headers: [],
        params: [],
        body: null,
        sourceRef: { collectionFilename: 'test.json', collectionName: 'Test Collection', itemPath: [] },
      };
      
      const result = formDataToCollectionRequest(formData);
      
      expect(result.method).toBe('GET');
      expect(result.body).toBeUndefined();
    });
  });
});
