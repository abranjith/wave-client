import { describe, it, expect } from 'vitest';

import {
    CURRENT_COLLECTION_SCHEMA_VERSION,
    validateWaveCollection,
} from '../../schemas/collectionSchema';
import type { Collection } from '../../types/collection';

/** Builds a minimal valid collection for tests. */
function minimalCollection(): Collection {
    return {
        info: {
            waveId: 'wave-1',
            name: 'Test Collection',
            version: CURRENT_COLLECTION_SCHEMA_VERSION,
        },
        item: [],
    };
}

describe('validateWaveCollection', () => {
    it('accepts a minimal valid collection', () => {
        const result = validateWaveCollection(minimalCollection());
        expect(result.isOk).toBe(true);
    });

    it('accepts a deep collection with nested folders and all request protocols', () => {
        const collection = {
            info: {
                waveId: 'wave-2',
                name: 'Deep Collection',
                description: 'desc',
                schema: 'legacy-schema-url',
                version: '0.0.1',
            },
            item: [
                {
                    id: 'folder-1',
                    name: 'Folder 1',
                    item: [
                        {
                            id: 'item-http',
                            name: 'HTTP Request',
                            request: {
                                id: 'req-http',
                                name: 'HTTP Request',
                                method: 'POST',
                                url: { raw: 'https://api.example.com/users', host: ['api.example.com'], path: ['users'] },
                                query: [{ id: 'q1', key: 'a', value: '1', disabled: false }],
                                header: [{ id: 'h1', key: 'Content-Type', value: 'application/json', disabled: false }],
                                body: { mode: 'raw', raw: '{"x":1}', options: { raw: { language: 'json' } } },
                                validation: { rules: [{ anything: true }] },
                            },
                        },
                        {
                            id: 'item-ws',
                            name: 'WS Request',
                            request: {
                                id: 'req-ws',
                                name: 'WS Request',
                                protocol: 'ws',
                                url: 'wss://example.com/socket',
                            },
                        },
                        {
                            id: 'item-sse',
                            name: 'SSE Request',
                            request: {
                                id: 'req-sse',
                                name: 'SSE Request',
                                protocol: 'sse',
                                method: 'GET',
                                url: 'https://example.com/events',
                            },
                        },
                    ],
                },
            ],
        };

        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(true);
    });

    it('accepts all five body modes', () => {
        const bodies = [
            { mode: 'none' },
            { mode: 'raw', raw: 'text' },
            { mode: 'urlencoded', urlencoded: [{ id: 'f1', key: 'k', value: 'v', disabled: false }] },
            { mode: 'formdata', formdata: [{ id: 'm1', key: 'k', value: 'v', disabled: false, fieldType: 'text' }] },
            {
                mode: 'file',
                file: {
                    path: '/tmp/file.bin',
                    fileName: 'file.bin',
                    contentType: 'application/octet-stream',
                    size: 10,
                    pathType: 'absolute',
                    storageType: 'local',
                },
            },
        ];

        for (const body of bodies) {
            const collection = minimalCollection();
            collection.item = [
                {
                    id: 'i1',
                    name: 'R',
                    request: {
                        id: 'r1',
                        name: 'R',
                        method: 'POST',
                        url: 'https://example.com',
                        body: body as never,
                    },
                },
            ];
            const result = validateWaveCollection(collection);
            expect(result.isOk, `body mode ${(body as { mode: string }).mode} should validate`).toBe(true);
        }
    });

    it('accepts a legacy http request without a protocol field', () => {
        const collection = minimalCollection();
        collection.item = [
            {
                id: 'i1',
                name: 'Legacy',
                request: { id: 'r1', name: 'Legacy', method: 'GET', url: 'https://example.com' },
            },
        ];
        expect(validateWaveCollection(collection).isOk).toBe(true);
    });

    it('rejects a collection missing info.name with the path in the message', () => {
        const collection = {
            info: { waveId: 'w', version: '0.0.1' },
            item: [],
        };
        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('info.name');
    });

    it('rejects a collection missing info.version (stamping happens upstream)', () => {
        const collection = {
            info: { waveId: 'w', name: 'N' },
            item: [],
        };
        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('info.version');
    });

    it('rejects an item missing an id', () => {
        const collection = {
            ...minimalCollection(),
            item: [{ name: 'No Id' }],
        };
        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('id');
    });

    it('rejects a body whose payload does not match its mode', () => {
        const collection = minimalCollection();
        collection.item = [
            {
                id: 'i1',
                name: 'R',
                request: {
                    id: 'r1',
                    name: 'R',
                    method: 'POST',
                    url: 'https://example.com',
                    body: { mode: 'raw' } as never, // missing `raw`
                },
            },
        ];
        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(false);
    });

    it('preserves unknown extra fields by returning the original object', () => {
        const collection = { ...minimalCollection(), customField: { keep: 'me' } };
        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(true);
        // Validate-only semantics: the exact input object comes back, untouched.
        expect(result.value).toBe(collection);
        expect((result.value as typeof collection).customField).toEqual({ keep: 'me' });
    });

    it.each([
        ['null', null],
        ['a string', 'not a collection'],
        ['an array', []],
        ['a number', 42],
    ])('rejects %s input gracefully', (_label, input) => {
        const result = validateWaveCollection(input);
        expect(result.isOk).toBe(false);
        expect(typeof result.error).toBe('string');
    });

    it('caps the reported issues in the error message', () => {
        // Many invalid items → more than 5 issues; message must stay bounded.
        const collection = {
            info: {},
            item: [{}, {}, {}, {}, {}, {}, {}],
        };
        const result = validateWaveCollection(collection);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('more issue');
    });
});

describe('CURRENT_COLLECTION_SCHEMA_VERSION', () => {
    it('is 0.0.1', () => {
        expect(CURRENT_COLLECTION_SCHEMA_VERSION).toBe('0.0.1');
    });
});
