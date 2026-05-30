import { describe, it, expect } from 'vitest';
import type { SearchableRequest } from '../../../components/flow/FlowRequestSearch';
import { buildRequestNodes } from '../../../components/flow/requestNodeBuilder';

function makeRequest(id: string, name: string, method = 'GET'): SearchableRequest {
    return {
        id,
        referenceId: `my-api.json:${id}`,
        name,
        method,
        url: `https://api.example.com/${id}`,
        collectionName: 'My API',
        collectionFilename: 'my-api.json',
        folderPath: [],
    };
}

describe('buildRequestNodes', () => {
    it('stacks multiple new nodes vertically from the default origin when flow is empty', () => {
        const requests = [
            makeRequest('http-1', 'Get Users', 'GET'),
            makeRequest('http-2', 'Create User', 'POST'),
        ];

        let idCounter = 0;
        const nodes = buildRequestNodes({
            existingNodes: [],
            requests,
            createNodeId: () => `node-${++idCounter}`,
        });

        expect(nodes).toHaveLength(2);
        expect(nodes[0]).toMatchObject({
            id: 'node-1',
            requestId: 'my-api.json:http-1',
            position: { x: 50, y: 50 },
        });
        expect(nodes[1]).toMatchObject({
            id: 'node-2',
            requestId: 'my-api.json:http-2',
            position: { x: 50, y: 122 },
        });
    });

    it('places inserted nodes to the right of the last existing node', () => {
        const nodes = buildRequestNodes({
            existingNodes: [
                {
                    id: 'existing-1',
                    alias: 'getUsers',
                    requestId: 'my-api.json:http-1',
                    name: 'Get Users',
                    method: 'GET',
                    position: { x: 400, y: 180 },
                },
            ],
            requests: [makeRequest('http-2', 'Create User', 'POST')],
            createNodeId: () => 'node-1',
        });

        expect(nodes[0]?.position).toEqual({ x: 700, y: 180 });
    });

    it('generates unique aliases against existing and newly-added nodes', () => {
        const nodes = buildRequestNodes({
            existingNodes: [
                {
                    id: 'existing-1',
                    alias: 'Get-Users',
                    requestId: 'my-api.json:http-1',
                    name: 'Get Users',
                    method: 'GET',
                    position: { x: 0, y: 0 },
                },
            ],
            requests: [
                makeRequest('http-2', 'Get Users', 'GET'),
                makeRequest('http-3', 'Get Users', 'GET'),
            ],
            createNodeId: () => 'node-id',
        });

        expect(nodes[0]?.alias).toBe('get-users-2');
        expect(nodes[1]?.alias).toBe('get-users-3');
    });

    it('falls back to request alias when name sanitizes to empty', () => {
        const nodes = buildRequestNodes({
            existingNodes: [],
            requests: [makeRequest('http-1', '!!!')],
            createNodeId: () => 'node-1',
        });

        expect(nodes[0]?.alias).toBe('alias');
    });

    it('generates aliases without $, ., or : characters', () => {
        const nodes = buildRequestNodes({
            existingNodes: [],
            requests: [
                makeRequest('http-1', 'Get Employee.$Details:Now'),
                makeRequest('http-2', 'Get Employee.$Details:Now'),
            ],
            createNodeId: () => 'node-id',
        });

        expect(nodes[0]?.alias).toBe('get-employee-details');
        expect(nodes[1]?.alias).toBe('get-employee-details-2');

        for (const node of nodes) {
            expect(node.alias).not.toMatch(/[$.:]/);
        }
    });
});
