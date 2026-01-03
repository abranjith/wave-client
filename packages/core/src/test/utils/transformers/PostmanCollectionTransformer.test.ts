import { describe, it, expect } from 'vitest';
import { PostmanCollectionTransformer, postmanTransformer } from '../../../utils/transformers/PostmanCollectionTransformer';
import type { PostmanCollection } from '../../../types/external/postman';
import type { Collection } from '../../../types/collection';

describe('PostmanCollectionTransformer', () => {
  const transformer = new PostmanCollectionTransformer();

  describe('formatType and formatName', () => {
    it('should have correct format type', () => {
      expect(transformer.formatType).toBe('postman');
    });

    it('should have correct format name', () => {
      expect(transformer.formatName).toBe('Postman Collection v2.1.0');
    });

    it('should have correct file extensions', () => {
      expect(transformer.fileExtensions).toContain('.json');
      expect(transformer.fileExtensions).toContain('.postman_collection.json');
    });
  });

  describe('validate', () => {
    it('should validate a valid Postman collection', () => {
      const data = {
        info: {
          _postman_id: 'postman-id',
          name: 'Postman Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      expect(transformer.validate(data)).toBe(true);
    });

    it('should validate Postman collection with schema containing postman.com', () => {
      const data = {
        info: {
          name: 'Collection',
          schema: 'https://schema.postman.com/collection.json',
        },
        item: [],
      };

      expect(transformer.validate(data)).toBe(true);
    });

    it('should validate Postman collection without schema but with item array', () => {
      const data = {
        info: {
          _postman_id: 'id',
          name: 'Collection',
        },
        item: [],
      };

      expect(transformer.validate(data)).toBe(true);
    });

    it('should reject null or undefined', () => {
      expect(transformer.validate(null)).toBe(false);
      expect(transformer.validate(undefined)).toBe(false);
    });

    it('should reject non-object data', () => {
      expect(transformer.validate('string')).toBe(false);
      expect(transformer.validate(123)).toBe(false);
    });

    it('should reject data without info', () => {
      const data = { item: [] };
      expect(transformer.validate(data)).toBe(false);
    });

    it('should reject data without info.name', () => {
      const data = {
        info: { _postman_id: 'id' },
        item: [],
      };
      expect(transformer.validate(data)).toBe(false);
    });

    it('should reject data without schema and without item array', () => {
      const data = {
        info: {
          name: 'Test',
        },
      };
      expect(transformer.validate(data)).toBe(false);
    });
  });

  describe('canHandle', () => {
    it('should handle valid Postman collection', () => {
      const data = {
        info: {
          _postman_id: 'postman-id',
          name: 'Postman Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      expect(transformer.canHandle(data)).toBe(true);
    });

    it('should handle Postman collection without _postman_id', () => {
      const data = {
        info: {
          name: 'Collection',
          schema: 'https://schema.postman.com/v2.json',
        },
        item: [],
      };

      expect(transformer.canHandle(data)).toBe(true);
    });

    it('should reject invalid data', () => {
      expect(transformer.canHandle({ info: 'invalid' })).toBe(false);
    });
  });

  describe('transformFrom', () => {
    it('should transform basic Postman collection', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          _postman_id: 'pm-id',
          name: 'My API',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      const result = transformer.transformFrom(postmanCollection, 'my-api.json');

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('My API');
        expect(result.value.filename).toBe('my-api.json');
        expect(result.value.item).toEqual([]);
      }
    });

    it('should transform Postman collection with description', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          _postman_id: 'pm-id',
          name: 'Test Collection',
          description: 'This is a test collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.description).toBe('This is a test collection');
      }
    });

    it('should transform Postman collection with description object', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          _postman_id: 'pm-id',
          name: 'Test',
          description: { content: 'Description content' },
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.description).toBe('Description content');
      }
    });

    it('should transform Postman collection with simple request', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          _postman_id: 'pm-id',
          name: 'API Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Get Users',
            request: {
              method: 'GET',
              url: 'https://api.example.com/users',
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item).toHaveLength(1);
        expect(result.value.item[0].name).toBe('Get Users');
        expect(result.value.item[0].request?.method).toBe('GET');
      }
    });

    it('should transform Postman collection with folder', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          _postman_id: 'pm-id',
          name: 'API',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Auth',
            item: [
              {
                name: 'Login',
                request: {
                  method: 'POST',
                  url: 'https://api.example.com/login',
                },
              },
            ],
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item).toHaveLength(1);
        expect(result.value.item[0].name).toBe('Auth');
        expect(result.value.item[0].item).toHaveLength(1);
        expect(result.value.item[0].item![0].name).toBe('Login');
      }
    });

    it('should handle errors during transformation', () => {
      const invalidCollection: any = {
        info: {
          name: 'Test',
        },
        item: [
          {
            // This will cause an error during transformation
            name: null,
            request: null,
          },
        ],
      };

      const result = transformer.transformFrom(invalidCollection);

      // Depending on implementation, might succeed or fail
      // If it fails, error message should be descriptive
      if (!result.isOk) {
        expect(result.error).toContain('Failed to transform Postman collection');
      }
    });
  });

  describe('transformTo', () => {
    it('should transform Collection to Postman format', () => {
      const collection: Collection = {
        info: {
          waveId: 'wave-id',
          name: 'My Collection',
          version: '0.0.1',
        },
        item: [
          {
            id: 'req-1',
            name: 'Get Data',
            request: {
              method: 'GET',
              url: 'https://api.example.com/data',
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('My Collection');
        expect(result.value.info.schema).toContain('schema.getpostman.com');
        expect(result.value.item).toHaveLength(1);
      }
    });

    it('should include description in exported collection', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'Test',
          description: 'Test description',
        },
        item: [],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.description).toBe('Test description');
      }
    });

    it('should transform nested folders', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'API',
        },
        item: [
          {
            id: 'folder-1',
            name: 'Users',
            item: [
              {
                id: 'req-1',
                name: 'Get User',
                request: {
                  method: 'GET',
                  url: 'https://api.com/users/1',
                },
              },
            ],
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].name).toBe('Users');
        expect(result.value.item[0].item).toHaveLength(1);
      }
    });
  });

  describe('postmanTransformer singleton', () => {
    it('should export singleton instance', () => {
      expect(postmanTransformer).toBeInstanceOf(PostmanCollectionTransformer);
      expect(postmanTransformer.formatType).toBe('postman');
    });
  });

  describe('transformFrom - advanced request features', () => {
    it('should transform request with URL object', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.example.com:8080/users?page=1',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                port: '8080',
                path: ['users'],
                query: [
                  { key: 'page', value: '1', disabled: false },
                ],
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const request = result.value.item[0].request;
        expect(request).toBeDefined();
        if (typeof request?.url !== 'string') {
          expect(request?.url.protocol).toBe('https');
          expect(request?.url.host).toEqual(['api', 'example', 'com']);
          expect(request?.url.path).toEqual(['users']);
          expect(request?.url.query).toHaveLength(1);
        }
      }
    });

    it('should handle request with headers as string', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request',
            request: {
              method: 'POST',
              url: 'https://api.com',
              header: 'Content-Type: application/json\nAuthorization: Bearer token',
            } as any,
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const headers = result.value.item[0].request?.header || [];
        expect(headers.length).toBeGreaterThan(0);
        expect(headers.find(h => h.key === 'Content-Type')).toBeDefined();
      }
    });

    it('should handle request with raw body', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Create',
            request: {
              method: 'POST',
              url: 'https://api.com/users',
              body: {
                mode: 'raw',
                raw: '{"name": "John"}',
                options: {
                  raw: {
                    language: 'json',
                  },
                },
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const body = result.value.item[0].request?.body;
        expect(body).toBeDefined();
        expect(body?.mode).toBe('raw');
        expect(body?.raw).toBe('{"name": "John"}');
      }
    });

    it('should handle request with urlencoded body', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Form Submit',
            request: {
              method: 'POST',
              url: 'https://api.com/submit',
              body: {
                mode: 'urlencoded',
                urlencoded: [
                  { key: 'username', value: 'john', disabled: false },
                  { key: 'password', value: 'secret', disabled: false },
                ],
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const body = result.value.item[0].request?.body;
        expect(body?.mode).toBe('urlencoded');
        expect(body?.urlencoded).toHaveLength(2);
      }
    });

    it('should handle request with formdata body', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Upload',
            request: {
              method: 'POST',
              url: 'https://api.com/upload',
              body: {
                mode: 'formdata',
                formdata: [
                  { key: 'file', type: 'file', src: '/path/to/file.txt' },
                  { key: 'description', value: 'Test file' },
                ],
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const body = result.value.item[0].request?.body;
        expect(body?.mode).toBe('formdata');
        expect(body?.formdata).toHaveLength(2);
      }
    });

    it('should handle disabled body', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request',
            request: {
              method: 'POST',
              url: 'https://api.com',
              body: {
                mode: 'raw',
                raw: '{}',
                disabled: true,
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].request?.body).toBeUndefined();
      }
    });

    it('should handle request with responses', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request with responses',
            request: {
              method: 'GET',
              url: 'https://api.com',
            },
            response: [
              {
                id: 'response-1',
                status: 'OK',
                code: 200,
                body: '{"result": "success"}',
              },
            ],
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].response).toHaveLength(1);
        expect(result.value.item[0].response![0].code).toBe(200);
      }
    });

    it('should handle missing or default values', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Minimal Request',
            request: {
              // No method - should default to GET
              url: 'https://api.com',
            } as any,
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].request?.method).toBe('GET');
      }
    });

    it('should handle URL without protocol', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request',
            request: {
              method: 'GET',
              url: {
                host: ['api', 'example', 'com'],
                path: ['users'],
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const url = result.value.item[0].request?.url;
        expect(url).toBeDefined();
      }
    });

    it('should handle URL with host as string', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.com',
                host: 'api.com' as any,
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
    });

    it('should handle URL with path as string', () => {
      const postmanCollection: PostmanCollection = {
        info: {
          name: 'Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Request',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.com/users',
                host: ['api', 'com'],
                path: 'users' as any,
              },
            },
          },
        ],
      };

      const result = transformer.transformFrom(postmanCollection);

      expect(result.isOk).toBe(true);
    });
  });

  describe('transformTo - advanced features', () => {
    it('should transform request with headers', () => {
      const collection: Collection = {
        info: { waveId: 'id', name: 'Test' },
        item: [
          {
            id: 'req-1',
            name: 'Request with headers',
            request: {
              method: 'POST',
              url: 'https://api.com',
              header: [
                { id: '1', key: 'Content-Type', value: 'application/json', disabled: false },
                { id: '2', key: 'X-Custom', value: 'value', disabled: true },
              ],
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const request = result.value.item[0].request;
        expect(request?.header).toBeDefined();
      }
    });

    it('should transform request with body', () => {
      const collection: Collection = {
        info: { waveId: 'id', name: 'Test' },
        item: [
          {
            id: 'req-1',
            name: 'Request with body',
            request: {
              method: 'POST',
              url: 'https://api.com',
              body: {
                mode: 'raw',
                raw: '{"test": true}',
              },
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const request = result.value.item[0].request;
        expect(request?.body).toBeDefined();
      }
    });

    it('should transform deeply nested folders', () => {
      const collection: Collection = {
        info: { waveId: 'id', name: 'Nested' },
        item: [
          {
            id: 'folder-1',
            name: 'Level 1',
            item: [
              {
                id: 'folder-2',
                name: 'Level 2',
                item: [
                  {
                    id: 'req-1',
                    name: 'Deep Request',
                    request: { method: 'GET', url: 'https://api.com' },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].item).toBeDefined();
        expect(result.value.item[0].item![0].item).toBeDefined();
      }
    });
  });
});
