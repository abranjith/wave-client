/**
 * Collection Utilities
 * Utility functions for working with Collection and CollectionItem types.
 * These replace the old parsing logic and work directly with the nested structure.
 */

import {
  AnyCollectionRequest,
  Collection,
  CollectionItem,
  CollectionRequest,
  CollectionUrl,
  ParamRow,
  FolderPathOption,
  isFolder,
  isRequest,
} from '../types/collection';
import { generateUniqueId } from './common';
import { ok, err } from './result';
import type { Result } from './result';

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Converts collection URL to string format
 */
export function urlToString(url: CollectionUrl | string | undefined): string {
  if (!url) {
    return '';
  }
  
  if (typeof url === 'string') {
    return url;
  }
  
  if (url.raw) {
    return url.raw;
  }
  
  // Reconstruct URL from parts
  const protocol = url.protocol || 'https';
  const host = url.host ? url.host.join('.') : '';
  const path = url.path ? '/' + url.path.join('/') : '';
  
  return `${protocol}://${host}${path}`;
}

/**
 * Extracts URL parameters from CollectionUrl
 */
export function extractUrlParams(url: CollectionUrl | string | undefined): ParamRow[] {
  if (!url) {
    return [];
  }
  
  if (typeof url === 'object' && url.query) {
    return url.query.map(q => ({
      id: q.id || generateUniqueId(),
      key: q.key,
      value: q.value,
      disabled: q.disabled || false,
    }));
  }
  
  // Try to extract from raw URL
  const params: ParamRow[] = [];
  const urlString = urlToString(url);
  try {
    const urlObj = new URL(urlString);
    urlObj.searchParams.forEach((value, key) => {
      params.push({
        id: generateUniqueId(),
        key,
        value,
        disabled: false,
      });
    });
  } catch {
    // Ignore parsing errors
  }
  
  return params;
}

/**
 * Converts URL string and params to CollectionUrl format
 */
export function stringToCollectionUrl(urlString: string, params?: ParamRow[]): CollectionUrl {
  try {
    const url = new URL(urlString);
    
    const query = params?.map(p => ({
      id: p.id,
      key: p.key,
      value: p.value,
      disabled: p.disabled,
    }));

    return {
      raw: urlString,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname.split('.'),
      path: url.pathname.split('/').filter(p => p),
      query: query && query.length > 0 ? query : undefined,
    };
  } catch {
    return { raw: urlString };
  }
}

// ============================================================================
// Collection Traversal Utilities
// ============================================================================

/**
 * Recursively finds an item by ID in a collection
 */
export function findItemById(items: CollectionItem[], id: string): CollectionItem | null {
  for (const item of items) {
    if (item.id === id) {
      return item;
    }
    if (item.item) {
      const found = findItemById(item.item, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Finds an item by ID in a collection and returns it with its path
 */
export function findItemWithPath(
  items: CollectionItem[],
  id: string,
  currentPath: string[] = []
): { item: CollectionItem; path: string[] } | null {
  for (const item of items) {
    if (item.id === id) {
      return { item, path: currentPath };
    }
    if (item.item) {
      const found = findItemWithPath(item.item, id, [...currentPath, item.name]);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Gets all request items from a collection (flattened)
 */
export function getAllRequestItems(items: CollectionItem[]): CollectionItem[] {
  const requests: CollectionItem[] = [];
  
  function traverse(items: CollectionItem[]) {
    for (const item of items) {
      if (isRequest(item)) {
        requests.push(item);
      }
      if (item.item) {
        traverse(item.item);
      }
    }
  }
  
  traverse(items);
  return requests;
}

/**
 * Counts total requests in a collection (including nested)
 */
export function countRequests(items: CollectionItem[]): number {
  let count = 0;
  
  function traverse(items: CollectionItem[]) {
    for (const item of items) {
      if (isRequest(item)) {
        count++;
      }
      if (item.item) {
        traverse(item.item);
      }
    }
  }
  
  traverse(items);
  return count;
}

/**
 * Counts immediate children (folders + requests) at the current level
 */
export function countImmediateChildren(items: CollectionItem[]): number {
  return items.length;
}

// ============================================================================
// Folder Path Utilities
// ============================================================================

/**
 * Generates all folder path options for a collection (for dropdown selection)
 * Returns paths like: "Folder1", "Folder1 / Subfolder", "Folder1 / Subfolder / Deep"
 */
export function getFolderPathOptions(collection: Collection): FolderPathOption[] {
  const options: FolderPathOption[] = [];
  
  // Add root option
  options.push({
    path: [],
    displayPath: '(Root)',
    depth: 0,
  });
  
  function traverse(items: CollectionItem[], currentPath: string[], depth: number) {
    for (const item of items) {
      if (isFolder(item)) {
        const newPath = [...currentPath, item.name];
        options.push({
          path: newPath,
          displayPath: newPath.join(' / '),
          depth,
        });
        
        if (item.item) {
          traverse(item.item, newPath, depth + 1);
        }
      }
    }
  }
  
  traverse(collection.item, [], 1);
  return options;
}

/**
 * Navigates to a folder by path and returns the items at that location
 */
export function getItemsAtPath(collection: Collection, folderPath: string[]): CollectionItem[] {
  let items = collection.item;
  
  for (const folderName of folderPath) {
    const folder = items.find(i => i.name === folderName && isFolder(i));
    if (!folder || !folder.item) {
      return [];
    }
    items = folder.item;
  }
  
  return items;
}

// ============================================================================
// Collection Modification Utilities
// ============================================================================

/**
 * Ensures all items in a collection have IDs (mutates in place)
 */
export function ensureItemIds(items: CollectionItem[]): void {
  for (const item of items) {
    if (!item.id) {
      item.id = generateUniqueId();
    }
    if (item.item) {
      ensureItemIds(item.item);
    }
  }
}

/**
 * Prepares a collection after loading (ensures IDs, adds filename)
 */
export function prepareCollection(collection: Collection, filename: string): Collection {
  ensureItemIds(collection.item);
  return {
    ...collection,
    filename,
  };
}

// ============================================================================
// Validation Utilities (FEAT-003)
// ============================================================================

/**
 * Validates an item (folder or request) name against its siblings.
 *
 * Rules: non-empty after trim; unique among siblings (case-insensitive),
 * excluding the item itself via `excludeId`.
 *
 * @param name - The proposed name (untrimmed).
 * @param siblings - The items at the same tree level.
 * @param excludeId - The id of the item being renamed (excluded from the check).
 * @returns `ok(trimmedName)` when valid; `err(message)` otherwise.
 */
export function validateItemName(
  name: string,
  siblings: CollectionItem[],
  excludeId?: string
): Result<string, string> {
  const trimmed = name.trim();
  if (!trimmed) {
    return err('Name must not be empty.');
  }
  const isDuplicate = siblings.some(
    s => s.id !== excludeId && s.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (isDuplicate) {
    return err(`An item named "${trimmed}" already exists at this level.`);
  }
  return ok(trimmed);
}

/**
 * Validates structural integrity of a collection tree before persistence:
 * non-empty collection name, every item has an id and a non-empty trimmed
 * name, and sibling-level names are unique (case-insensitive) for folders
 * and requests alike. The error message names the offending item's path.
 *
 * @param collection - The collection to validate.
 * @returns `ok(undefined)` when valid; `err(message)` naming the violation.
 */
export function validateCollectionTree(collection: Collection): Result<void, string> {
  if (!collection.info?.name?.trim()) {
    return err('Collection name must not be empty.');
  }

  const walk = (items: CollectionItem[], path: string[]): string | undefined => {
    const seenNames = new Set<string>();
    const level = path.length > 0 ? `"${path.join(' / ')}"` : 'the collection root';

    for (const item of items) {
      if (!item.id) {
        return `Item "${item.name ?? '(unnamed)'}" under ${level} is missing an id.`;
      }
      const trimmed = (item.name ?? '').trim();
      if (!trimmed) {
        return `An item under ${level} has an empty name.`;
      }
      const key = trimmed.toLowerCase();
      if (seenNames.has(key)) {
        return `Duplicate item name "${trimmed}" under ${level}.`;
      }
      seenNames.add(key);

      if (item.item) {
        const childError = walk(item.item, [...path, trimmed]);
        if (childError) {
          return childError;
        }
      }
    }
    return undefined;
  };

  const error = walk(collection.item ?? [], []);
  return error ? err(error) : ok(undefined);
}

// ============================================================================
// Immutable Tree Modification Utilities
// ============================================================================

/**
 * Returns an immutably updated items array where the item matching `itemId`
 * has its `name` replaced with `newName`. Searches recursively through folders.
 *
 * Invariant: when the item wraps a request, `item.name === request.name` —
 * both names are updated atomically in the same immutable update.
 *
 * @param items - The current-level items to search
 * @param itemId - The ID of the item to rename
 * @param newName - The new name to assign
 * @returns A new array with the renamed item; unchanged if `itemId` is not found
 */
export function renameItemInTree(items: CollectionItem[], itemId: string, newName: string): CollectionItem[] {
  return items.map(item => {
    if (item.id === itemId) {
      return {
        ...item,
        name: newName,
        ...(item.request ? { request: { ...item.request, name: newName } } : {}),
      };
    }
    if (item.item) {
      return { ...item, item: renameItemInTree(item.item, itemId, newName) };
    }
    return item;
  });
}

/**
 * Returns an immutably updated items array with the item identified by
 * `itemId` removed from the folder at `itemPath`.
 *
 * @param items - The current-level items to search
 * @param itemPath - Ordered folder names from the current level to the item's parent
 * @param itemId - The ID of the item to remove
 * @returns A new array without the target item; unchanged if not found
 */
export function removeItemFromTree(items: CollectionItem[], itemPath: string[], itemId: string): CollectionItem[] {
  if (itemPath.length === 0) {
    return items.filter(item => item.id !== itemId);
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
 * Returns the sibling items at the folder level described by `folderPath`.
 * An empty path refers to the root level.
 *
 * @param items - Root-level items of the collection
 * @param folderPath - Ordered folder names from root to the desired parent folder
 * @returns The items array at that level, or `[]` if the path is invalid
 */
export function getSiblingsAtPath(items: CollectionItem[], folderPath: string[]): CollectionItem[] {
  if (folderPath.length === 0) {return items;}
  const [nextFolder, ...remainingPath] = folderPath;
  const folder = items.find(i => i.name === nextFolder && i.item !== undefined);
  if (!folder || !folder.item) {return [];}
  return getSiblingsAtPath(folder.item, remainingPath);
}

/**
 * Generates a unique sibling-safe copy name for duplicated requests.
 *
 * @param baseName - Original request name to duplicate.
 * @param siblings - Existing items in the same destination folder.
 * @returns A unique name such as "My Request Copy", "My Request Copy 2", etc.
 *
 * @example
 * generateUniqueCopyName('Get Users', siblings);
 */
export function generateUniqueCopyName(baseName: string, siblings: CollectionItem[]): string {
  const normalizedSiblingNames = new Set(
    siblings.map((sibling) => sibling.name.trim().toLowerCase())
  );

  const baseCopyName = `${baseName} Copy`;
  if (!normalizedSiblingNames.has(baseCopyName.toLowerCase())) {
    return baseCopyName;
  }

  let copyIndex = 2;
  while (normalizedSiblingNames.has(`${baseCopyName} ${copyIndex}`.toLowerCase())) {
    copyIndex += 1;
  }

  return `${baseCopyName} ${copyIndex}`;
}

/**
 * Creates a deep duplicate of a request item with fresh runtime IDs.
 *
 * @param item - The original request item to duplicate.
 * @returns A deep copy with a new item id and new nested request id.
 *
 * @example
 * const duplicate = duplicateRequestItem(originalItem);
 */
export function duplicateRequestItem(item: CollectionItem): CollectionItem {
  const cloned = structuredClone(item);
  cloned.id = crypto.randomUUID();
  if (cloned.request) {
    cloned.request.id = crypto.randomUUID();
  }
  return cloned;
}

// ============================================================================
// Request Conversion Utilities
// ============================================================================

/**
 * Extracts an `AnyCollectionRequest` from a `CollectionItem` with full metadata.
 *
 * Creates a standalone request that includes the `sourceRef` for save
 * operations back to the collection. Protocol-specific fields (e.g.,
 * `method`, `body`, `validation` for HTTP; nothing extra for WS; `method`
 * and `body` for SSE) are preserved through the spread.
 *
 * @param item - The collection item containing the request.
 * @param collectionFilename - The owning collection's filename.
 * @param collectionName - The owning collection's display name.
 * @param itemPath - The folder path from the collection root to this item.
 * @returns The extracted request with `sourceRef` attached.
 */
export function extractRequestFromItem(
  item: CollectionItem,
  collectionFilename: string,
  collectionName: string,
  itemPath: string[]
): AnyCollectionRequest {
  const request = item.request;
  
  if (!request) {
    throw new Error('Item is not a request');
  }
  
  return {
    ...request,
    id: item.id,
    name: item.name,
    // Ensure URL is a string for easier handling
    url: typeof request.url === 'string' ? request.url : urlToString(request.url),
    sourceRef: {
      collectionFilename,
      collectionName,
      itemPath,
    },
  } as AnyCollectionRequest;
}

/**
 * Converts an `AnyCollectionRequest` back to `CollectionItem` format for saving.
 *
 * Strips runtime-only fields (`sourceRef`) — `id` and `name` are promoted to
 * the item level. All protocol-specific fields (`protocol`, `method`, `body`,
 * `validation`, `url`, `header`, `query`, `description`, `authId`) are
 * preserved on the nested `request` payload.
 *
 * @param request - The protocol-discriminated request to convert.
 * @returns A `CollectionItem` ready for persistence.
 */
export function requestToCollectionItem(request: AnyCollectionRequest): CollectionItem {
  // Destructure out the fields that live on the CollectionItem level
  // and the runtime-only sourceRef. The rest forms the persisted request body.
  // We use a generic spread so that WS/SSE-specific fields are never lost.
  const { id, name, sourceRef: _sourceRef, ...requestData } = request as AnyCollectionRequest & { sourceRef?: unknown };

  return {
    id,
    name,
    request: requestData as AnyCollectionRequest,
  };
}

// ============================================================================
// Legacy Compatibility (deprecated, will be removed)
// ============================================================================

/**
 * @deprecated Use prepareCollection instead
 * Legacy function for backward compatibility during migration
 */
export function parseCollection(collectionJson: Collection & { filename?: string }, filename: string): Collection {
  return prepareCollection(collectionJson, filename);
}
