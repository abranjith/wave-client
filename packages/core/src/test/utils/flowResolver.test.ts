import { describe, it, expect } from 'vitest';
import type { HttpResponseResult } from '../../types/adapters';
import type { CollectionRequest } from '../../types/collection';
import type { FlowContext } from '../../types/flow';
import { flowContextToDynamicEnvVars } from '../../utils/flowResolver';

function makeResponse(overrides: Partial<HttpResponseResult>): HttpResponseResult {
    return {
        id: 'response-id',
        status: 200,
        statusText: 'OK',
        elapsedTime: 12,
        size: 128,
        body: '{}',
        headers: {
            'content-type': 'application/json',
        },
        isEncoded: false,
        ...overrides,
    };
}

function makeRequestWithVariable(variable: string): CollectionRequest {
    return {
        id: 'request-id',
        name: 'Resolve Request',
        method: 'GET',
        url: `https://api.example.com/users/{{${variable}}}`,
    };
}

const NODE_ALIAS_MAP = new Map<string, string>([
    ['node-1', 'get-users'],
    ['node-2', 'get-employee'],
    ['node-3', 'blocked-alias'],
]);

const BASE_FLOW_CONTEXT: FlowContext = {
    responses: new Map<string, HttpResponseResult>([
        ['get-users', makeResponse({
            body: JSON.stringify({
                data: { id: 'user-1' },
                users: [
                    { id: 1, active: false },
                    { id: 2, active: true },
                ],
                items: [
                    { id: 'users-item-1' },
                    { id: 'users-item-2' },
                ],
            }),
            headers: {
                'Content-Type': 'application/json',
                'x-trace-id': 'users-trace',
            },
            status: 201,
            statusText: 'Created',
        })],
        ['get-employee', makeResponse({
            body: JSON.stringify({
                data: { id: 'employee-2' },
                users: [
                    { id: 10, active: true },
                    { id: 11, active: false },
                    { id: 12, active: true },
                ],
                items: [
                    { id: 'emp-item-1' },
                    { id: 'emp-item-2' },
                    { id: 'emp-item-3' },
                ],
            }),
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'x-trace-id': 'employee-trace',
            },
            status: 202,
            statusText: 'Accepted',
        })],
        ['blocked-alias', makeResponse({
            body: JSON.stringify({ data: { id: 'blocked-3' } }),
            status: 203,
            statusText: 'Non-Authoritative Information',
        })],
    ]),
    executionOrder: ['get-users', 'get-employee', 'blocked-alias'],
};

function resolveVariable(
    variable: string,
    options?: {
        flowContext?: FlowContext;
        allowedNodeIds?: Set<string>;
        nodeAliasMap?: Map<string, string>;
    },
): Record<string, string> {
    return flowContextToDynamicEnvVars(
        options?.flowContext ?? BASE_FLOW_CONTEXT,
        options?.allowedNodeIds ?? new Set(['node-1', 'node-2']),
        options?.nodeAliasMap ?? NODE_ALIAS_MAP,
        makeRequestWithVariable(variable),
    );
}

describe('flowContextToDynamicEnvVars', () => {
    it('resolves alias + JSONPath body references', () => {
        const result = resolveVariable('get-employee.$body:$.data.id');

        expect(result['get-employee.$body:$.data.id']).toBe('employee-2');
    });

    it('supports JSONPath filter expressions', () => {
        const result = resolveVariable('get-employee.$body:$.users[?(@.active)].id');

        expect(result['get-employee.$body:$.users[?(@.active)].id']).toBe('10');
    });

    it('supports recursive descent', () => {
        const result = resolveVariable('get-employee.$body:$..id');

        expect(result['get-employee.$body:$..id']).toBe('employee-2');
    });

    it('supports array slice expressions', () => {
        const result = resolveVariable('get-employee.$body:$.items[0:2]');

        expect(result['get-employee.$body:$.items[0:2]']).toBe('{"id":"emp-item-1"}');
    });

    it('resolves headers case-insensitively', () => {
        const result = resolveVariable('get-employee.$headers:content-type');

        expect(result['get-employee.$headers:content-type']).toBe('application/json; charset=utf-8');
    });

    it('resolves status and statusText sections', () => {
        const status = resolveVariable('get-employee.$status');
        const statusText = resolveVariable('get-employee.$statusText');

        expect(status['get-employee.$status']).toBe('202');
        expect(statusText['get-employee.$statusText']).toBe('Accepted');
    });

    it('resolves no-alias body references using the most recent allowed alias', () => {
        const result = resolveVariable('$body:$.data.id');

        expect(result['$body:$.data.id']).toBe('employee-2');
    });

    it('resolves shorthand JSONPath references', () => {
        const result = resolveVariable('$.data.id');

        expect(result['$.data.id']).toBe('employee-2');
    });

    it('does not resolve variables that reference disallowed aliases', () => {
        const variable = 'blocked-alias.$body:$.data.id';
        const result = resolveVariable(variable, {
            allowedNodeIds: new Set(['node-1', 'node-2']),
        });

        expect(Object.prototype.hasOwnProperty.call(result, variable)).toBe(false);
    });

    it('handles non-JSON response bodies: empty subpath resolves raw body, JSONPath subpath stays unresolved', () => {
        const plainTextContext: FlowContext = {
            responses: new Map([
                ['plain-text', makeResponse({
                    body: 'not-json-body',
                    headers: { 'content-type': 'text/plain' },
                })],
            ]),
            executionOrder: ['plain-text'],
        };

        const plainAliasMap = new Map<string, string>([['text-node', 'plain-text']]);
        const allowedTextNode = new Set(['text-node']);

        const wholeBody = resolveVariable('plain-text.$body', {
            flowContext: plainTextContext,
            allowedNodeIds: allowedTextNode,
            nodeAliasMap: plainAliasMap,
        });
        const jsonPathBody = resolveVariable('plain-text.$body:$.data.id', {
            flowContext: plainTextContext,
            allowedNodeIds: allowedTextNode,
            nodeAliasMap: plainAliasMap,
        });

        expect(wholeBody['plain-text.$body']).toBe('not-json-body');
        expect(Object.prototype.hasOwnProperty.call(jsonPathBody, 'plain-text.$body:$.data.id')).toBe(false);
    });

    it('does not resolve legacy dot-form body references', () => {
        const variable = 'get-employee.$body.data.id';
        const result = resolveVariable(variable);

        expect(Object.prototype.hasOwnProperty.call(result, variable)).toBe(false);
    });
});
