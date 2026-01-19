/**
 * Collection Lookup Utilities
 * 
 * Shared functions for finding requests and items within collections.
 * Extracts duplicate lookup logic from useFlowRunner and useTestSuiteRunner.
 */

import type { Collection, CollectionItem } from '../types/collection';
import type { Flow } from '../types/flow';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of finding a request in collections
 */
export interface RequestLookupResult {
    /** The found collection item */
    item: CollectionItem;
    /** The collection containing the item */
    collection: Collection;
}

// ============================================================================
// Collection Request Lookup
// ============================================================================

/**
 * Finds a collection request by reference ID
 * 
 * Reference ID format: "collectionFilename:requestId" or just "requestId"
 * When no collection prefix is provided, searches all collections.
 * 
 * @param referenceId - The reference ID to find
 * @param collections - Available collections to search
 * @returns The found item and collection, or null if not found
 */
export function findRequestById(
    referenceId: string,
    collections: Collection[]
): RequestLookupResult | null {
    let collectionFilename: string | undefined;
    let itemId: string;
    
    // Parse reference ID - may include collection prefix
    if (referenceId.includes(':')) {
        [collectionFilename, itemId] = referenceId.split(':', 2);
    } else {
        itemId = referenceId;
    }
    
    // Recursive search function for nested items
    const findInItems = (items: CollectionItem[]): CollectionItem | null => {
        for (const item of items) {
            if (item.id === itemId) {
                return item;
            }
            // Search nested items (folders)
            if (item.item) {
                const found = findInItems(item.item);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    };
    
    // Determine which collections to search
    const collectionsToSearch = collectionFilename
        ? collections.filter(c => c.filename === collectionFilename)
        : collections;
    
    // Search in collections
    for (const collection of collectionsToSearch) {
        const found = findInItems(collection.item);
        if (found) {
            return { item: found, collection };
        }
    }
    
    return null;
}

// ============================================================================
// Flow Lookup
// ============================================================================

/**
 * Finds a flow by ID
 * 
 * @param flowId - The flow ID to find
 * @param flows - Available flows to search
 * @returns The found flow, or null if not found
 */
export function findFlowById(
    flowId: string,
    flows: Flow[]
): Flow | null {
    return flows.find(f => f.id === flowId) || null;
}

// ============================================================================
// Collection Item Utilities
// ============================================================================

/**
 * Gets all request items from a collection (flattened, excluding folders)
 * 
 * @param collection - The collection to extract requests from
 * @returns Array of collection items that have requests
 */
export function getAllRequestsFromCollection(
    collection: Collection
): CollectionItem[] {
    const requests: CollectionItem[] = [];
    
    const collectRequests = (items: CollectionItem[]): void => {
        for (const item of items) {
            if (item.request) {
                requests.push(item);
            }
            if (item.item) {
                collectRequests(item.item);
            }
        }
    };
    
    collectRequests(collection.item);
    return requests;
}

/**
 * Builds the folder path for a collection item
 * 
 * @param item - The item to find
 * @param collection - The collection containing the item
 * @returns Array of folder names leading to the item
 */
export function getItemFolderPath(
    itemId: string,
    collection: Collection
): string[] {
    const path: string[] = [];
    
    const findPath = (items: CollectionItem[], currentPath: string[]): boolean => {
        for (const item of items) {
            if (item.id === itemId) {
                path.push(...currentPath);
                return true;
            }
            if (item.item) {
                const newPath = item.request ? currentPath : [...currentPath, item.name];
                if (findPath(item.item, newPath)) {
                    return true;
                }
            }
        }
        return false;
    };
    
    findPath(collection.item, []);
    return path;
}
