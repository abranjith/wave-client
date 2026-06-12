import * as path from 'path';

import { BaseStorageService } from './BaseStorageService';
import {
    generateUniqueId,
    CURRENT_COLLECTION_SCHEMA_VERSION,
    validateWaveCollection,
    validateCollectionTree,
    addItemAtPath,
    isDescendantPath,
    type MoveCollectionItemResult,
} from '@wave-client/core';
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
    if (request.header && (request.header as unknown[]).length > 0) {base.header = request.header;}
    if (request.query && (request.query as unknown[]).length > 0) {base.query = request.query;}
    if (request.description) {base.description = request.description;}
    if (request.authId) {base.authId = request.authId;}
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
 *
 * Besides protocol normalization, legacy requests missing `id`/`name` are
 * stamped here (fresh id; name inherited from the wrapping item) so that
 * normalized collections always satisfy the Wave collection schema.
 */
function normalizeItemRequests(item: CollectionItem): CollectionItem {
    if (item.request) {
        const normalized = normalizeRequestOnLoad(item.request as unknown as Record<string, unknown>);
        if (!normalized.id) {
            normalized.id = generateUniqueId();
        }
        if (!normalized.name) {
            normalized.name = item.name;
        }
        item.request = normalized;
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
 * Navigates the item tree along `folderPath` and returns the items array at
 * that level, or `null` when any segment of the path is missing or not a folder.
 * An empty path returns the root-level items array.
 */
function findFolderAtPath(items: CollectionItem[], folderPath: string[]): CollectionItem[] | null {
    if (folderPath.length === 0) return items;
    const [head, ...rest] = folderPath;
    const folder = items.find(i => i.name === head && i.item !== undefined);
    if (!folder || !folder.item) return null;
    return findFolderAtPath(folder.item, rest);
}

/**
 * Service for managing collections (groups of API requests).
 */
export class CollectionService extends BaseStorageService {
    private readonly subDir = 'collections';

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
     *
     * The raw file is normalized first (item ids ensured, `waveId`/`version`
     * stamped when absent) and then validated against the Wave collection
     * schema. Structurally invalid files are skipped: the failure is logged
     * with context and `null` is returned so `loadAll` can continue with the
     * remaining collections.
     *
     * @param fileName The collection filename
     * @returns The collection, or null if not found or invalid
     */
    async loadOne(fileName: string): Promise<Collection | null> {
        const collectionsDir = await this.getCollectionsDir();
        const filePath = path.join(collectionsDir, fileName);

        if (!this.fileExists(filePath)) {
            return null;
        }

        const collection = await this.readJsonFileSecure<Collection | null>(filePath, null);

        if (collection) {
            // Normalize before validating so legacy files pass the schema.
            // Guard the array: structurally broken files fall through to validation.
            if (Array.isArray(collection.item)) {
                collection.item = ensureCollectionItemIds(collection.item);
            }
            if (!collection.info?.waveId) {
                collection.info = { ...(collection.info ?? { name: '' }), waveId: generateUniqueId() };
            }
            if (!collection.info.version) {
                collection.info.version = CURRENT_COLLECTION_SCHEMA_VERSION;
            }

            const validation = validateWaveCollection(collection);
            if (!validation.isOk) {
                console.error(
                    `[CollectionService] loadOne: invalid collection file "${fileName}" (waveId: ${collection.info.waveId}): ${validation.error}`
                );
                return null;
            }
        }

        return collection;
    }

    /**
     * Saves a collection to the collections directory.
     *
     * Tree integrity is validated before writing (non-empty names, ids on
     * every item, case-insensitive sibling-level name uniqueness); violations
     * throw a descriptive error and nothing is persisted.
     *
     * @param collection The collection to save
     * @param fileName The filename to save as
     * @returns The saved collection
     * @throws Error when the collection tree fails integrity validation
     */
    async save(collection: Collection, fileName: string): Promise<Collection> {
        const treeValidation = validateCollectionTree(collection);
        if (!treeValidation.isOk) {
            console.error(
                `[CollectionService] save: rejected collection "${fileName}" (waveId: ${collection.info?.waveId ?? 'unknown'}): ${treeValidation.error}`
            );
            throw new Error(treeValidation.error);
        }

        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        const filePath = path.join(collectionsDir, fileName);
        await this.writeJsonFileSecure(filePath, collection);
        return collection;
    }

    /**
     * Saves a collection from JSON string content.
     *
     * Import boundary: the content is parsed, normalized (ids/waveId/version
     * stamped), and validated against the Wave collection schema **before**
     * anything is written. Invalid input throws a descriptive error and
     * persists nothing.
     *
     * @param fileContent The JSON content of the collection
     * @param fileName The filename to save as
     * @returns The saved collection
     * @throws Error when the content is not valid JSON or fails schema validation
     */
    async saveFromContent(fileContent: string, fileName: string): Promise<Collection> {
        let collection: Collection;
        try {
            collection = JSON.parse(fileContent) as Collection;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown parse error';
            throw new Error(`Invalid JSON: ${message}`);
        }

        // Normalize before validating so legacy payloads pass the schema.
        if (collection && typeof collection === 'object') {
            collection.item = Array.isArray(collection.item)
                ? ensureCollectionItemIds(collection.item)
                : collection.item ?? [];
            if (!collection.info?.waveId) {
                collection.info = { ...(collection.info ?? { name: '' }), waveId: generateUniqueId() };
            }
            if (!collection.info.version) {
                collection.info.version = CURRENT_COLLECTION_SCHEMA_VERSION;
            }
        }

        const validation = validateWaveCollection(collection);
        if (!validation.isOk) {
            console.error(
                `[CollectionService] saveFromContent: rejected invalid collection for "${fileName}": ${validation.error}`
            );
            throw new Error(`Invalid collection: ${validation.error}`);
        }

        return this.save(collection, fileName);
    }

    /**
     * Saves or updates a request item in a collection file under the
     * specified folder path.
     *
     * The payload is the **whole `CollectionItem`** (id, name, description,
     * request, response) so item identity survives moves and duplicates:
     * - Items are matched by `id` first (update in place).
     * - Name matching is a fallback **only** for legacy payloads without an
     *   id — an existing item's id is never regenerated, and a same-named
     *   item with a different id is never silently overwritten.
     * - The `item.name === request.name` invariant is enforced on save.
     *
     * @param itemContent JSON content of the `CollectionItem` to save
     * @param collectionFileName The collection file to save to
     * @param folderPath The folder path within the collection to save under
     * @param newCollectionName Optional name for a new collection if creating new
     * @returns The filename of the collection that was saved to
     */
    async saveRequest(
        itemContent: string,
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

        // Parse the whole CollectionItem — request accepts any protocol (HTTP, WS, SSE)
        const rawItem = JSON.parse(itemContent) as CollectionItem;
        if (!rawItem || typeof rawItem !== 'object' || !rawItem.request || !rawItem.name) {
            throw new Error('Invalid item payload: expected a CollectionItem with a name and a request.');
        }

        const hadId = Boolean(rawItem.id);
        const incoming: CollectionItem = {
            ...rawItem,
            id: rawItem.id || generateUniqueId(),
            request: sanitizeRequestForSave(rawItem.request as AnyCollectionRequest),
        };
        // Enforce the invariant: item.name === request.name; request keeps a stable id.
        incoming.request!.name = incoming.name;
        if (!incoming.request!.id) {
            incoming.request = { ...incoming.request!, id: generateUniqueId() };
        }

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

        // Match by id first — moves/duplicates keep their identity end-to-end.
        const byIdIndex = items.findIndex((i: CollectionItem) => i.id === incoming.id);
        if (byIdIndex !== -1) {
            items[byIdIndex] = { ...items[byIdIndex], ...incoming };
        } else if (!hadId) {
            // Legacy payload without an id: fall back to name match, keeping
            // the existing slot's id (never regenerate an existing id).
            const byNameIndex = items.findIndex((i: CollectionItem) => i.name === incoming.name && i.request);
            if (byNameIndex !== -1) {
                items[byNameIndex] = { ...items[byNameIndex], ...incoming, id: items[byNameIndex].id };
            } else {
                items.push(incoming);
            }
        } else {
            // Incoming item carries its own id and nothing matches — add it.
            // A same-named different-id item at the destination is left intact.
            items.push(incoming);
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
     *
     * When `newCollectionName` is provided the collection's display name is
     * overridden, case-insensitive uniqueness is enforced against all loaded
     * collections, and the filename is always generated fresh (no silent
     * overwrite). When omitted, a unique filename is still generated — the
     * original silent-overwrite behaviour is no longer supported.
     *
     * @param fileName    Source filename (used only to derive a base if needed)
     * @param fileContent Wave-format JSON string
     * @param newCollectionName Optional display-name override
     */
    async import(
        fileName: string,
        fileContent: string,
        newCollectionName?: string
    ): Promise<Collection & { filename: string }> {
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
            collection.info.version = CURRENT_COLLECTION_SCHEMA_VERSION;
        }
        if (!collection.item) {
            collection.item = [];
        }

        // Apply display-name override and enforce uniqueness
        if (newCollectionName) {
            const trimmed = newCollectionName.trim();
            const existing = await this.loadAll();
            const duplicate = existing.some(
                (c) => c.info.name.toLowerCase() === trimmed.toLowerCase()
            );
            if (duplicate) {
                throw new Error(`A collection named "${trimmed}" already exists`);
            }
            collection.info.name = trimmed;
        }

        // Ensure all items have IDs and normalize request payloads
        collection.item = collection.item.map((item: CollectionItem) => normalizeItemRequests(ensureItemIds(item)));

        // Import boundary: reject structurally invalid collections before writing.
        const validation = validateWaveCollection(collection);
        if (!validation.isOk) {
            console.error(
                `[CollectionService] import: rejected invalid collection "${fileName}" (waveId: ${collection.info.waveId}): ${validation.error}`
            );
            throw new Error(`Invalid collection: ${validation.error}`);
        }

        // Always generate a unique filename — prevents silent overwrites.
        const uniqueFileName = await this.generateUniqueFileName(collection.info.name);
        const filePath = path.join(collectionsDir, uniqueFileName);
        await this.writeJsonFileSecure(filePath, collection);

        return { ...collection, filename: uniqueFileName };
    }

    /**
     * Moves an item (folder or request) atomically from one location to another.
     *
     * All validations run before any file is written:
     * - Source item must exist at `sourceItemPath` + `itemId`.
     * - Destination must exist (or be created via `newCollectionName`).
     * - Not a same-location no-op.
     * - For folders (same-collection only): destination must not be inside the
     *   moved folder itself (cycle prevention).
     * - No case-insensitive name conflict at the destination.
     * - Both resulting trees pass `validateCollectionTree`.
     *
     * Same-collection moves issue a single `save` call.
     * Cross-collection moves write the destination first, then the source.
     * If the source write fails the destination is restored from its pre-move
     * state and the error is re-thrown — never partial.
     */
    async moveItem(
        sourceFileName: string,
        sourceItemPath: string[],
        itemId: string,
        destinationFileName: string,
        destinationItemPath: string[],
        newCollectionName?: string
    ): Promise<MoveCollectionItemResult> {
        // 1. Load source
        const source = await this.loadOne(sourceFileName);
        if (!source) {
            throw new Error(`Source collection not found: ${sourceFileName}`);
        }

        // 2. Locate item by path + id
        const sourceSiblings = findFolderAtPath(source.item, sourceItemPath);
        if (sourceSiblings === null) {
            throw new Error(`Source path [${sourceItemPath.join('/')}] not found in "${sourceFileName}"`);
        }
        const item = sourceSiblings.find(i => i.id === itemId);
        if (!item) {
            throw new Error(`Item "${itemId}" not found at path [${sourceItemPath.join('/')}] in "${sourceFileName}"`);
        }

        // 3. Resolve destination
        let dest: Collection;
        let finalDestFileName: string;
        if (newCollectionName) {
            finalDestFileName = await this.generateUniqueFileName(newCollectionName);
            dest = this.createNewCollection(newCollectionName);
        } else {
            finalDestFileName = destinationFileName;
            const loaded = await this.loadOne(destinationFileName);
            if (!loaded) {
                throw new Error(`Destination collection not found: ${destinationFileName}`);
            }
            dest = loaded;
        }

        const isSameCollection = sourceFileName === finalDestFileName;

        // 4. Validate before any write

        // 4a. Same-location no-op
        if (isSameCollection) {
            const sameLocation =
                sourceItemPath.length === destinationItemPath.length &&
                sourceItemPath.every((s, i) => s.toLowerCase() === destinationItemPath[i]?.toLowerCase());
            if (sameLocation) {
                throw new Error('Item is already at the destination location');
            }
        }

        // 4b. Cycle check — folder cannot move into itself or any descendant
        if (isSameCollection && item.item !== undefined) {
            const itemFullPath = [...sourceItemPath, item.name];
            if (isDescendantPath(itemFullPath, destinationItemPath)) {
                throw new Error('Cannot move a folder into itself or one of its descendants');
            }
        }

        // Compute post-removal source tree (used for conflict check + write)
        const newSourceItems = removeItemFromTree(source.item, sourceItemPath, itemId);
        // For same-collection moves the destination is the post-removal tree
        const destBaseItems = isSameCollection ? newSourceItems : dest.item;

        // 4c. Verify destination path exists
        const destFolderContents = findFolderAtPath(destBaseItems, destinationItemPath);
        if (destFolderContents === null) {
            throw new Error(`Destination path [${destinationItemPath.join('/')}] not found`);
        }

        // 4d. Name conflict at destination
        const nameConflict = destFolderContents.find(
            s => s.name.toLowerCase() === item.name.toLowerCase() && s.id !== itemId
        );
        if (nameConflict) {
            const kind = item.item !== undefined ? 'folder' : 'request';
            throw new Error(`A ${kind} named "${item.name}" already exists at the destination`);
        }

        // 4e. Validate resulting trees
        const newDestItems = addItemAtPath(destBaseItems, destinationItemPath, item);

        if (isSameCollection) {
            const validation = validateCollectionTree({ ...source, item: newDestItems });
            if (!validation.isOk) {
                throw new Error(`Move would leave collection in invalid state: ${validation.error}`);
            }
        } else {
            const srcValidation = validateCollectionTree({ ...source, item: newSourceItems });
            if (!srcValidation.isOk) {
                throw new Error(`Move would leave source in invalid state: ${srcValidation.error}`);
            }
            const dstValidation = validateCollectionTree({ ...dest, item: newDestItems });
            if (!dstValidation.isOk) {
                throw new Error(`Move would leave destination in invalid state: ${dstValidation.error}`);
            }
        }

        // 5. Apply writes
        if (isSameCollection) {
            const updated = { ...source, item: newDestItems };
            await this.save(updated, sourceFileName);
            console.log(`[CollectionService] moveItem: moved item "${itemId}" within "${sourceFileName}" ([${sourceItemPath}] → [${destinationItemPath}])`);
            return {
                source: { ...updated, filename: sourceFileName },
                destination: { ...updated, filename: sourceFileName },
            };
        }

        // Cross-collection: write destination first, rollback on source failure
        const updatedDest = { ...dest, item: newDestItems };
        const updatedSource = { ...source, item: newSourceItems };

        await this.save(updatedDest, finalDestFileName);
        console.log(`[CollectionService] moveItem: wrote destination "${finalDestFileName}"`);

        try {
            await this.save(updatedSource, sourceFileName);
            console.log(`[CollectionService] moveItem: moved item "${itemId}" from "${sourceFileName}" to "${finalDestFileName}"`);
            return {
                source: { ...updatedSource, filename: sourceFileName },
                destination: { ...updatedDest, filename: finalDestFileName },
            };
        } catch (saveError) {
            console.error(`[CollectionService] moveItem: source write failed — rolling back "${finalDestFileName}"`);
            try {
                if (newCollectionName) {
                    await this.delete(finalDestFileName);
                } else {
                    await this.save(dest, finalDestFileName);
                }
            } catch (rollbackError) {
                console.error('[CollectionService] moveItem: rollback also failed:', rollbackError);
            }
            throw saveError;
        }
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
                version: CURRENT_COLLECTION_SCHEMA_VERSION,
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
