import { describe, it, expect } from 'vitest';
import { HttpFileTransformer, httpFileTransformer } from '../../../utils/transformers/HttpFileTransformer';
import type { Collection } from '../../../types/collection';

describe('HttpFileTransformer', () => {
  const transformer = new HttpFileTransformer();

  describe('formatType and formatName', () => {
    it('should have correct format type', () => {
      expect(transformer.formatType).toBe('http');
    });

    it('should have correct format name', () => {
      expect(transformer.formatName).toBe('HTTP File');
    });

    it('should have correct file extensions', () => {
      expect(transformer.fileExtensions).toContain('.http');
      expect(transformer.fileExtensions).toContain('.rest');
    });
  });

  describe('validate', () => {
    it('should validate HTTP file content with GET request', () => {
      const httpContent = 'GET https://api.example.com/users';
      expect(transformer.validate(httpContent)).toBe(true);
    });

    it('should validate HTTP file content with POST request', () => {
      const httpContent = 'POST https://api.example.com/users';
      expect(transformer.validate(httpContent)).toBe(true);
    });

    it('should validate HTTP file with multiple methods', () => {
      const httpContent = `
### Get Users
GET https://api.example.com/users

### Create User
POST https://api.example.com/users
`;
      expect(transformer.validate(httpContent)).toBe(true);
    });

    it('should validate case-insensitive HTTP methods', () => {
      const httpContent = 'get https://api.example.com';
      expect(transformer.validate(httpContent)).toBe(true);
    });

    it('should validate all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      
      methods.forEach((method) => {
        const content = `${method} https://api.com`;
        expect(transformer.validate(content)).toBe(true);
      });
    });

    it('should reject non-string data', () => {
      expect(transformer.validate(null)).toBe(false);
      expect(transformer.validate(undefined)).toBe(false);
      expect(transformer.validate(123)).toBe(false);
      expect(transformer.validate({})).toBe(false);
      expect(transformer.validate([])).toBe(false);
    });

    it('should reject strings without HTTP methods', () => {
      expect(transformer.validate('Just some text')).toBe(false);
      expect(transformer.validate('URL: https://api.com')).toBe(false);
    });
  });

  describe('canHandle', () => {
    it('should handle valid HTTP file content', () => {
      const httpContent = 'GET https://api.example.com';
      expect(transformer.canHandle(httpContent)).toBe(true);
    });

    it('should reject non-HTTP content', () => {
      expect(transformer.canHandle('not http')).toBe(false);
      expect(transformer.canHandle({})).toBe(false);
    });
  });

  describe('transformFrom', () => {
    it('should transform simple GET request', () => {
      const httpContent = 'GET https://api.example.com/users';
      
      const result = transformer.transformFrom(httpContent, 'requests.http');

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('requests');
        expect(result.value.item).toHaveLength(1);
        expect(result.value.item[0].request?.method).toBe('GET');
      }
    });

    it('should transform request with name comment', () => {
      const httpContent = `### Get All Users
GET https://api.example.com/users`;
      
      const result = transformer.transformFrom(httpContent);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        // The name is parsed from the comment after ###
        expect(result.value.item[0].name).toBeDefined();
        expect(result.value.item).toHaveLength(1);
      }
    });

    it('should transform request with headers', () => {
      const httpContent = `POST https://api.example.com/users
Content-Type: application/json
Authorization: Bearer token123`;
      
      const result = transformer.transformFrom(httpContent);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const headers = result.value.item[0].request?.header || [];
        expect(headers).toHaveLength(2);
        expect(headers.find(h => h.key === 'Content-Type')?.value).toBe('application/json');
        expect(headers.find(h => h.key === 'Authorization')?.value).toBe('Bearer token123');
      }
    });

    it('should transform request with body', () => {
      const httpContent = `POST https://api.example.com/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}`;
      
      const result = transformer.transformFrom(httpContent);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        const request = result.value.item[0].request;
        expect(request?.body).toBeDefined();
      }
    });

    it('should transform multiple requests', () => {
      const httpContent = `### Get Users
GET https://api.example.com/users

### Create User
POST https://api.example.com/users
Content-Type: application/json

{"name": "John"}

### Update User
PUT https://api.example.com/users/1`;
      
      const result = transformer.transformFrom(httpContent);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item).toHaveLength(3);
        // First request name comes from the comment
        expect(result.value.item[0].name).toBeDefined();
        expect(result.value.item[1].name).toBeDefined();
        expect(result.value.item[2].name).toBeDefined();
      }
    });

    it('should handle requests without names', () => {
      const httpContent = `GET https://api.example.com/users

### 
DELETE https://api.example.com/users/1`;
      
      const result = transformer.transformFrom(httpContent);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item).toHaveLength(2);
        // Should generate default names
        expect(result.value.item[0].name).toBeDefined();
        expect(result.value.item[1].name).toBeDefined();
      }
    });

    it('should return error for content with no valid requests', () => {
      const httpContent = 'Just some random text without HTTP requests';
      
      const result = transformer.transformFrom(httpContent);

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('No valid HTTP requests found');
      }
    });

    it('should use filename for collection name', () => {
      const httpContent = 'GET https://api.com';
      
      const result = transformer.transformFrom(httpContent, 'my-api-tests.http');

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('my-api-tests');
      }
    });

    it('should handle .rest extension', () => {
      const httpContent = 'GET https://api.com';
      
      const result = transformer.transformFrom(httpContent, 'api.rest');

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('api');
      }
    });
  });

  describe('transformTo', () => {
    it('should export simple request to HTTP format', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'Test Collection',
        },
        item: [
          {
            id: 'req-1',
            name: 'Get Users',
            request: {
              method: 'GET',
              url: 'https://api.example.com/users',
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toContain('### Get Users');
        expect(result.value).toContain('GET https://api.example.com/users');
      }
    });

    it('should export request with headers', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'Test',
        },
        item: [
          {
            id: 'req-1',
            name: 'Create User',
            request: {
              method: 'POST',
              url: 'https://api.example.com/users',
              header: [
                { id: '1', key: 'Content-Type', value: 'application/json', disabled: false },
                { id: '2', key: 'Authorization', value: 'Bearer token', disabled: false },
              ],
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toContain('Content-Type: application/json');
        expect(result.value).toContain('Authorization: Bearer token');
      }
    });

    it('should skip disabled headers', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'Test',
        },
        item: [
          {
            id: 'req-1',
            name: 'Request',
            request: {
              method: 'GET',
              url: 'https://api.com',
              header: [
                { id: '1', key: 'Active-Header', value: 'value1', disabled: false },
                { id: '2', key: 'Disabled-Header', value: 'value2', disabled: true },
              ],
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toContain('Active-Header: value1');
        expect(result.value).not.toContain('Disabled-Header');
      }
    });

    it('should export multiple requests with separators', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'Multi Request',
        },
        item: [
          {
            id: 'req-1',
            name: 'Request 1',
            request: { method: 'GET', url: 'https://api.com/1' },
          },
          {
            id: 'req-2',
            name: 'Request 2',
            request: { method: 'POST', url: 'https://api.com/2' },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toContain('### Request 1');
        expect(result.value).toContain('### Request 2');
        expect(result.value).toContain('###');
      }
    });

    it('should handle folders by flattening structure', () => {
      const collection: Collection = {
        info: {
          waveId: 'id',
          name: 'Nested',
        },
        item: [
          {
            id: 'folder-1',
            name: 'Auth',
            item: [
              {
                id: 'req-1',
                name: 'Login',
                request: { method: 'POST', url: 'https://api.com/login' },
              },
            ],
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toContain('Login');
        expect(result.value).toContain('POST https://api.com/login');
      }
    });
  });

  describe('httpFileTransformer singleton', () => {
    it('should export singleton instance', () => {
      expect(httpFileTransformer).toBeInstanceOf(HttpFileTransformer);
      expect(httpFileTransformer.formatType).toBe('http');
    });
  });
});
