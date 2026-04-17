import * as path from 'path';

import { BaseStorageService } from './BaseStorageService';
import { generateUniqueId } from '@wave-client/core';
import {
    isSseRequest,
    isWsRequest,
} from '../types';
import type { Collection, CollectionItem, AnyCollectionRequest } from '../types';

// ============================================================================
// Protocol-Aware Request Normalization
// ============================================================================

/**
 * Normalizes a persisted request payload to a protocol-safe shape.
 *
 * Rules applied on load:
 * - Missing `protocol` → defaults to `'http'` (backward compatibility).
 * - `protocol: 'ws'` → strips HTTP-only fields (`method`, `body`, `validation`).
 * - `protocol: 'sse'` → strips `validation`; defaults `method` to `'GET'` when absent.
 * - `protocol: 'http'` → defaults `method` to `'GET'` when absent.
 *
 * @param request - The raw request payload from the JSON file.
 * @returns The normalized request, safe for the declared protocol.
 */
export function normalizeRequestOnLoad(request: Record<string, unknown>): AnyCollectionRequest {
    const protocol = (request.protocol as string | undefined) ?? 'http';

    // Shared fields present on every protocol
    const base = {
        id: request.id as string,
        name: request.name as string,
        url: request.url,
        header: request.header,
        query: request.query,
        description: request.description,
        authId: request.authId,
        sourceRef: request.sourceRef,
    };

    if (protocol === 'ws') {
        // WS: no method, body, or validation
        return {
            ...base,
            protocol: 'ws',
        } as AnyCollectionRequest;
    }

    if (protocol === 'sse') {
        // SSE: has method and optional body; no validation
        return {
            ...base,
            protocol: 'sse',
            method: (request.method as string) || 'GET',
            body: request.body,
        } as AnyCollectionRequest;
    }

    // HTTP (explicit or legacy missing protocol)
    return {
        ...base,
        protocol: 'http',
        method: (request.method as string) || 'GET',
        body: request.body,
        validation: request.validation,
    } as AnyCollectionRequest;
}

/**
 * Sanitizes a request payload for persistence, stripping runtime-only fields
 * and fields invalid for the declared protocol.
 *
 * Rules applied on save:
 * - `protocol: 'ws'` → strips `method`, `body`, `validation`.
 * - `protocol: 'sse'` → strips `validation`.
 * - `protocol: 'http'` → keeps all fields; omits `protocol` if it would add
 *   noise to legacy-compatible payloads (optional, kept explicit here).
 * - `sourceRef` is always stripped — it is runtime-only metadata that is
 *   recomputed on load from the item's position in the tree.
 *
 * @param request - The in-memory request being persisted.
 * @returns A cleaned request safe for JSON serialization.
 */
export function sanitizeRequestForSave(request: AnyCollectionRequest): AnyCollectionRequest {
    const protocol = (request.protocol as string | undefined) ?? 'http';

    // Shared persistent fields
    const base: Record<string, unknown> = {
        id: request.id,
        name: request.name,
        url: request.url,
    };
    if (request.header && (request.header as unknown[]).length > 0) base.header = request.header;
    if (request.query && (request.query as unknown[]).length > 0) base.query = request.query;
    if (request.description) base.description = request.description;
    if (request.authId) base.authId = request.authId;
    // sourceRef is runtime-only — never persisted

    if (isWsRequest(request) || protocol === 'ws') {
        return { ...base, protocol: 'ws' } as AnyCollectionRequest;
    }

    if (isSseRequest(request) || protocol === 'sse') {
        return {
            ...base,
            protocol: 'sse',
            method: ('method' in request && typeof request.method === 'string' ? request.method : 'GET'),
            ...('body' in request && request.body ? { body: request.body } : {}),
        } as AnyCollectionRequest;
    }

    // HTTP
    return {
        ...base,
        protocol: 'http',
        method: ('method' in request && typeof request.method === 'string' ? request.method : 'GET'),
        ...('body' in request && request.body ? { body: request.body } : {}),
        ...('validation' in request && request.validation ? { validation: request.validation } : {}),
    } as AnyCollectionRequest;
}

/**
 * Recursively normalizes all request payloads in a `CollectionItem` tree.
 * Applied after loading from disk.
 */
function normalizeItemRequests(item: CollectionItem): CollectionItem {
    if (item.request) {
        item.request = normalizeRequestOnLoad(item.request as unknown as Record<string, unknown>);
    }
    if (item.item) {
        item.item = item.item.map(normalizeItemRequests);
    }
    return item;
}

// ============================================================================
// Item ID Helpers
// ============================================================================

/**
 * Ensures all items in a collection have unique IDs
 * Recursively processes nested items (folders)
 */
function ensureItemIds(item: CollectionItem): CollectionItem {
    if (!item.id) {
        item.id = generateUniqueId();
    }
    if (item.item) {
        item.item = item.item.map(ensureItemIds);
    }
    return item;
}

/**
 * Ensures all items in a collection item array have IDs and
 * normalizes request payloads for protocol safety.
 */
function ensureCollectionItemIds(items: CollectionItem[]): CollectionItem[] {
    return items.map(item => normalizeItemRequests(ensureItemIds(item)));
}

/**
 * Recursively removes the item matching `itemId` from the folder indicated by
 * `itemPath`. Returns an immutably updated items array.
 *
 * @param items - Current-level items
 * @param itemPath - Ordered folder names from this level to the item's parent
 * @param itemId - The `id` of the item to remove
 */
function removeItemFromTree(items: CollectionItem[], itemPath: string[], itemId: string): CollectionItem[] {
    if (itemPath.length === 0) {
        return items.filter(i => i.id !== itemId);
    }
    const [nextFolder, ...remainingPath] = itemPath;
    return items.map(item => {
        if (item.name === nextFolder && item.item) {
            return { ...item, item: removeItemFromTree(item.item, remainingPath, itemId) };
        }
        return item;
    });
}

/**
 * Service for managing collections (groups of API requests).
 */
export class CollectionService extends BaseStorageService {
    private readonly subDir = 'collections';
    private readonly waveVersion = '0.0.1';

    /**
     * Gets the collections directory path using current settings.
     */
    private async getCollectionsDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    /**
     * Loads all collections from the collections directory.
     * @returns Array of collections with their filenames
     */
    async loadAll(): Promise<(Collection & { filename: string })[]> {
        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        const collections: (Collection & { filename: string })[] = [];
        const files = this.listJsonFiles(collectionsDir);

        for (const file of files) {
            const collection = await this.loadOne(file);
            if (collection) {
                collections.push({
                    ...collection,
                    filename: file
                });
            }
        }

        return collections;
    }

    /**
     * Loads a single collection by filename.
     * @param fileName The collection filename
     * @returns The collection or null if not found
     */
    async loadOne(fileName: string): Promise<Collection | null> {
        const collectionsDir = await this.getCollectionsDir();
        const filePath = path.join(collectionsDir, fileName);

        if (!this.fileExists(filePath)) {
            return null;
        }

        const collection = await this.readJsonFileSecure<Collection | null>(filePath, null);
        
        if (collection) {
            // Ensure all items have IDs
            collection.item = ensureCollectionItemIds(collection.item);
            if (!collection.info.waveId) {
                collection.info.waveId = generateUniqueId();
            }
            if (!collection.info.version) {
                collection.info.version = this.waveVersion;
            }
        }
        
        return collection;
    }

    /**
     * Saves a collection to the collections directory.
     * @param collection The collection to save
     * @param fileName The filename to save as
     * @returns The saved collection
     */
    async save(collection: Collection, fileName: string): Promise<Collection> {
        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        const filePath = path.join(collectionsDir, fileName);
        await this.writeJsonFileSecure(filePath, collection);
        return collection;
    }

    /**
     * Saves a collection from JSON string content.
     * @param fileContent The JSON content of the collection
     * @param fileName The filename to save as
     * @returns The saved collection
     */
    async saveFromContent(fileContent: string, fileName: string): Promise<Collection> {
        const collection = JSON.parse(fileContent) as Collection;
        return this.save(collection, fileName);
    }

    /**
     * Saves or updates a request in a collection file under the specified folder path.
     * @param requestContent The JSON content of the request to save
     * @param requestName The name of the request
     * @param collectionFileName The collection file to save to
     * @param folderPath The folder path within the collection to save the request under
     * @param newCollectionName Optional name for a new collection if creating new
     * @returns The filename of the collection that was saved to
     */
    async saveRequest(
        requestContent: string,
        requestName: string,
        collectionFileName: string,
        folderPath: string[],
        newCollectionName?: string
    ): Promise<string> {
        let collection: Collection | null = null;
        let finalCollectionFileName = collectionFileName;

        if (newCollectionName) {
            // Create a new collection
            finalCollectionFileName = await this.generateUniqueFileName(newCollectionName);
            collection = this.createNewCollection(newCollectionName);
        } else if (collectionFileName) {
            // Load existing collection
            collection = await this.loadOne(collectionFileName);
        }

        if (!collection) {
            throw new Error(`Collection file ${collectionFileName} does not exist and no new collection name provided.`);
        }

        // Parse the request JSON — accepts any protocol (HTTP, WS, SSE)
        const rawRequest = JSON.parse(requestContent) as AnyCollectionRequest;
        const request = sanitizeRequestForSave(rawRequest);

        // Navigate to the correct folder, creating it if necessary
        let items = collection.item;
        for (const folderName of folderPath) {
            let folder = items.find((i: CollectionItem) => i.name === folderName && i.item);
            if (!folder) {
                // Create the folder if it doesn't exist
                folder = {
                    id: generateUniqueId(),
                    name: folderName,
                    item: []
                };
                items.push(folder);
            }
            items = folder.item!;
        }

        // Check if a request with the same name exists in the target folder
        const existingRequestIndex = items.findIndex((i: CollectionItem) => i.name === requestName && i.request);
        if (existingRequestIndex !== -1) {
            // Overwrite existing request
            items[existingRequestIndex].request = request;
        } else {
            // Add new request
            items.push({
                id: generateUniqueId(),
                name: requestName,
                request: request
            });
        }

        // Save the updated collection
        await this.save(collection, finalCollectionFileName);

        return finalCollectionFileName;
    }

    /**
     * Deletes a collection file.
     * @param fileName The filename of the collection to delete
     */
    async delete(fileName: string): Promise<void> {
        const collectionsDir = await this.getCollectionsDir();
        const filePath = path.join(collectionsDir, fileName);
        this.deleteFile(filePath);
    }

    /**
     * Deletes a nested item (folder or request) from within a collection and
     * returns the updated collection.
     *
     * Navigates the tree using `itemPath` to locate the parent folder, then
     * removes the child whose `id` matches `itemId`. The updated collection is
     * persisted to disk before being returned.
     *
     * @param fileName - The collection filename
     * @param itemPath - Ordered folder names from collection root to the item's parent
     * @param itemId - The `id` of the item to remove
     * @returns The updated collection with the item removed
     */
    async deleteItem(fileName: string, itemPath: string[], itemId: string): Promise<Collection & { filename: string }> {
        const collection = await this.loadOne(fileName);
        if (!collection) {
            throw new Error(`Collection not found: ${fileName}`);
        }

        const updatedItems = removeItemFromTree(collection.item, itemPath, itemId);
        const updatedCollection = { ...collection, item: updatedItems };
        await this.save(updatedCollection, fileName);
        return { ...updatedCollection, filename: fileName };
    }

    /**
     * Imports a collection from file content.
     * @param fileName The filename to save as
     * @param fileContent The JSON content of the collection (Wave format)
     * @returns The imported collection with filename
     */
    async import(fileName: string, fileContent: string): Promise<Collection & { filename: string }> {
        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        // Parse as JSON - expecting Wave format
        let collection: Collection;
        try {
            collection = JSON.parse(fileContent) as Collection;
        } catch {
            throw new Error('Failed to parse collection JSON. Please ensure the file is valid Wave JSON format.');
        }
        
        // Ensure collection has required fields
        if (!collection.info) {
            throw new Error('Invalid collection format: missing info section.');
        }
        if (!collection.info.waveId) {
            collection.info.waveId = generateUniqueId();
        }
        if (!collection.info.version) {
            collection.info.version = this.waveVersion;
        }
        if (!collection.item) {
            collection.item = [];
        }
        
        // Ensure all items have IDs and normalize request payloads
        collection.item = collection.item.map((item: CollectionItem) => normalizeItemRequests(ensureItemIds(item)));

        // Generate a JSON filename for saving
        const jsonFileName = fileName.replace(/\.[^.]*$/, '.json');
        
        const filePath = path.join(collectionsDir, jsonFileName);
        await this.writeJsonFileSecure(filePath, collection);

        return { ...collection, filename: jsonFileName };
    }

    /**
     * Exports a collection to Wave JSON format.
     * @param collection The collection to export
     * @returns Object containing the exported content as a string and suggested filename
     */
    async export(collection: Collection): Promise<{ content: string; suggestedFilename: string }> {
        // Generate suggested filename
        const baseName = collection.info.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const suggestedFilename = `${baseName}.json`;
        
        return {
            content: JSON.stringify(collection, null, 2),
            suggestedFilename
        };
    }

    /**
     * Creates a new empty collection with the given name.
     * @param name The name of the collection
     * @returns A new Collection object
     */
    private createNewCollection(name: string): Collection {
        return {
            info: {
                waveId: generateUniqueId(),
                version: this.waveVersion,
                name: name || 'New Collection'
            },
            item: []
        };
    }

    /**
     * Generates a unique filename for a collection.
     * @param collectionName The desired collection name
     * @returns A unique filename
     */
    private async generateUniqueFileName(collectionName: string): Promise<string> {
        const collectionsDir = await this.getCollectionsDir();
        let baseFileName = collectionName || 'New Collection';
        baseFileName = baseFileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        let fileName = `${baseFileName}.json`;
        let counter = 1;
        
        while (this.fileExists(path.join(collectionsDir, fileName))) {
            fileName = `${baseFileName}_${counter}.json`;
            counter++;
            // Limit to 100 to prevent infinite loops
            if (counter > 100) {
                throw new Error('Unable to generate unique collection filename, please provide a unique name.');
            }
        }
        
        return fileName;
    }
}

// Export singleton instance for convenience
export const collectionService = new CollectionService();
