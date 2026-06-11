import { describe, it, expect } from 'vitest';

import { httpFileTransformer } from '../../../utils/transformers/HttpFileTransformer';
import type { Collection, CollectionItem, CollectionRequest } from '../../../types/collection';

/**
 * FEAT-002: full `.http` syntax matrix per the ASP.NET Core spec —
 * separators, comments, @name directives, file variables, method-less
 * requests, URL continuation lines, body fidelity, and name uniqueness.
 */

async function parse(content: string): Promise<Collection> {
    const result = await httpFileTransformer.transformFrom(content, 'test.http');
    expect(result.isOk, `transformFrom failed: ${result.error}`).toBe(true);
    return result.value!;
}

function requestOf(item: CollectionItem): CollectionRequest {
    return item.request as CollectionRequest;
}

function rawUrl(item: CollectionItem): string {
    const url = requestOf(item).url;
    return typeof url === 'string' ? url : url.raw;
}

describe('HttpFileTransformer — block splitting (TASK-001)', () => {
    it('parses a file with no separators as a single request', async () => {
        const collection = await parse('GET https://api.example.com/users\n');
        expect(collection.item).toHaveLength(1);
        expect(requestOf(collection.item[0]).method).toBe('GET');
    });

    it('parses content before the first ### as a valid first block', async () => {
        const content = [
            'GET https://api.example.com/first',
            '',
            '### Second',
            'GET https://api.example.com/second',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item).toHaveLength(2);
        expect(collection.item[1].name).toBe('Second');
    });

    it('does not treat --- as a separator', async () => {
        const content = [
            '### One',
            'GET https://api.example.com/one',
            '',
            '---',
            '### Two',
            'GET https://api.example.com/two',
        ].join('\n');
        const collection = await parse(content);
        // `---` lands in the body of request one instead of splitting
        expect(collection.item).toHaveLength(2);
        expect((requestOf(collection.item[0]).body as { raw: string })?.raw ?? '').toContain('---');
    });

    it('ignores # and // comments between requests', async () => {
        const content = [
            '// leading file comment',
            '# another comment',
            'GET https://api.example.com/users',
            '',
            '###',
            '// comment inside block',
            'POST https://api.example.com/users',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item).toHaveLength(2);
        expect(requestOf(collection.item[1]).method).toBe('POST');
    });

    it.each([
        ['# @name listUsers'],
        ['// @name listUsers'],
        ['#@name listUsers'],
        ['# @name = listUsers'],
        ['# @name=listUsers'],
    ])('captures the @name directive variant %s', async (directive) => {
        const content = [directive, 'GET https://api.example.com/users'].join('\n');
        const collection = await parse(content);
        expect(collection.item[0].name).toBe('listUsers');
    });

    it('skips file-variable lines without error and preserves {{var}} references', async () => {
        const content = [
            '@baseUrl=https://api.example.com',
            '@token = abc123',
            '',
            'GET {{baseUrl}}/users',
            'Authorization: Bearer {{token}}',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item).toHaveLength(1);
        expect(rawUrl(collection.item[0])).toBe('{{baseUrl}}/users');
        expect(requestOf(collection.item[0]).header![0].value).toBe('Bearer {{token}}');
    });

    it('produces no request for empty blocks (separator followed by separator)', async () => {
        const content = [
            '###',
            '###',
            'GET https://api.example.com/only',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item).toHaveLength(1);
    });
});

describe('HttpFileTransformer — request line (TASK-002)', () => {
    it('defaults a method-less request line to GET', async () => {
        const collection = await parse('https://api.example.com/users\n');
        expect(requestOf(collection.item[0]).method).toBe('GET');
        expect(rawUrl(collection.item[0])).toBe('https://api.example.com/users');
    });

    it.each(['TRACE', 'CONNECT'])('accepts the %s method', async (method) => {
        const collection = await parse(`${method} https://api.example.com/x\n`);
        expect(requestOf(collection.item[0]).method).toBe(method);
    });

    it('ignores the HTTP version token', async () => {
        const collection = await parse('GET https://api.example.com/users HTTP/1.1\n');
        expect(rawUrl(collection.item[0])).toBe('https://api.example.com/users');
    });

    it('appends URL continuation lines starting with ? and &', async () => {
        const content = [
            'GET https://api.example.com/users',
            '    ?page=1',
            '    &limit=20',
            'Accept: application/json',
        ].join('\n');
        const collection = await parse(content);
        expect(rawUrl(collection.item[0])).toBe('https://api.example.com/users?page=1&limit=20');
        expect(requestOf(collection.item[0]).header).toHaveLength(1);
    });

    it('parses a URL starting with a {{variable}}', async () => {
        const collection = await parse('{{base}}/users\n');
        expect(rawUrl(collection.item[0])).toBe('{{base}}/users');
        expect(requestOf(collection.item[0]).method).toBe('GET');
    });

    it('normalizes a lowercase method to uppercase', async () => {
        const collection = await parse('post https://api.example.com/users\n');
        expect(requestOf(collection.item[0]).method).toBe('POST');
    });
});

describe('HttpFileTransformer — headers & body (TASK-003)', () => {
    it('parses headers around an interleaved comment', async () => {
        const content = [
            'GET https://api.example.com/users',
            'Accept: application/json',
            '# comment between headers',
            'Authorization: Bearer token',
        ].join('\n');
        const collection = await parse(content);
        const headers = requestOf(collection.item[0]).header!;
        expect(headers).toHaveLength(2);
        expect(headers.map(h => h.key)).toEqual(['Accept', 'Authorization']);
    });

    it('preserves # and // characters inside the body byte-for-byte', async () => {
        const body = '{\n  "note": "# not a comment",\n  "url": "https://x"\n}';
        const content = [
            'POST https://api.example.com/users',
            'Content-Type: application/json',
            '',
            body,
        ].join('\n');
        const collection = await parse(content);
        const requestBody = requestOf(collection.item[0]).body;
        expect(requestBody?.mode).toBe('raw');
        expect((requestBody as { raw: string }).raw).toBe(body);
    });

    it('preserves internal blank lines in the body', async () => {
        const content = [
            'POST https://api.example.com/text',
            'Content-Type: text/plain',
            '',
            'line one',
            '',
            'line three',
        ].join('\n');
        const collection = await parse(content);
        expect((requestOf(collection.item[0]).body as { raw: string }).raw).toBe('line one\n\nline three');
    });

    it('splits header lines on the first colon only', async () => {
        const content = [
            'GET https://api.example.com/users',
            'Referer: https://example.com/page',
        ].join('\n');
        const collection = await parse(content);
        const header = requestOf(collection.item[0]).header![0];
        expect(header.key).toBe('Referer');
        expect(header.value).toBe('https://example.com/page');
    });

    it('leaves body undefined when there is none', async () => {
        const collection = await parse('GET https://api.example.com/users\nAccept: */*\n');
        expect(requestOf(collection.item[0]).body).toBeUndefined();
    });
});

describe('HttpFileTransformer — naming & uniqueness (TASK-004)', () => {
    it('prefers @name over separator text', async () => {
        const content = [
            '### Separator Name',
            '# @name directiveName',
            'GET https://api.example.com/users',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item[0].name).toBe('directiveName');
    });

    it('prefers separator text over the URL fallback', async () => {
        const content = ['### Get All Users', 'GET https://api.example.com/users'].join('\n');
        const collection = await parse(content);
        expect(collection.item[0].name).toBe('Get All Users');
    });

    it('uses a leading comment when there is no separator text', async () => {
        const content = ['# Fetch the users', 'GET https://api.example.com/users'].join('\n');
        const collection = await parse(content);
        expect(collection.item[0].name).toBe('Fetch the users');
    });

    it('derives a name from the URL when nothing else is available', async () => {
        const collection = await parse('GET https://api.example.com/users\n');
        expect(collection.item[0].name).toBe('Get users');
    });

    it('derives a name from a variable-heavy URL', async () => {
        const collection = await parse('DELETE {{base}}/sessions\n');
        expect(collection.item[0].name).toBe('Delete sessions');
    });

    it('de-duplicates identical names with numeric suffixes', async () => {
        const content = [
            '# @name dup',
            'GET https://api.example.com/a',
            '',
            '### x',
            '# @name dup',
            'GET https://api.example.com/b',
            '',
            '### y',
            '# @name dup',
            'GET https://api.example.com/c',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item.map(i => i.name)).toEqual(['dup', 'dup 2', 'dup 3']);
    });

    it('de-duplicates across naming sources', async () => {
        const content = [
            '### same',
            'GET https://api.example.com/a',
            '',
            '###',
            '# @name same',
            'GET https://api.example.com/b',
        ].join('\n');
        const collection = await parse(content);
        expect(collection.item.map(i => i.name)).toEqual(['same', 'same 2']);
    });

    it('keeps item.name and request.name in sync for every item', async () => {
        const content = [
            '### One',
            'GET https://api.example.com/a',
            '',
            '### One',
            'GET https://api.example.com/b',
        ].join('\n');
        const collection = await parse(content);
        for (const item of collection.item) {
            expect(item.name).toBe(item.request!.name);
        }
    });
});

describe('HttpFileTransformer — detection (TASK-005)', () => {
    it('detects a method-less single-request file', () => {
        expect(httpFileTransformer.canHandle('https://api.example.com/users')).toBe(true);
    });

    it('detects a ###-separated file with bare URLs', () => {
        expect(httpFileTransformer.canHandle('### A\nhttps://api.example.com/a\n')).toBe(true);
    });

    it('rejects JSON text', () => {
        expect(httpFileTransformer.canHandle('{"info": {"name": "X"}, "item": []}')).toBe(false);
    });

    it('rejects YAML/OpenAPI text', () => {
        expect(httpFileTransformer.canHandle('openapi: 3.0.0\ninfo:\n  title: API\n')).toBe(false);
    });

    it('rejects an empty string', () => {
        expect(httpFileTransformer.canHandle('')).toBe(false);
    });

    it('rejects plain prose', () => {
        expect(httpFileTransformer.canHandle('GET up early and write some docs today.')).toBe(false);
    });

    it('rejects non-string data', () => {
        expect(httpFileTransformer.canHandle({ some: 'object' })).toBe(false);
    });
});
