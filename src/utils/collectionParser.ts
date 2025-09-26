import { Collection, CollectionItem, ParsedCollection, ParsedFolder, ParsedRequest, CollectionUrl, CollectionHeader } from '../types/collection';

/**
 * Generates a unique ID for a request based on its path and name
 */
function generateRequestId(folderPath: string[], requestName: string): string {
  return [...folderPath, requestName].join('/').toLowerCase().replace(/[^a-z0-9\/]/g, '-');
}

/**
 * Converts collection URL to string format
 */
function urlToString(url: CollectionUrl | string): string {
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
 * Converts collection headers to record format
 */
function headersToRecord(headers?: CollectionHeader[]): Record<string, string | string[]> {
  if (!headers) {
    return {};
  }
  
  const result: Record<string, string | string[]> = {};
  headers.forEach(header => {
    if (header.key && header.value) {
      result[header.key] = header.value;
    }
  });
  
  return result;
}

/**
 * Extracts URL parameters from both URL string and Postman query array
 */
function extractUrlParams(url: CollectionUrl | string): URLSearchParams {
  const params = new URLSearchParams();
  
  if (typeof url === 'object' && url.query) {
    // Handle Postman query array format
    url.query.forEach((queryItem: any) => {
      if (queryItem.key && queryItem.value) {
        params.append(queryItem.key, queryItem.value);
      }
    });
  }
  
  // Also try to extract from raw URL
  const urlString = urlToString(url);
  try {
    const urlObj = new URL(urlString);
    urlObj.searchParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.append(key, value);
      }
    });
  } catch {
    // Ignore parsing errors
  }
  
  return params;
}

/**
 * Recursively flattens nested folders into a single level with accumulated path names
 */
function flattenFolders(
  items: CollectionItem[], 
  folderPath: string[] = [],
  collectionName: string = '',
  isDefault: boolean = false
): { folders: ParsedFolder[], requests: ParsedRequest[] } {
  const folders: ParsedFolder[] = [];
  const requests: ParsedRequest[] = [];
  
  items.forEach(item => {
    if (item.item) {
      // This is a folder - flatten all nested content
      const currentFolderName = item.name.replace(/\//g, ' ');
      const fullFolderPath = [...folderPath, currentFolderName];
      
      // Create display name: prefix with collection name if not default
      let displayName = currentFolderName;
      if (!isDefault && folderPath.length === 0) {
        // Only prefix top-level folders from non-default collections
        const cleanCollectionName = collectionName.replace(/\//g, ' ');
        displayName = `${cleanCollectionName}/${currentFolderName}`;
      } else if (folderPath.length > 0) {
        // For nested folders, create a flat path
        displayName = fullFolderPath.join('/');
        if (!isDefault) {
          const cleanCollectionName = collectionName.replace(/\//g, ' ');
          displayName = `${cleanCollectionName}/${displayName}`;
        }
      }
      
      // Recursively get all requests from this folder and its subfolders
      const allRequests = getAllRequestsFromFolder(item.item, fullFolderPath);
      
      if (allRequests.length > 0) {
        folders.push({
          name: displayName,
          requests: allRequests,
          subfolders: [] // Always empty since we're flattening
        });
      }
    } else if (item.request) {
      // This is a top-level request
      const url = urlToString(item.request.url);
      const headers = headersToRecord(item.request.header);
      const params = extractUrlParams(item.request.url);
      const body = item.request.body?.raw || '';
      
      requests.push({
        id: generateRequestId(folderPath, item.name),
        name: item.name,
        method: item.request.method.toUpperCase(),
        url,
        headers,
        params,
        body,
        folderPath
      });
    }
  });
  
  return { folders, requests };
}

/**
 * Recursively extracts all requests from a folder and its subfolders
 */
function getAllRequestsFromFolder(
  items: CollectionItem[], 
  folderPath: string[]
): ParsedRequest[] {
  const requests: ParsedRequest[] = [];
  
  items.forEach(item => {
    if (item.item) {
      // This is a subfolder - recurse into it
      const subRequests = getAllRequestsFromFolder(item.item, [...folderPath, item.name]);
      requests.push(...subRequests);
    } else if (item.request) {
      // This is a request
      const url = urlToString(item.request.url);
      const headers = headersToRecord(item.request.header);
      const params = extractUrlParams(item.request.url);
      const body = item.request.body?.raw || '';
      
      requests.push({
        id: generateRequestId(folderPath, item.name),
        name: item.name,
        method: item.request.method.toUpperCase(),
        url,
        headers,
        params,
        body,
        folderPath
      });
    }
  });
  
  return requests;
}

/**
 * Parses a Postman collection JSON into a structured format
 */
export function parseCollection(collectionJson: Collection, filename: string): ParsedCollection {
  const isDefault = filename.toLowerCase().includes('default') || filename.toLowerCase() === 'default.json';
  const collectionName = collectionJson.info.name;
  
  const { folders, requests } = flattenFolders(collectionJson.item, [], collectionName, isDefault);
  
  return {
    name: collectionName,
    filename,
    folders,
    requests
  };
}

/**
 * Recursively searches for a request by ID in folders
 */
function findRequestInFolders(folders: ParsedFolder[], requestId: string): ParsedRequest | null {
  for (const folder of folders) {
    // Check requests in this folder
    const request = folder.requests.find(req => req.id === requestId);
    if (request) {
      return request;
    }
    
    // Check subfolders
    const subfolderRequest = findRequestInFolders(folder.subfolders, requestId);
    if (subfolderRequest) {
      return subfolderRequest;
    }
  }
  
  return null;
}

/**
 * Finds a request by ID in a parsed collection
 */
export function findRequestById(collection: ParsedCollection, requestId: string): ParsedRequest | null {
  // Check top-level requests
  const topLevelRequest = collection.requests.find(req => req.id === requestId);
  if (topLevelRequest) {
    return topLevelRequest;
  }
  
  // Check requests in folders
  return findRequestInFolders(collection.folders, requestId);
}

/**
 * Gets all requests from a collection (flattened)
 */
export function getAllRequests(collection: ParsedCollection): ParsedRequest[] {
  const allRequests: ParsedRequest[] = [...collection.requests];
  
  function extractFromFolders(folders: ParsedFolder[]) {
    folders.forEach(folder => {
      allRequests.push(...folder.requests);
      extractFromFolders(folder.subfolders);
    });
  }
  
  extractFromFolders(collection.folders);
  return allRequests;
}
