import { describe, it, expect } from 'vitest';
import { SwaggerTransformer, swaggerTransformer } from '../../../utils/transformers/SwaggerTransformer';
import type { Collection, CollectionRequest } from '../../../types/collection';
import { validateCollectionTree } from '../../../utils/collectionParser';

describe('SwaggerTransformer', () => {
  const transformer = new SwaggerTransformer();

  describe('format metadata', () => {
    it('should expose swagger format metadata', async () => {
      expect(transformer.formatType).toBe('swagger');
      expect(transformer.formatName).toBe('OpenAPI / Swagger');
      expect(transformer.fileExtensions).toEqual(['.json', '.yaml', '.yml']);
    });
  });

  describe('validate and canHandle', () => {
    it('should validate OpenAPI object data', async () => {
      const input = {
        openapi: '3.1.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {},
      };

      expect(transformer.validate(input)).toBe(true);
      expect(transformer.canHandle(input)).toBe(true);
    });

    it('should validate yaml-like OpenAPI string markers', async () => {
      const yaml = 'openapi: 3.0.3\ninfo:\n  title: YAML API\n  version: 1.0.0\npaths: {}\n';
      expect(transformer.validate(yaml)).toBe(true);
      expect(transformer.canHandle(yaml)).toBe(true);
    });

    it('should reject invalid non-openapi input', async () => {
      expect(transformer.validate({ foo: 'bar' })).toBe(false);
      expect(transformer.canHandle('just plain text')).toBe(false);
    });
  });

  describe('transformFrom', () => {
    it('should transform OpenAPI JSON object with tags, parameters and body', async () => {
      const input = {
        openapi: '3.1.0',
        info: {
          title: 'Pets API',
          description: 'Pet service',
          version: '1.0.0',
        },
        servers: [
          {
            url: 'https://{env}.api.example.com/v1',
            variables: {
              env: { default: 'dev' },
            },
          },
        ],
        tags: [{ name: 'Pets', description: 'Pet operations' }],
        paths: {
          '/pets/{petId}': {
            parameters: [
              { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
            ],
            get: {
              tags: ['Pets'],
              summary: 'Get Pet',
              parameters: [
                { name: 'include', in: 'query', required: false, schema: { type: 'string', default: 'all' } },
                { name: 'X-Trace-Id', in: 'header', required: false, schema: { type: 'string' } },
              ],
              responses: {
                '200': { description: 'ok' },
              },
            },
            post: {
              tags: ['Pets'],
              summary: 'Create Pet',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: {
                '201': { description: 'created' },
              },
            },
          },
        },
      };

      const result = await transformer.transformFrom(input, 'pets.json');

      expect(result.isOk, result.isOk ? '' : result.error).toBe(true);
      if (!result.isOk) {
        return;
      }

      expect(result.value.info.name).toBe('Pets API');
      expect(result.value.info.description).toBe('Pet service');
      expect(result.value.item).toHaveLength(1);

      const folder = result.value.item[0];
      expect(folder.name).toBe('Pets');
      expect(folder.item).toHaveLength(2);

      const getRequestItem = folder.item?.find((entry) => entry.name === 'Get Pet');
      expect((getRequestItem?.request as CollectionRequest | undefined)?.method).toBe('GET');
      expect((getRequestItem?.request?.url as { raw: string }).raw).toContain('https://dev.api.example.com/v1/pets/{{petId}}');
      expect(getRequestItem?.request?.url && typeof getRequestItem.request.url !== 'string' ? getRequestItem.request.url.query?.[0].key : '').toBe('include');
      expect(getRequestItem?.request?.url && typeof getRequestItem.request.url !== 'string' ? getRequestItem.request.url.query?.[0].disabled : false).toBe(true);

      const header = getRequestItem?.request?.header?.find((entry) => entry.key === 'X-Trace-Id');
      expect(header?.disabled).toBe(true);

      const createRequestItem = folder.item?.find((entry) => entry.name === 'Create Pet');
      const contentTypeHeader = createRequestItem?.request?.header?.find((entry) => entry.key === 'Content-Type');
      expect(contentTypeHeader?.value).toBe('application/json');
      expect((createRequestItem?.request as CollectionRequest | undefined)?.body?.mode).toBe('raw');
      const createBody = (createRequestItem?.request as CollectionRequest | undefined)?.body;
      const createBodyRaw = createBody?.mode === 'raw' ? createBody.raw : '';
      expect(createBodyRaw).toContain('name');
    });

    it('should transform YAML string input', async () => {
      const yaml = `
openapi: 3.0.3
info:
  title: YAML API
  version: 1.0.0
paths:
  /health:
    get:
      summary: Health
      responses:
        "200":
          description: ok
`;

      const result = await transformer.transformFrom(yaml, 'api.yaml');
      expect(result.isOk).toBe(true);

      if (!result.isOk) {
        return;
      }

      expect(result.value.info.name).toBe('YAML API');
      expect(result.value.item).toHaveLength(1);
      expect((result.value.item[0].request as CollectionRequest | undefined)?.method).toBe('GET');
    });

    it('should transform Swagger 2.0 spec and build base url from host/basePath/schemes', async () => {
      const swagger = {
        swagger: '2.0',
        info: { title: 'Swagger API', version: '1.0.0' },
        host: 'api.example.com',
        basePath: '/v2',
        schemes: ['http'],
        paths: {
          '/users': {
            post: {
              summary: 'Create User',
              consumes: ['application/json'],
              parameters: [
                {
                  name: 'body',
                  in: 'body',
                  required: true,
                  schema: {
                    type: 'object',
                    properties: { name: { type: 'string' } },
                  },
                },
              ],
              responses: {
                '200': { description: 'ok' },
              },
            },
          },
        },
      };

      const result = await transformer.transformFrom(swagger, 'swagger.json');
      expect(result.isOk).toBe(true);

      if (!result.isOk) {
        return;
      }

      expect(result.value.item).toHaveLength(1);
      const request = result.value.item[0].request as CollectionRequest | undefined;
      expect(request?.method).toBe('POST');
      expect(request && typeof request.url !== 'string' ? request.url.raw : '').toBe('http://api.example.com/v2/users');
      expect((request as CollectionRequest | undefined)?.body?.mode).toBe('raw');
    });

    it('should resolve inline $refs in request body and parameters', async () => {
      const input = {
        openapi: '3.1.0',
        info: { title: 'Ref API', version: '1.0.0' },
        paths: {
          '/pets': {
            post: {
              summary: 'Create Pet',
              parameters: [
                { $ref: '#/components/parameters/PageSize' },
              ],
              requestBody: {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Pet' },
                  },
                },
              },
            },
          },
        },
        components: {
          parameters: {
            PageSize: {
              name: 'pageSize',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 20 },
            },
          },
          schemas: {
            Pet: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'integer' },
              },
            },
          },
        },
      };

      const result = await transformer.transformFrom(input);
      expect(result.isOk).toBe(true);

      if (!result.isOk) {
        return;
      }

      const request = result.value.item[0].request as CollectionRequest | undefined;
      expect(request && typeof request.url !== 'string' ? request.url.query?.[0].key : '').toBe('pageSize');
      const requestBody = (request as CollectionRequest | undefined)?.body;
      const requestBodyRaw = requestBody?.mode === 'raw' ? requestBody.raw : '';
      expect(requestBodyRaw).toContain('name');
      expect(requestBodyRaw).toContain('age');
    });

    it('should return error for invalid yaml/json input', async () => {
      const result = await transformer.transformFrom('openapi: 3.0.3\ninfo:\n  title: Broken');
      expect(result.isOk).toBe(false);
    });

    it('should suffix duplicate request names within the same tagged folder', async () => {
      const input = {
        openapi: '3.0.3',
        info: { title: 'Dup API', version: '1.0.0' },
        paths: {
          '/users': {
            get: {
              tags: ['Users'],
              summary: 'List Users',
              responses: { '200': { description: 'ok' } },
            },
          },
          '/admins': {
            get: {
              tags: ['Users'],
              summary: 'List Users',
              responses: { '200': { description: 'ok' } },
            },
          },
          '/guests': {
            get: {
              tags: ['Users'],
              summary: 'list users',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      };

      const result = await transformer.transformFrom(input, 'dup.json');
      expect(result.isOk, result.isOk ? '' : result.error).toBe(true);
      if (!result.isOk) {
        return;
      }

      expect(result.value.item).toHaveLength(1);
      const usersFolder = result.value.item[0];
      const requestNames = (usersFolder.item ?? []).map((entry) => entry.name);
      const nestedRequestNames = (usersFolder.item ?? []).map((entry) => entry.request?.name);

      expect(usersFolder.name).toBe('Users');
      expect(requestNames).toEqual(['List Users', 'List Users 2', 'list users 3']);
      expect(nestedRequestNames).toEqual(['List Users', 'List Users 2', 'list users 3']);
      expect(validateCollectionTree(result.value).isOk).toBe(true);
    });

    it('should suffix untagged request names when they collide with root folder names', async () => {
      const input = {
        openapi: '3.0.3',
        info: { title: 'Root Collision API', version: '1.0.0' },
        paths: {
          '/pets': {
            get: {
              summary: 'Pets',
              responses: { '200': { description: 'ok' } },
            },
          },
          '/pets-search': {
            get: {
              summary: 'Pets',
              responses: { '200': { description: 'ok' } },
            },
          },
          '/tagged': {
            get: {
              tags: ['Pets'],
              summary: 'Get Tagged Pets',
              responses: { '200': { description: 'ok' } },
            },
          },
        },
      };

      const result = await transformer.transformFrom(input, 'root-collision.json');
      expect(result.isOk, result.isOk ? '' : result.error).toBe(true);
      if (!result.isOk) {
        return;
      }

      const rootNames = result.value.item.map((entry) => entry.name);
      const untaggedRequestNames = result.value.item
        .filter((entry) => Boolean(entry.request))
        .map((entry) => entry.request?.name);

      expect(rootNames).toEqual(['Pets', 'Pets 2', 'Pets 3']);
      expect(untaggedRequestNames).toEqual(['Pets 2', 'Pets 3']);
      expect(validateCollectionTree(result.value).isOk).toBe(true);
    });
  });

  describe('transformTo', () => {
    it('should export collection to OpenAPI 3.0.3 structure', async () => {
      const collection: Collection = {
        info: {
          waveId: 'wave-1',
          name: 'Export API',
          description: 'Export test',
          version: '0.0.1',
        },
        item: [
          {
            id: 'folder-1',
            name: 'Pets',
            item: [
              {
                id: 'request-1',
                name: 'Get Pet',
                request: {
                  id: 'req-1',
                  name: 'Get Pet',
                  method: 'GET',
                  url: {
                    raw: 'https://api.example.com/pets/{{petId}}',
                    host: ['api.example.com'],
                    path: ['pets', '{{petId}}'],
                  },
                },
              },
            ],
          },
        ],
      };

      const result = await transformer.transformTo(collection);
      expect(result.isOk).toBe(true);

      if (!result.isOk) {
        return;
      }

      const spec = result.value as Record<string, unknown>;
      expect(spec.openapi).toBe('3.0.3');
      expect((spec.info as Record<string, unknown>).title).toBe('Export API');
      expect((spec.servers as Array<Record<string, unknown>>)[0].url).toBe('https://api.example.com');

      const paths = spec.paths as Record<string, Record<string, unknown>>;
      expect(paths['/pets/{petId}']).toBeDefined();
      expect(paths['/pets/{petId}'].get).toBeDefined();
    });
  });

  describe('singleton export', () => {
    it('should export singleton instance', async () => {
      expect(swaggerTransformer).toBeInstanceOf(SwaggerTransformer);
      expect(swaggerTransformer.formatType).toBe('swagger');
    });
  });
});
