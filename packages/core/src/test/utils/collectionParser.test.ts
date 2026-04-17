import { describe, it, expect } from 'vitest';
import {
  urlToString,
  extractUrlParams,
  stringToCollectionUrl,
  findItemById,
  findItemWithPath,
  getAllRequestItems,
  countRequests,
  getFolderPathOptions,
  ensureItemIds,
  extractRequestFromItem,
  requestToCollectionItem,
} from '../../utils/collectionParser';
import type {
  Collection,
  CollectionItem,
  CollectionUrl,
  AnyCollectionRequest,
  CollectionRequest,
  WsCollectionRequest,
  SseCollectionRequest,
} from '../../types/collection';

describe('collectionParser', () => {
  
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
        request: { id: 'req-1', name: 'Get Users', method: 'GET', url: 'https://api.example.com/users' },
      },
      {
        id: 'folder-1',
        name: 'Auth',
        item: [
          {
            id: 'req-2',
            name: 'Login',
            request: { id: 'req-2', name: 'Login', method: 'POST', url: 'https://api.example.com/login' },
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
                request: { id: 'req-1', name: 'Get User', method: 'GET', url: 'https://api.example.com/users/1' },
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
        request: { id: 'req-1', name: 'Request 1', method: 'GET', url: 'https://api.example.com' },
      },
      {
        id: 'folder-1',
        name: 'Folder',
        item: [
          {
            id: 'req-2',
            name: 'Request 2',
            request: { id: 'req-2', name: 'Request 2', method: 'POST', url: 'https://api.example.com' },
          },
          {
            id: 'subfolder',
            name: 'Subfolder',
            item: [
              {
                id: 'req-3',
                name: 'Request 3',
                request: { id: 'req-3', name: 'Request 3', method: 'DELETE', url: 'https://api.example.com' },
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
          request: { id: 'req-1', name: 'Request 1', method: 'GET', url: 'https://api.example.com' },
        },
        {
          id: 'folder-1',
          name: 'Folder',
          item: [
            {
              id: 'req-2',
              name: 'Request 2',
              request: { id: 'req-2', name: 'Request 2', method: 'POST', url: 'https://api.example.com' },
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
        { name: 'Request 1', request: { id: 'tmp-1', name: 'Request 1', method: 'GET', url: 'https://api.com' } },
        { name: 'Folder 1', item: [{ name: 'Request 2', request: { id: 'tmp-2', name: 'Request 2', method: 'POST', url: 'https://api.com' } }] },
      ];
      ensureItemIds(items);
      expect(items[0].id).toBeDefined();
      expect(items[1].id).toBeDefined();
      expect(items[1].item[0].id).toBeDefined();
    });

    it('should preserve existing IDs', () => {
      const items: any[] = [
        { id: 'existing-id', name: 'Request', request: { id: 'existing-req', name: 'Request', method: 'GET', url: 'https://api.com' } },
      ];
      ensureItemIds(items);
      expect(items[0].id).toBe('existing-id');
    });
  });

  // ==========================================================================
  // Protocol-Aware Round-Trip Tests (FEAT-010)
  // ==========================================================================

  describe('extractRequestFromItem — protocol fidelity', () => {
    it('should extract an HTTP request with all fields preserved', () => {
      const item: CollectionItem = {
        id: 'http-1',
        name: 'Get Users',
        request: {
          id: 'http-1',
          name: 'Get Users',
          protocol: 'http',
          method: 'POST',
          url: 'https://api.example.com/users',
          header: [{ id: 'h1', key: 'Accept', value: 'application/json', disabled: false }],
          query: [{ id: 'q1', key: 'page', value: '1', disabled: false }],
          body: { mode: 'raw', raw: '{"test":true}' },
          validation: { enabled: true, rules: [] },
          authId: 'auth-1',
          description: 'Fetch users',
        } as CollectionRequest,
      };

      const extracted = extractRequestFromItem(item, 'collection.json', 'My API', ['Folder']);

      expect(extracted.id).toBe('http-1');
      expect(extracted.name).toBe('Get Users');
      expect(extracted.protocol).toBe('http');
      expect((extracted as CollectionRequest).method).toBe('POST');
      expect((extracted as CollectionRequest).body).toEqual({ mode: 'raw', raw: '{"test":true}' });
      expect((extracted as CollectionRequest).validation).toEqual({ enabled: true, rules: [] });
      expect(extracted.authId).toBe('auth-1');
      expect(extracted.sourceRef).toEqual({
        collectionFilename: 'collection.json',
        collectionName: 'My API',
        itemPath: ['Folder'],
      });
    });

    it('should extract a WS request without HTTP-only fields', () => {
      const item: CollectionItem = {
        id: 'ws-1',
        name: 'WS Echo',
        request: {
          id: 'ws-1',
          name: 'WS Echo',
          protocol: 'ws',
          url: 'wss://echo.example.com',
          header: [{ id: 'h1', key: 'x-token', value: 'abc', disabled: false }],
          query: [{ id: 'q1', key: 'room', value: 'test', disabled: false }],
          description: 'Echo endpoint',
        } as WsCollectionRequest,
      };

      const extracted = extractRequestFromItem(item, 'coll.json', 'WS Coll', []);

      expect(extracted.protocol).toBe('ws');
      expect(extracted.url).toBe('wss://echo.example.com');
      expect(extracted.header).toHaveLength(1);
      expect(extracted.query).toHaveLength(1);
      // WS must not have method, body, or validation
      expect((extracted as any).method).toBeUndefined();
      expect((extracted as any).body).toBeUndefined();
      expect((extracted as any).validation).toBeUndefined();
      expect(extracted.sourceRef?.collectionFilename).toBe('coll.json');
    });

    it('should extract an SSE request preserving method and body', () => {
      const item: CollectionItem = {
        id: 'sse-1',
        name: 'SSE Stream',
        request: {
          id: 'sse-1',
          name: 'SSE Stream',
          protocol: 'sse',
          method: 'POST',
          url: 'https://api.example.com/stream',
          body: { mode: 'raw', raw: '{"subscribe":"events"}' },
          header: [],
        } as SseCollectionRequest,
      };

      const extracted = extractRequestFromItem(item, 'coll.json', 'SSE Coll', ['Events']);

      expect(extracted.protocol).toBe('sse');
      expect((extracted as SseCollectionRequest).method).toBe('POST');
      expect((extracted as SseCollectionRequest).body).toEqual({ mode: 'raw', raw: '{"subscribe":"events"}' });
      // SSE must not have validation
      expect((extracted as any).validation).toBeUndefined();
    });

    it('should convert CollectionUrl to string on extraction', () => {
      const item: CollectionItem = {
        id: 'r1',
        name: 'R1',
        request: {
          id: 'r1',
          name: 'R1',
          method: 'GET',
          url: { raw: 'https://api.example.com/test', protocol: 'https', host: ['api', 'example', 'com'], path: ['test'] },
        } as CollectionRequest,
      };

      const extracted = extractRequestFromItem(item, 'c.json', 'C', []);
      expect(typeof extracted.url).toBe('string');
      expect(extracted.url).toBe('https://api.example.com/test');
    });

    it('should throw for items without a request', () => {
      const folderItem: CollectionItem = { id: 'f1', name: 'Folder', item: [] };
      expect(() => extractRequestFromItem(folderItem, 'c.json', 'C', [])).toThrow('Item is not a request');
    });
  });

  describe('requestToCollectionItem — protocol fidelity', () => {
    it('should convert HTTP request to item, stripping sourceRef', () => {
      const request: CollectionRequest = {
        id: 'http-1',
        name: 'Get Users',
        protocol: 'http',
        method: 'POST',
        url: 'https://api.example.com/users',
        header: [{ id: 'h1', key: 'Accept', value: 'application/json', disabled: false }],
        body: { mode: 'raw', raw: '{}' },
        validation: { enabled: true, rules: [] },
        sourceRef: { collectionFilename: 'old.json', collectionName: 'Old', itemPath: [] },
      };

      const item = requestToCollectionItem(request);

      expect(item.id).toBe('http-1');
      expect(item.name).toBe('Get Users');
      expect(item.request?.protocol).toBe('http');
      expect((item.request as CollectionRequest).method).toBe('POST');
      expect((item.request as CollectionRequest).body).toEqual({ mode: 'raw', raw: '{}' });
      expect((item.request as CollectionRequest).validation).toEqual({ enabled: true, rules: [] });
      // sourceRef must be stripped
      expect(item.request?.sourceRef).toBeUndefined();
    });

    it('should convert WS request to item, preserving protocol and WS fields', () => {
      const request: WsCollectionRequest = {
        id: 'ws-1',
        name: 'WS Echo',
        protocol: 'ws',
        url: 'wss://echo.example.com',
        header: [{ id: 'h1', key: 'x-token', value: 'abc', disabled: false }],
        query: [{ id: 'q1', key: 'room', value: 'test', disabled: false }],
        description: 'Echo endpoint',
        authId: 'auth-ws',
        sourceRef: { collectionFilename: 'ws.json', collectionName: 'WS', itemPath: [] },
      };

      const item = requestToCollectionItem(request);

      expect(item.id).toBe('ws-1');
      expect(item.name).toBe('WS Echo');
      expect(item.request?.protocol).toBe('ws');
      expect(item.request?.url).toBe('wss://echo.example.com');
      expect(item.request?.header).toHaveLength(1);
      expect(item.request?.query).toHaveLength(1);
      expect(item.request?.description).toBe('Echo endpoint');
      expect(item.request?.authId).toBe('auth-ws');
      // Must NOT have method, body, or validation
      expect((item.request as any).method).toBeUndefined();
      expect((item.request as any).body).toBeUndefined();
      expect((item.request as any).validation).toBeUndefined();
      // sourceRef must be stripped
      expect(item.request?.sourceRef).toBeUndefined();
    });

    it('should convert SSE request to item, preserving method and body', () => {
      const request: SseCollectionRequest = {
        id: 'sse-1',
        name: 'SSE Events',
        protocol: 'sse',
        method: 'POST',
        url: 'https://api.example.com/events',
        body: { mode: 'raw', raw: '{"filter":"all"}' },
        header: [{ id: 'h1', key: 'Accept', value: 'text/event-stream', disabled: false }],
        sourceRef: { collectionFilename: 'sse.json', collectionName: 'SSE', itemPath: ['Events'] },
      };

      const item = requestToCollectionItem(request);

      expect(item.id).toBe('sse-1');
      expect(item.name).toBe('SSE Events');
      expect(item.request?.protocol).toBe('sse');
      expect((item.request as SseCollectionRequest).method).toBe('POST');
      expect((item.request as SseCollectionRequest).body).toEqual({ mode: 'raw', raw: '{"filter":"all"}' });
      // Must NOT have validation
      expect((item.request as any).validation).toBeUndefined();
      // sourceRef must be stripped
      expect(item.request?.sourceRef).toBeUndefined();
    });
  });

  describe('end-to-end round-trip: extract → requestToCollectionItem', () => {
    it('should round-trip an HTTP request faithfully', () => {
      const originalItem: CollectionItem = {
        id: 'rt-http-1',
        name: 'HTTP RT',
        request: {
          id: 'rt-http-1',
          name: 'HTTP RT',
          protocol: 'http',
          method: 'PUT',
          url: 'https://api.example.com/resource',
          header: [{ id: 'h1', key: 'Content-Type', value: 'application/json', disabled: false }],
          query: [{ id: 'q1', key: 'v', value: '2', disabled: false }],
          body: { mode: 'raw', raw: '{"data":"test"}' },
          validation: { enabled: false, rules: [] },
          authId: 'auth-rt',
          description: 'Round-trip test',
        } as CollectionRequest,
      };

      const extracted = extractRequestFromItem(originalItem, 'rt.json', 'RT Coll', ['Folder']);
      const roundTripped = requestToCollectionItem(extracted);

      expect(roundTripped.id).toBe(originalItem.id);
      expect(roundTripped.name).toBe(originalItem.name);
      expect(roundTripped.request?.protocol).toBe('http');
      expect((roundTripped.request as CollectionRequest).method).toBe('PUT');
      expect((roundTripped.request as CollectionRequest).body).toEqual({ mode: 'raw', raw: '{"data":"test"}' });
      expect((roundTripped.request as CollectionRequest).validation).toEqual({ enabled: false, rules: [] });
      expect(roundTripped.request?.authId).toBe('auth-rt');
      // sourceRef should be stripped in the round-tripped item
      expect(roundTripped.request?.sourceRef).toBeUndefined();
    });

    it('should round-trip a WS request faithfully', () => {
      const originalItem: CollectionItem = {
        id: 'rt-ws-1',
        name: 'WS RT',
        request: {
          id: 'rt-ws-1',
          name: 'WS RT',
          protocol: 'ws',
          url: 'wss://ws.example.com/chat',
          header: [{ id: 'h1', key: 'Authorization', value: 'Bearer tok', disabled: false }],
          query: [{ id: 'q1', key: 'channel', value: 'general', disabled: false }],
          description: 'WS round-trip',
        } as WsCollectionRequest,
      };

      const extracted = extractRequestFromItem(originalItem, 'rt.json', 'RT Coll', []);
      const roundTripped = requestToCollectionItem(extracted);

      expect(roundTripped.id).toBe('rt-ws-1');
      expect(roundTripped.name).toBe('WS RT');
      expect(roundTripped.request?.protocol).toBe('ws');
      expect(roundTripped.request?.url).toBe('wss://ws.example.com/chat');
      expect(roundTripped.request?.header).toHaveLength(1);
      expect(roundTripped.request?.query).toHaveLength(1);
      expect(roundTripped.request?.description).toBe('WS round-trip');
      expect((roundTripped.request as any).method).toBeUndefined();
      expect((roundTripped.request as any).body).toBeUndefined();
      expect((roundTripped.request as any).validation).toBeUndefined();
    });

    it('should round-trip an SSE request faithfully', () => {
      const originalItem: CollectionItem = {
        id: 'rt-sse-1',
        name: 'SSE RT',
        request: {
          id: 'rt-sse-1',
          name: 'SSE RT',
          protocol: 'sse',
          method: 'POST',
          url: 'https://sse.example.com/stream',
          header: [{ id: 'h1', key: 'Accept', value: 'text/event-stream', disabled: false }],
          body: { mode: 'raw', raw: '{"subscribe":"*"}' },
          description: 'SSE round-trip',
          authId: 'auth-sse',
        } as SseCollectionRequest,
      };

      const extracted = extractRequestFromItem(originalItem, 'rt.json', 'RT Coll', ['Streams']);
      const roundTripped = requestToCollectionItem(extracted);

      expect(roundTripped.id).toBe('rt-sse-1');
      expect(roundTripped.name).toBe('SSE RT');
      expect(roundTripped.request?.protocol).toBe('sse');
      expect((roundTripped.request as SseCollectionRequest).method).toBe('POST');
      expect((roundTripped.request as SseCollectionRequest).body).toEqual({ mode: 'raw', raw: '{"subscribe":"*"}' });
      expect(roundTripped.request?.authId).toBe('auth-sse');
      expect((roundTripped.request as any).validation).toBeUndefined();
    });

    it('should treat legacy items without protocol as HTTP', () => {
      const legacyItem: CollectionItem = {
        id: 'legacy-1',
        name: 'Legacy GET',
        request: {
          id: 'legacy-1',
          name: 'Legacy GET',
          method: 'GET',
          url: 'https://api.example.com/old',
        } as CollectionRequest,
      };

      const extracted = extractRequestFromItem(legacyItem, 'legacy.json', 'Legacy', []);

      // Legacy (no protocol) should still be usable as HTTP
      expect(extracted.protocol).toBeUndefined();
      expect((extracted as CollectionRequest).method).toBe('GET');
    });
  });
});
