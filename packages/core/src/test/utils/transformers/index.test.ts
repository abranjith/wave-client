import { describe, it, expect } from 'vitest';
import { detectFormatFromContent } from '../../../utils/transformers';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const swaggerJson = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {},
});

const swagger2Json = JSON.stringify({
    swagger: '2.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {},
    host: 'example.com',
});

const postmanJson = JSON.stringify({
    info: {
        _postman_id: 'abc-123',
        name: 'My API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [],
});

const postmanNoIdJson = JSON.stringify({
    info: {
        name: 'My API',
        schema: 'https://schema.postman.com/collection.json',
    },
    item: [],
});

const waveJson = JSON.stringify({
    info: { waveId: 'wave-123', name: 'My Wave Collection', version: '0.0.1' },
    item: [],
});

const openapiYaml = `openapi: 3.0.0
info:
  title: My API
  version: "1.0.0"
paths: {}
`;

const swaggerYaml = `swagger: "2.0"
info:
  title: My API
  version: "1.0.0"
host: example.com
paths: {}
`;

const httpFileText = `### Get Users
GET https://example.com/api/users
Authorization: Bearer token123

`;

// ---------------------------------------------------------------------------
// detectFormatFromContent
// ---------------------------------------------------------------------------

describe('detectFormatFromContent', () => {
    describe('empty / whitespace inputs', () => {
        it('returns undefined for empty string', () => {
            expect(detectFormatFromContent('')).toBeUndefined();
        });

        it('returns undefined for whitespace-only string', () => {
            expect(detectFormatFromContent('   \n\t  ')).toBeUndefined();
        });
    });

    describe('JSON — swagger/OpenAPI', () => {
        it('detects OpenAPI 3.x JSON as swagger', () => {
            expect(detectFormatFromContent(swaggerJson)).toBe('swagger');
        });

        it('detects Swagger 2.0 JSON as swagger', () => {
            expect(detectFormatFromContent(swagger2Json)).toBe('swagger');
        });
    });

    describe('JSON — Postman', () => {
        it('detects Postman collection JSON with _postman_id as postman', () => {
            expect(detectFormatFromContent(postmanJson)).toBe('postman');
        });

        it('detects Postman collection JSON with postman schema URL as postman', () => {
            expect(detectFormatFromContent(postmanNoIdJson)).toBe('postman');
        });
    });

    describe('JSON — Wave', () => {
        it('detects Wave collection JSON as wave', () => {
            expect(detectFormatFromContent(waveJson)).toBe('wave');
        });
    });

    describe('JSON — inconclusive', () => {
        it('returns undefined for arbitrary JSON object that no transformer claims', () => {
            expect(detectFormatFromContent('{"a":1}')).toBeUndefined();
        });

        it('returns undefined for JSON array', () => {
            expect(detectFormatFromContent('[1,2,3]')).toBeUndefined();
        });

        it('returns undefined for JSON number', () => {
            expect(detectFormatFromContent('42')).toBeUndefined();
        });

        it('returns undefined for JSON string', () => {
            expect(detectFormatFromContent('"hello"')).toBeUndefined();
        });
    });

    describe('YAML — OpenAPI heuristic', () => {
        it('detects OpenAPI YAML with "openapi:" key as swagger', () => {
            expect(detectFormatFromContent(openapiYaml)).toBe('swagger');
        });

        it('detects Swagger YAML with "swagger:" key as swagger', () => {
            expect(detectFormatFromContent(swaggerYaml)).toBe('swagger');
        });

        it('detects openapi key with leading whitespace as swagger', () => {
            const yaml = '  openapi: 3.0.0\ninfo:\n  title: API\n';
            expect(detectFormatFromContent(yaml)).toBe('swagger');
        });

        it('does not false-positive on prose that mentions openapi in a sentence', () => {
            // The regex requires the key to appear at line start (with optional whitespace)
            // and be followed by ':', so "my openapi thing" won't match
            const prose = 'This is about openapi and swagger\nno colon key here\n';
            // This prose has no "openapi:" key so result should not be 'swagger'
            // (could be undefined or http depending on other heuristics)
            const result = detectFormatFromContent(prose);
            expect(result).not.toBe('swagger');
        });
    });

    describe('HTTP file heuristic', () => {
        it('detects .http file content as http', () => {
            expect(detectFormatFromContent(httpFileText)).toBe('http');
        });

        it('detects minimal HTTP request as http', () => {
            const minimal = '### My Request\nGET https://example.com\n';
            expect(detectFormatFromContent(minimal)).toBe('http');
        });
    });

    describe('inconclusive text', () => {
        it('returns undefined for random prose', () => {
            expect(detectFormatFromContent('Hello, world! This is not any known format.')).toBeUndefined();
        });

        it('returns undefined for invalid JSON text', () => {
            expect(detectFormatFromContent('{invalid json')).toBeUndefined();
        });
    });

    describe('registry priority — swagger wins over postman when both markers present', () => {
        it('resolves to swagger when both openapi and postman markers are present', () => {
            // A contrived doc that has both swagger-like and postman-like markers.
            // The registry checks swaggerTransformer first, so it should win.
            const ambiguous = JSON.stringify({
                openapi: '3.0.0',
                info: {
                    _postman_id: 'abc',
                    title: 'Ambiguous',
                    version: '1',
                    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
                },
                paths: {},
                item: [],
            });
            // swaggerTransformer's canHandle checks for openapi/swagger field first
            expect(detectFormatFromContent(ambiguous)).toBe('swagger');
        });
    });
});
