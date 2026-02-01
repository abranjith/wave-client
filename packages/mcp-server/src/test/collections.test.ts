import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCollectionsHandler, getCollectionHandler, searchRequestsHandler } from '../tools/collections';
// Mock needs to be hoisted, but with vi.mock it works automatically for external modules usually.
// However, since we import the singleton instance, we need to spy on it or mock the module.

// Mocking the entire shared module
const mockLoadAllCollections = vi.fn();

vi.mock('@wave-client/shared', () => ({
    collectionService: {
        loadAll: () => mockLoadAllCollections()
    }
}));

describe('Collection Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockCollections = [
        {
            filename: 'col1.json',
            info: { waveId: 'col1', name: 'Collection One', version: '1.0' },
            item: [
                {
                    name: 'Request 1',
                    request: { method: 'GET', url: 'http://example.com/1', description: 'desc 1' }
                }
            ]
        },
        {
            filename: 'col2.json',
            info: { waveId: 'col2', name: 'Collection Two', version: '1.0' },
            item: [
                {
                    name: 'Folder',
                    item: [
                        {
                            name: 'Request 2',
                            request: { method: 'POST', url: 'http://example.com/2', description: 'desc 2' }
                        }
                    ]
                }
            ]
        }
    ];

    describe('list_collections', () => {
        it('should list all collections', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            const result = await listCollectionsHandler({});
            const content = JSON.parse(result.content[0].text);

            expect(mockLoadAllCollections).toHaveBeenCalled();
            expect(content).toHaveLength(2);
            expect(content[0].name).toBe('Collection One');
            expect(content[1].name).toBe('Collection Two');
        });

        it('should handle pagination', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            const result = await listCollectionsHandler({ limit: 1, offset: 1 });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].name).toBe('Collection Two');
        });
    });

    describe('get_collection', () => {
        it('should return a collection by name', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            const result = await getCollectionHandler({ name: 'Collection One' });
            const content = JSON.parse(result.content[0].text);

            expect(content.info.name).toBe('Collection One');
        });

        it('should return a collection by ID', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            const result = await getCollectionHandler({ name: 'col2' });
            const content = JSON.parse(result.content[0].text);

            expect(content.info.name).toBe('Collection Two');
        });

        it('should throw error if not found', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            await expect(getCollectionHandler({ name: 'NonExistent' }))
                .rejects.toThrow('Collection not found');
        });
    });

    describe('search_requests', () => {
        it('should find requests by name', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            const result = await searchRequestsHandler({ query: 'Request 1' });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].name).toBe('Request 1');
        });

        it('should find requests in nested folders', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            const result = await searchRequestsHandler({ query: 'Request 2' });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].name).toBe('Request 2');
        });

        it('should filter by method', async () => {
            mockLoadAllCollections.mockResolvedValue(mockCollections);

            // "example" matches both URLs
            const result = await searchRequestsHandler({ query: 'example', method: 'POST' });
            const content = JSON.parse(result.content[0].text);

            expect(content).toHaveLength(1);
            expect(content[0].name).toBe('Request 2'); // Only the POST one
        });

        it('should return empty list for empty query', async () => {
            const result = await searchRequestsHandler({ query: '   ' });
            const content = JSON.parse(result.content[0].text);
            expect(content).toEqual([]);
        });
    });
});
