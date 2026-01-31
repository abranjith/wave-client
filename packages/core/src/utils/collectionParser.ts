/**
 * Collection Utilities
 * Utility functions for working with Collection and CollectionItem types.
 * These replace the old parsing logic and work directly with the nested structure.
 */

import {
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
// Request Conversion Utilities
// ============================================================================

/**
 * Extracts a CollectionRequest from a CollectionItem with full metadata.
 * This creates a standalone request that includes the source reference
 * for save operations back to the collection.
 */
export function extractRequestFromItem(
  item: CollectionItem,
  collectionFilename: string,
  collectionName: string,
  itemPath: string[]
): CollectionRequest {
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
  };
}

/**
 * Converts a CollectionRequest back to CollectionItem format for saving.
 * Strips runtime-only fields (id, name are kept on the item level).
 */
export function requestToCollectionItem(request: CollectionRequest): CollectionItem {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, name, sourceRef, ...requestData } = request;
  
  return {
    id,
    name,
    request: requestData as CollectionRequest,
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
