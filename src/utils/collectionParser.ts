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
  CollectionBody,
  CollectionReference,
  HeaderRow,
  ParamRow,
  FolderPathOption,
  ParsedRequest,
  isFolder,
  isRequest,
} from '../types/collection';

// Re-export ParsedRequest for backward compatibility
export type { ParsedRequest };

// Alias for clarity
export type RequestFormData = ParsedRequest;

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generates a unique ID
 */
export function generateUniqueId(): string {
  return crypto.randomUUID();
}

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
// Request Building Utilities (for UI -> Collection)
// ============================================================================

/**
 * Converts UI request form data to CollectionRequest format
 */
export function formDataToCollectionRequest(formData: RequestFormData): CollectionRequest {
  const collectionRequest: CollectionRequest = {
    method: formData.method,
    url: stringToCollectionUrl(formData.url, formData.params),
    header: formData.headers,
  };

  // Add body if present
  if (formData.binaryBody) {
    collectionRequest.body = {
      mode: 'file',
      binary: {
        data: formData.binaryBody.data,
        fileName: formData.binaryBody.fileName,
        contentType: formData.binaryBody.contentType,
      },
    };
  } else if (formData.body) {
    collectionRequest.body = {
      mode: formData.bodyMode || 'raw',
      raw: formData.body,
      options: formData.bodyOptions,
    };
  }

  return collectionRequest;
}

/**
 * Converts a CollectionItem (request) to UI form data format
 */
export function collectionItemToFormData(
  item: CollectionItem,
  collectionFilename: string,
  collectionName: string,
  itemPath: string[]
): RequestFormData {
  const request = item.request;
  
  if (!request) {
    throw new Error('Item is not a request');
  }
  
  return {
    id: item.id,
    name: item.name,
    method: request.method?.toUpperCase() || 'GET',
    url: urlToString(request.url),
    headers: request.header || [],
    params: extractUrlParams(request.url),
    body: request.body?.raw || null,
    bodyMode: request.body?.mode,
    bodyOptions: request.body?.options,
    binaryBody: request.body?.binary,
    sourceRef: {
      collectionFilename,
      collectionName,
      itemPath,
    },
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

/**
 * @deprecated Use formDataToCollectionRequest instead
 * Legacy function for backward compatibility during migration
 */
export function transformToCollectionRequest(formData: RequestFormData): CollectionRequest {
  return formDataToCollectionRequest(formData);
}
