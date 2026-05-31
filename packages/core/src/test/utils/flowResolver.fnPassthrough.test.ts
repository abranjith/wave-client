import { describe, expect, it } from 'vitest';
import type { HttpResponseResult } from '../../types/adapters';
import type { CollectionRequest } from '../../types/collection';
import type { FlowContext } from '../../types/flow';
import { flowContextToDynamicEnvVars } from '../../utils/flowResolver';

function makeResponse(body: string): HttpResponseResult {
    return {
        id: 'response-id',
        status: 200,
        statusText: 'OK',
        elapsedTime: 10,
        size: body.length,
        body,
        headers: {
            'content-type': 'application/json',
        },
        isEncoded: false,
    };
}

describe('flowResolver _fn_ pass-through', () => {
    it('does not convert _fn_ placeholders into flow dynamic env vars', () => {
        const flowContext: FlowContext = {
            responses: new Map([['get-user', makeResponse('{"data":{"id":"42"}}')]]),
            executionOrder: ['get-user'],
        };

        const request: CollectionRequest = {
            id: 'request-id',
            name: 'Flow request',
            method: 'GET',
            url: 'https://api.example.com/users/{{get-user.$body:$.data.id}}?trace={{_fn_random_uuid}}',
        };

        const nodeAliasMap = new Map<string, string>([['node-1', 'get-user']]);
        const allowedNodeIds = new Set(['node-1']);

        const dynamicEnvVars = flowContextToDynamicEnvVars(
            flowContext,
            allowedNodeIds,
            nodeAliasMap,
            request
        );

        expect(dynamicEnvVars['get-user.$body:$.data.id']).toBe('42');
        expect(dynamicEnvVars['_fn_random_uuid']).toBeUndefined();
    });
});
