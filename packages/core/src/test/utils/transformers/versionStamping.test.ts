import { describe, it, expect } from 'vitest';

import { CURRENT_COLLECTION_SCHEMA_VERSION } from '../../../schemas/collectionSchema';
import { waveTransformer } from '../../../utils/transformers/WaveCollectionTransformer';
import { postmanTransformer } from '../../../utils/transformers/PostmanCollectionTransformer';
import { httpFileTransformer } from '../../../utils/transformers/HttpFileTransformer';
import { swaggerTransformer } from '../../../utils/transformers/SwaggerTransformer';
import type { Collection } from '../../../types/collection';

/**
 * FEAT-001: every transformer must stamp `info.version` from the canonical
 * core constant — asserted against the constant (not a literal) so a future
 * schema version bump cannot silently diverge per transformer.
 */
describe('transformer schema version stamping', () => {
    it('WaveCollectionTransformer stamps the current schema version when info is absent', async () => {
        const result = await waveTransformer.transformFrom({ item: [] } as unknown as Collection, 'col.json');
        expect(result.isOk).toBe(true);
        expect(result.value!.info.version).toBe(CURRENT_COLLECTION_SCHEMA_VERSION);
    });

    it('PostmanCollectionTransformer stamps the current schema version', async () => {
        const postman = {
            info: {
                name: 'PM Collection',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
            },
            item: [],
        };
        const result = await postmanTransformer.transformFrom(postman as never, 'pm.json');
        expect(result.isOk).toBe(true);
        expect(result.value!.info.version).toBe(CURRENT_COLLECTION_SCHEMA_VERSION);
    });

    it('HttpFileTransformer stamps the current schema version', async () => {
        const result = await httpFileTransformer.transformFrom('GET https://example.com/users\n', 'api.http');
        expect(result.isOk).toBe(true);
        expect(result.value!.info.version).toBe(CURRENT_COLLECTION_SCHEMA_VERSION);
    });

    it('SwaggerTransformer stamps the current schema version', async () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'API', version: '1.0.0' },
            paths: {
                '/users': {
                    get: { summary: 'List users', responses: { '200': { description: 'ok' } } },
                },
            },
        };
        const result = await swaggerTransformer.transformFrom(spec as never, 'spec.json');
        expect(result.isOk).toBe(true);
        expect(result.value!.info.version).toBe(CURRENT_COLLECTION_SCHEMA_VERSION);
    });
});
