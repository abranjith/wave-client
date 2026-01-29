/**
 * Request Builder Utility
 * Shared logic for preparing HTTP requests with environment variable resolution,
 * auth handling, and body conversion.
 */

import { 
    HeaderRow, 
    ParamRow, 
    FormField, 
    Environment,
    CollectionRequest,
    CollectionBody,
    FileReference,
    MultiPartFormField,
    BodyMode,
} from '../types/collection';
import { Auth } from '../hooks/store/createAuthSlice';
import { resolveParameterizedValue, getContentTypeFromBodyMode, isUrlInDomains } from './common';
import { Result, Ok, Err } from './result';
import { IFileAdapter } from '../types/adapters';

// ==================== Types ====================

/**
 * Serializable form data entry for transport between client and server.
 * File values are base64 encoded, text values are plain strings.
 */
export interface SerializedFormDataEntry {
    key: string;
    value: string;  // For text fields: the text value; for files: base64 encoded data
    fieldType: 'text' | 'file';
    /** Only present for file fields */
    fileName?: string;
    /** Only present for file fields */
    contentType?: string;
}

/**
 * Serialized form data body for transport.
 */
export interface SerializedFormDataBody {
    type: 'formdata';
    entries: SerializedFormDataEntry[];
}

/**
 * Serialized binary/file body for transport.
 */
export interface SerializedFileBody {
    type: 'file';
    data: string;  // base64 encoded
    fileName: string;
    contentType: string;
}

/**
 * All possible body types that can be sent in an HTTP request.
 * - string: raw text body (JSON, XML, plain text, etc.)
 * - Record<string, string>: URL-encoded form data
 * - SerializedFormDataBody: multipart form data with file support
 * - SerializedFileBody: binary file body
 * - null: no body
 */
export type HttpRequestBody = 
    | string 
    | Record<string, string> 
    | SerializedFormDataBody 
    | SerializedFileBody 
    | null;

export interface PreparedHttpRequest {
    id: string;
    method: string;
    url: string;
    params?: string;
    headers: Record<string, string | string[]>;
    body: HttpRequestBody;
    auth?: Auth;
    envVars: Record<string, string>;
}

export interface RequestBuildResult {
    request?: PreparedHttpRequest;
    error?: string;
    unresolved?: string[];
}

// ==================== Helper Functions ====================

/**
 * Creates environment variables map from global and active environment
 * @param dynamicEnvVars Optional dynamic variables (e.g., from flow context) that override all other vars
 */
export function buildEnvVarsMap(
    environments: Environment[], 
    environmentId: string | null,
    dynamicEnvVars?: Record<string, string>
): Map<string, string> {
    const envVarsMap = new Map<string, string>();

    // First add global environment variables
    const globalEnv = environments.find(e => e.name.toLowerCase() === 'global');
    if (globalEnv) {
        globalEnv.values.forEach(variable => {
            if (variable.enabled) {
                envVarsMap.set(variable.key, variable.value);
            }
        });
    }
    
    // Then add/override with active environment variables
    if (environmentId) {
        const activeEnv = environments.find(e => e.id === environmentId);
        if (activeEnv) {
            activeEnv.values.forEach(variable => {
                if (variable.enabled) {
                    envVarsMap.set(variable.key, variable.value);
                }
            });
        }
    }

    // dynamicEnvVars will override any env specific variables
    if (dynamicEnvVars) {
        Object.entries(dynamicEnvVars).forEach(([key, value]) => {
            envVarsMap.set(key, value);
        });
    }
    
    return envVarsMap;
}

/**
 * Resolves header rows to a dictionary, resolving environment variables
 */
export function getDictFromHeaderRows(
    headerRows: HeaderRow[], 
    envVarsMap: Map<string, string>, 
    unresolved: Set<string>
): Record<string, string | string[]> {
    const headers: Record<string, string | string[]> = {};
    
    for (const header of headerRows) {
        if (header.key && header.key.trim() && !header.disabled) {
            const keyResult = resolveParameterizedValue(header.key, envVarsMap);
            keyResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedKey = keyResult.resolved.trim();

            const valueResult = resolveParameterizedValue(header.value, envVarsMap);
            valueResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedValue = valueResult.resolved;

            if (headers[resolvedKey]) {
                if (Array.isArray(headers[resolvedKey])) {
                    (headers[resolvedKey] as string[]).push(resolvedValue);
                } else {
                    headers[resolvedKey] = [headers[resolvedKey] as string, resolvedValue];
                }
            } else {
                headers[resolvedKey] = resolvedValue;
            }
        }
    }

    return headers;
}

/**
 * Converts param rows to URLSearchParams, resolving environment variables
 */
export function getURLSearchParamsFromParamRows(
    paramRows: ParamRow[], 
    envVarsMap: Map<string, string>, 
    unresolved: Set<string>
): URLSearchParams {
    const resolvedParams: Array<{key: string, value: string}> = [];
    for (const param of paramRows) {
        if (param.key && param.key.trim() && !param.disabled) {
            const keyResult = resolveParameterizedValue(param.key, envVarsMap);
            keyResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedKey = keyResult.resolved.trim();

            const valueResult = resolveParameterizedValue(param.value, envVarsMap);
            valueResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedValue = valueResult.resolved;

            resolvedParams.push({ key: resolvedKey, value: resolvedValue });
        }
    }
    const urlParams = new URLSearchParams();
    resolvedParams.forEach(param => {
        urlParams.append(param.key, param.value);
    });
    return urlParams;
}

// ==================== File Resolution ====================

/**
 * Converts a Uint8Array to a base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Resolves a FileReference to its base64-encoded content.
 * This is called at execution time to load file content.
 * For browser files (pathType='browser'), returns the embedded base64 data directly.
 * For file system files, reads via the file adapter and converts to base64.
 * @param ref The file reference containing path and metadata
 * @param fileAdapter The file adapter for reading files (not needed for browser files)
 * @returns Result with base64 string on success, error message on failure
 */
export async function resolveFileReference(
    ref: FileReference,
    fileAdapter?: IFileAdapter
): Promise<Result<string, string>> {
    try {
        // Handle browser files with embedded base64 data - return as-is
        if (ref.fileData) {
            return Ok(ref.fileData);
        }
        
        // Handle file system files via adapter
        if (!fileAdapter) {
            return Err(`No file adapter provided for file: ${ref.fileName}`);
        }
        
        const result = await fileAdapter.readFileAsBinary(ref.path);
        if (result.isOk) {
            // Convert Uint8Array to base64
            const base64 = uint8ArrayToBase64(result.value);
            return Ok(base64);
        }
        return Err(`File not found: ${ref.fileName} at ${ref.path}. Please re-upload the file.`);
    } catch (error) {
        return Err(`Failed to read file: ${ref.fileName}. ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// ==================== Body Conversion ====================

/**
 * Converts a CollectionBody to the appropriate HTTP payload format.
 * Handles all body modes: none, raw, urlencoded, formdata, file.
 * Returns serializable types that can be safely transported between client and server.
 * File content is resolved at execution time and encoded as base64.
 */
export async function convertCollectionBodyToHttpPayload(
    body: CollectionBody | undefined,
    envVarsMap: Map<string, string>,
    unresolved: Set<string>,
    fileAdapter?: IFileAdapter
): Promise<HttpRequestBody> {
    if (!body || body.mode === 'none') {
        return null;
    }
    
    switch (body.mode) {
        case 'raw': {
            const bodyResult = resolveParameterizedValue(body.raw, envVarsMap);
            bodyResult.unresolved.forEach(u => unresolved.add(u));
            return bodyResult.resolved;
        }
            
        case 'urlencoded': {
            const dataRecord: Record<string, string> = {};
            for (const field of body.urlencoded) {
                if (field.key && field.key.trim() && !field.disabled) {
                    const keyResult = resolveParameterizedValue(field.key, envVarsMap);
                    keyResult.unresolved.forEach(u => unresolved.add(u));
                    const resolvedKey = keyResult.resolved;

                    const valueResult = resolveParameterizedValue(field.value || '', envVarsMap);
                    valueResult.unresolved.forEach(u => unresolved.add(u));

                    dataRecord[resolvedKey] = valueResult.resolved;
                }
            }
            return dataRecord;
        }
            
        case 'formdata': {
            const entries: SerializedFormDataEntry[] = [];
            
            for (const field of body.formdata) {
                if (field.key && field.key.trim() && !field.disabled) {
                    const keyResult = resolveParameterizedValue(field.key, envVarsMap);
                    keyResult.unresolved.forEach(u => unresolved.add(u));
                    const resolvedKey = keyResult.resolved;

                    if (field.fieldType === 'file' && field.value && typeof field.value === 'object') {
                        // FileReference - resolve to base64 content
                        const fileRef = field.value as FileReference;
                        const fileResult = await resolveFileReference(fileRef, fileAdapter);
                        if (fileResult.isOk) {
                            entries.push({
                                key: resolvedKey,
                                value: fileResult.value,  // base64 encoded
                                fieldType: 'file',
                                fileName: fileRef.fileName,
                                contentType: fileRef.contentType,
                            });
                        } else {
                            console.warn(`Failed to resolve file ${fileRef.fileName}: ${fileResult.error}`);
                        }
                    } else if (field.fieldType === 'text' && typeof field.value === 'string') {
                        const valueResult = resolveParameterizedValue(field.value, envVarsMap);
                        valueResult.unresolved.forEach(u => unresolved.add(u));
                        entries.push({
                            key: resolvedKey,
                            value: valueResult.resolved,
                            fieldType: 'text',
                        });
                    }
                }
            }
            
            return { type: 'formdata', entries };
        }
            
        case 'file': {
            if (body.file) {
                const fileResult = await resolveFileReference(body.file, fileAdapter);
                if (fileResult.isOk) {
                    return {
                        type: 'file',
                        data: fileResult.value,  // base64 encoded
                        fileName: body.file.fileName,
                        contentType: body.file.contentType,
                    };
                }
                console.warn(`Failed to resolve file: ${fileResult.error}`);
            }
            return null;
        }
            
        default:
            return null;
    }
}

/**
 * Gets the Content-Type header value for a CollectionBody
 */
export function getContentTypeForBody(body: CollectionBody | undefined): string | null {
    if (!body || body.mode === 'none') {
        return null;
    }
    
    switch (body.mode) {
        case 'raw':
            const language = body.options?.raw?.language;
            const langMap: Record<string, string> = {
                'json': 'application/json',
                'xml': 'application/xml',
                'html': 'text/html',
                'text': 'text/plain',
                'csv': 'text/csv',
            };
            return language ? langMap[language] || 'text/plain' : 'text/plain';
            
        case 'urlencoded':
            return 'application/x-www-form-urlencoded';
            
        case 'formdata':
            // Let the browser set this with the boundary
            return null;
            
        case 'file':
            return body.file?.contentType || 'application/octet-stream';
            
        default:
            return null;
    }
}

// ==================== Auth Validation ====================

/**
 * Validates auth for the request (checks domain, expiry)
 */
export function getAuthForRequest(activeAuth: Auth | null | undefined, requestUrl: string): Auth | null {
    if (!activeAuth || !activeAuth.enabled) {
        return null;
    }
    
    // Check if auth is expired
    if (activeAuth.expiryDate) {
        const expiryTime = new Date(activeAuth.expiryDate).getTime();
        const now = Date.now();
        if (expiryTime <= now) {
            console.warn(`Auth ${activeAuth.name} is expired.`);
            return null;
        }
    }

    // Check domain filters
    if (activeAuth.domainFilters && activeAuth.domainFilters.length > 0) {
        if (!isUrlInDomains(requestUrl, activeAuth.domainFilters)) {
            return null;
        }
    }
    
    return activeAuth;
}

// ==================== URL Utilities ====================

/**
 * Extracts params from a CollectionRequest URL
 */
export function extractParamsFromRequest(request: CollectionRequest): ParamRow[] {
    // Check request.query first (new preferred location)
    if (request.query && request.query.length > 0) {
        return request.query;
    }
    // Fall back to URL query params (backwards compatibility)
    const url = request.url;
    if (typeof url === 'object' && url.query) {
        return url.query;
    }
    return [];
}

/**
 * Gets URL string from CollectionRequest
 */
export function getUrlString(request: CollectionRequest): string {
    const url = request.url;
    if (typeof url === 'string') {
        return url;
    }
    return url.raw || '';
}

// ==================== Main Build Function ====================

/**
 * Builds a prepared HTTP request from a CollectionRequest.
 * Resolves environment variables, validates auth, and prepares the body.
 * @param request The CollectionRequest to build
 * @param environmentId Active environment ID
 * @param environments Available environments
 * @param auths Available auth configurations
 * @param defaultAuthId Default auth ID to use if request doesn't specify one
 * @param dynamicEnvVars Optional dynamic variables (e.g., from flow context) that override environment vars
 * @param fileAdapter Optional file adapter for resolving file references in body
 */
export async function buildHttpRequest(
    request: CollectionRequest,
    environmentId: string | null,
    environments: Environment[],
    auths: Auth[],
    defaultAuthId?: string | null,
    dynamicEnvVars?: Record<string, string>,
    fileAdapter?: IFileAdapter
): Promise<RequestBuildResult> {
    // Build environment variables map with optional dynamic overrides
    const envVarsMap = buildEnvVarsMap(environments, environmentId, dynamicEnvVars);
    const allUnresolved: Set<string> = new Set();

    // Get URL string
    const urlString = getUrlString(request);
    
    // Resolve URL
    const urlResult = resolveParameterizedValue(urlString, envVarsMap);
    urlResult.unresolved.forEach(u => allUnresolved.add(u));
    let finalUrl = urlResult.resolved;
    
    // Add protocol if missing
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
    }

    // Resolve headers
    const headers = getDictFromHeaderRows(request.header || [], envVarsMap, allUnresolved);

    // Determine which auth to use: request-level auth takes precedence over default
    const authId = request.authId || defaultAuthId;
    const activeAuth = authId ? auths.find(a => a.id === authId) || null : null;
    const requestAuth = getAuthForRequest(activeAuth, finalUrl);

    // Resolve params
    const params = extractParamsFromRequest(request);
    const urlParamsObj = getURLSearchParamsFromParamRows(params, envVarsMap, allUnresolved);
    const urlParams = urlParamsObj.toString();

    // Prepare body
    const requestBody = await convertCollectionBodyToHttpPayload(
        request.body,
        envVarsMap,
        allUnresolved,
        fileAdapter
    );

    // Set Content-Type header if not already set
    if (request.body && request.body.mode !== 'none') {
        const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
        if (!contentTypeKey) {
            const contentType = getContentTypeForBody(request.body);
            if (contentType) {
                headers['Content-Type'] = contentType;
            }
        }
    }

    // Check for unresolved placeholders
    if (allUnresolved.size > 0) {
        return {
            unresolved: Array.from(allUnresolved),
            error: `Unresolved placeholders: ${Array.from(allUnresolved).join(', ')}`
        };
    }

    // Remove params from URL (sent separately)
    try {
        const urlObj = new URL(finalUrl);
        urlObj.search = '';
        finalUrl = urlObj.toString();
    } catch {
        // URL parsing failed, use as-is
    }

    return {
        request: {
            id: request.id,
            method: request.method,
            url: finalUrl,
            params: urlParams || undefined,
            headers,
            body: requestBody,
            auth: requestAuth || undefined,
            envVars: Object.fromEntries(envVarsMap)
        }
    };
}
