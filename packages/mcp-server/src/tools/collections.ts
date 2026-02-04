import { z } from "zod";
import { collectionService } from "@wave-client/shared";

interface SearchResult {
    score: number;
    item: {
        collection: string;
        name: string;
        method: string;
        url: string;
        path: string[];
        description?: string;
    };
}

// Schema for list_collections
export const ListCollectionsSchema = z.object({
    limit: z.number().optional().describe("Limit the number of collections returned"),
    offset: z.number().optional().describe("Offset for pagination"),
});

export type ListCollectionsArgs = z.infer<typeof ListCollectionsSchema>;

export async function listCollectionsHandler(args: ListCollectionsArgs) {
    // Load all collections using the shared service
    // Note: In a real implementation we might need to handle pagination manually 
    // if the service doesn't support it, but for now we load all.
    const allCollections = await collectionService.loadAll();

    let result = allCollections.map(c => ({
        id: c.info.waveId,
        name: c.info.name,
        filename: c.filename,
        requestCount: c.item?.length || 0, // Top-level items count
        version: c.info.version
    }));

    // Simple pagination
    if (args.offset !== undefined || args.limit !== undefined) {
        const offset = args.offset || 0;
        const limit = args.limit || result.length;
        result = result.slice(offset, offset + limit);
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(result, null, 2)
            }
        ]
    };
}

// Placeholder for other handlers
export const GetCollectionSchema = z.object({
    name: z.string().describe("The name or filename of the collection to retrieve"),
});

export type GetCollectionArgs = z.infer<typeof GetCollectionSchema>;

export async function getCollectionHandler(args: GetCollectionArgs) {
    const allCollections = await collectionService.loadAll();
    // Try to find by name, then filename, then ID
    const collection = allCollections.find(c =>
        c.info.name === args.name ||
        c.filename === args.name ||
        c.info.waveId === args.name
    );

    if (!collection) {
        throw new Error(`Collection not found: ${args.name}`);
    }

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(collection, null, 2)
            }
        ]
    };
}

export const SearchRequestsSchema = z.object({
    query: z.string().describe("Search term for request name or URL"),
    method: z.string().optional().describe("Filter by HTTP method (GET, POST, etc.)"),
});

export type SearchRequestsArgs = z.infer<typeof SearchRequestsSchema>;

export async function searchRequestsHandler(args: SearchRequestsArgs) {
    const allCollections = await collectionService.loadAll();

    // Normalize query and split into tokens
    const query = args.query.toLowerCase().trim();
    if (!query) {
        return { content: [{ type: "text", text: "[]" }] };
    }

    const tokens = query.split(/\s+/).filter(t => t.length > 0);
    const methodFilter = args.method?.toUpperCase();

    const matchedResults: SearchResult[] = [];

    // Helper to recursively search items
    function searchItems(items: any[], collectionName: string, path: string[]) {
        for (const item of items) {
            if (item.request) {
                // It's a request
                const method = item.request.method || 'GET';

                // 1. Filter by method if specified
                if (methodFilter && method !== methodFilter) {
                    continue;
                }

                // Prepare search fields
                const name = (item.name || '').toLowerCase();
                const rawUrl = typeof item.request.url === 'string'
                    ? item.request.url
                    : item.request.url?.raw || '';
                const url = rawUrl.toLowerCase();
                const description = (item.request.description || '').toLowerCase();

                // 2. Check if ALL tokens match at least one field
                // AND calculate score
                let totalScore = 0;
                let allTokensMatch = true;

                for (const token of tokens) {
                    let tokenScore = 0;

                    // Weighting strategy
                    if (name.includes(token)) {
                        tokenScore += 10;
                    }
                    if (url.includes(token)) {
                        tokenScore += 5;
                    }
                    if (item.request.method?.toLowerCase().includes(token)) {
                        tokenScore += 5;
                    }
                    if (description.includes(token)) {
                        tokenScore += 1; // Lower weight for description
                    }

                    if (tokenScore > 0) {
                        totalScore += tokenScore;
                    } else {
                        allTokensMatch = false;
                        break;
                    }
                }

                // 3. If valid match, add to results
                if (allTokensMatch) {
                    matchedResults.push({
                        score: totalScore,
                        item: {
                            collection: collectionName,
                            name: item.name,
                            method: method,
                            url: rawUrl,
                            path: path,
                            description: item.request.description
                        }
                    });
                }

            } else if (item.item) {
                // It's a folder, traverse recursively
                searchItems(item.item, collectionName, [...path, item.name]);
            }
        }
    }

    // Iterate all collections
    for (const collection of allCollections) {
        if (collection.item) {
            searchItems(collection.item, collection.info.name, []);
        }
    }

    // Sort by score descending
    matchedResults.sort((a, b) => b.score - a.score);

    // Map to simple output format
    const results = matchedResults.map(r => r.item);

    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(results, null, 2)
            }
        ]
    };
}

