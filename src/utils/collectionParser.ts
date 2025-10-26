import { Collection, CollectionItem, ParsedCollection, ParsedFolder, ParsedRequest, CollectionUrl, ParamRow, CollectionRequest, CollectionBody } from '../types/collection';

/**
 * Generates a unique ID for a request based on its path and name
 */
function generateRequestId(folderPath: string[], requestName: string, prefix: string | null = null): string {
  const baseId = [...folderPath, requestName].join('/').toLowerCase().replace(/[^a-z0-9\/]/g, '-');
  return prefix ? `${prefix}-${baseId}` : baseId;
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
 * Extracts URL parameters from both URL string and Postman query array
 */
function extractUrlParams(url: CollectionUrl | string): ParamRow[] {
  
  if (typeof url === 'object' && url.query) {
    // Handle Postman query array format
    return url.query.map(q => ({
      id: q.id || generateRequestId([], q.key, 'param'),
      key: q.key,
      value: q.value,
      disabled: q.disabled || false
    }));
  }
  
  // Also try to extract from raw URL
  const params: ParamRow[] = [];
  const urlString = urlToString(url);
  try {
    const urlObj = new URL(urlString);
    urlObj.searchParams.forEach((value, key) => {
      params.push({
        id: generateRequestId([], key, 'param'),
        key,
        value,
        disabled: false
      });
    });
  } catch {
    // Ignore parsing errors
  }
  
  return params;
}

/**
 * Converts a parsed request back to Collection format
 */
export function transformToCollectionRequest(parsed: ParsedRequest): CollectionRequest {
  const collectionRequest: CollectionRequest = {
    method: parsed.method,
    header: parsed.headers,
    url: transformUrlToCollection(parsed.url, parsed.params),
  };

  // Add body if present
  if (parsed.body || parsed.binaryBody) {
    collectionRequest.body = transformBodyToCollection(parsed);
  }

  return collectionRequest;
}

/**
 * Converts URL string and params back to CollectionUrl format
 */
function transformUrlToCollection(urlString: string, params: ParamRow[]): CollectionUrl {
  try {
    const url = new URL(urlString);
    
    // Build query array from params (include disabled ones)
    const query = params.map(p => ({
      id: p.id,
      key: p.key,
      value: p.value,
      disabled: p.disabled
    }));

    return {
      raw: urlString,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname.split('.'),
      path: url.pathname.split('/').filter(p => p),
      query: query.length > 0 ? query : undefined
    };
  } catch {
    // Fallback for invalid URLs
    return {
      raw: urlString
    };
  }
}

/**
 * Converts body data back to CollectionBody format
 */
function transformBodyToCollection(parsed: ParsedRequest): CollectionBody | undefined {
  if (parsed.binaryBody) {
    return {
      mode: 'file',
      binary: {
        data: parsed.binaryBody.data,
        fileName: parsed.binaryBody.fileName,
        contentType: parsed.binaryBody.contentType
      }
    };
  }

  if (parsed.body) {
    return {
      mode: 'raw',
      raw: parsed.body
    };
  }

  return undefined;
}

/**
 * Recursively flattens nested folders into a single level with accumulated path names
 */
function flattenFolders(
  items: CollectionItem[], 
  collectionName: string,
  fileName: string
): { folders: ParsedFolder[], requests: ParsedRequest[] } {
  const folders: ParsedFolder[] = [];
  const requests: ParsedRequest[] = [];
  
  items.forEach(item => {
    if (item.item) {
      // This is a folder - flatten all nested content
      const currentFolderName = item.name.replace(/\//g, ' ');
      const folderPath = [currentFolderName];
      
      // Recursively get all requests from this folder and its subfolders
      const allRequests = getAllRequestsFromFolder(item.item, folderPath, collectionName, fileName);
      
      if (allRequests.length > 0) {
        folders.push({
          name: currentFolderName,
          requests: allRequests,
          subfolders: [] // Always empty since we're flattening
        });
      }
    } else if (item.request) {
      // This is a top-level request
      const url = urlToString(item.request.url);
      const headers = item.request.header || [];
      const params = extractUrlParams(item.request.url);
      const body = item.request.body?.raw || '';
      
      requests.push({
        id: generateRequestId([], item.name),
        name: item.name,
        method: item.request.method.toUpperCase(),
        url,
        headers,
        params,
        body,
        sourceRef: {
          collectionFilename: fileName,
          collectionName,
          itemPath: []
        }
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
  folderPath: string[],
  parentCollectionName: string = '',
  collectionFilename: string = ''
): ParsedRequest[] {
  const requests: ParsedRequest[] = [];
  
  items.forEach(item => {
    if (item.item) {
      // This is a subfolder - recurse into it
      const subRequests = getAllRequestsFromFolder(item.item, [...folderPath, item.name], parentCollectionName, collectionFilename);
      requests.push(...subRequests);
    } else if (item.request) {
      // This is a request
      const url = urlToString(item.request.url);
      const headers = item.request.header || [];
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
        sourceRef: {
          collectionFilename,
          collectionName: parentCollectionName,
          itemPath: [...folderPath]
        }
      });
    }
  });
  
  return requests;
}

/**
 * Parses a Postman collection JSON into a structured format
 */
export function parseCollection(collectionJson: Collection, filename: string): ParsedCollection {
  //const isDefault = filename.toLowerCase().includes('default') || filename.toLowerCase() === 'default.json';
  const collectionName = collectionJson.info.name;
  
  const { folders, requests } = flattenFolders(collectionJson.item, collectionName, filename);
  
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
