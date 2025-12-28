/**
 * Request Builder Utility
 * Shared logic for preparing HTTP requests with environment variable resolution,
 * auth handling, and body conversion.
 */

import { 
    HeaderRow, 
    ParamRow, 
    RequestBodyType, 
    FormField, 
    Environment,
    CollectionRequest
} from '../types/collection';
import { RequestBody } from '../types/tab';
import { Auth } from '../hooks/store/createAuthSlice';
import { resolveParameterizedValue, getContentTypeFromBody, isUrlInDomains } from './common';

// ==================== Types ====================

export interface PreparedHttpRequest {
    id: string;
    method: string;
    url: string;
    params?: string;
    headers: Record<string, string | string[]>;
    body: any;
    auth?: Auth;
    envVars: Record<string, string>;
}

export interface RequestBuildResult {
    request?: PreparedHttpRequest;
    error?: string;
    unresolved?: string[];
}

export interface CollectionRequestInput {
    id: string;
    name: string;
    method: string;
    url: string;
    headers?: HeaderRow[];
    params?: ParamRow[];
    body?: RequestBody | string | null;
    authId?: string | null;
    protocol?: string;
    request?: CollectionRequest; // Original collection request for body extraction
}

// ==================== Helper Functions ====================

/**
 * Creates environment variables map from global and active environment
 */
export function buildEnvVarsMap(environments: Environment[], environmentId: string | null): Map<string, string> {
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

/**
 * Converts the body data to the appropriate format for the HTTP request
 */
export async function convertBodyToRequestBody(
    body: RequestBody,
    bodyType: RequestBodyType,
    envVarsMap: Map<string, string>,
    unresolved: Set<string>
): Promise<string | FormData | Record<string, string> | ArrayBuffer | null> {
    if (!body) {
        return null;
    }
    
    switch (bodyType) {
        case 'none':
            return null;
            
        case 'text':
            let txtBody = body.textData?.data || null;
            if (txtBody) {
                const bodyResult = resolveParameterizedValue(txtBody, envVarsMap);
                bodyResult.unresolved.forEach(u => unresolved.add(u));
                txtBody = bodyResult.resolved;
            }
            return txtBody;
            
        case 'binary':
            const binaryData = body.binaryData?.data;
            if (binaryData && binaryData.file instanceof File) {
                return await binaryData.file.arrayBuffer();
            }
            return null;
            
        case 'multipart':
            const multiPartData = body.multiPartFormData?.data;
            
            if (multiPartData instanceof FormData) {
                return multiPartData;
            }
            if (Array.isArray(multiPartData)) {
                const formData = new FormData();
                for (const field of multiPartData) {
                    if (field.key && field.key.trim() && !field.disabled) {
                        const keyResult = resolveParameterizedValue(field.key, envVarsMap);
                        keyResult.unresolved.forEach(u => unresolved.add(u));
                        const resolvedKey = keyResult.resolved;

                        if (field.value instanceof File) {
                            formData.append(resolvedKey, field.value, field.value.name);
                        } else if (field.value !== undefined) {
                            const valueResult = resolveParameterizedValue(field.value || '', envVarsMap);
                            valueResult.unresolved.forEach(u => unresolved.add(u));
                            formData.append(resolvedKey, valueResult.resolved);
                        }
                    }
                }
                return formData;
            }
            return null;
            
        case 'form':
            const urlEncodedFormData = body.formData?.data;
            if (urlEncodedFormData) {
                const formFields = Array.isArray(urlEncodedFormData) ? urlEncodedFormData as FormField[] : [];
                const dataRecord: Record<string, string> = {};
                for (const field of formFields) {
                    if (field.key && field.key.trim() && field.value !== undefined && !field.disabled) {
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
            return null;
            
        default:
            let defaultTxtBody = body.textData?.data || null;
            if (defaultTxtBody) {
                const bodyResult = resolveParameterizedValue(defaultTxtBody, envVarsMap);
                bodyResult.unresolved.forEach(u => unresolved.add(u));
                defaultTxtBody = bodyResult.resolved;
            }
            return defaultTxtBody;
    }
}

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

/**
 * Extracts body content from a collection request
 */
function extractBodyFromCollectionRequest(request: CollectionRequest | undefined): string | null {
    if (!request?.body) {
        return null;
    }
    
    if (request.body.raw) {
        return request.body.raw;
    }
    
    // For urlencoded, convert to string
    if (request.body.urlencoded && Array.isArray(request.body.urlencoded)) {
        const params = new URLSearchParams();
        request.body.urlencoded.forEach(field => {
            if (field.key && !field.disabled) {
                params.append(field.key, field.value || '');
            }
        });
        return params.toString();
    }
    
    return null;
}

/**
 * Determines body type from collection request
 */
function getBodyTypeFromCollectionRequest(request: CollectionRequest | undefined): RequestBodyType {
    if (!request?.body) {
        return 'none';
    }
    
    switch (request.body.mode) {
        case 'raw':
            return 'text';
        case 'urlencoded':
            return 'form';
        case 'formdata':
            return 'multipart';
        case 'file':
            return 'binary';
        default:
            return 'none';
    }
}

// ==================== Main Build Function ====================

/**
 * Builds a prepared HTTP request from collection request input.
 * Resolves environment variables, validates auth, and prepares the body.
 */
export async function buildHttpRequest(
    input: CollectionRequestInput,
    environmentId: string | null,
    environments: Environment[],
    auths: Auth[],
    defaultAuthId?: string | null
): Promise<RequestBuildResult> {
    // Build environment variables map
    const envVarsMap = buildEnvVarsMap(environments, environmentId);
    const allUnresolved: Set<string> = new Set();

    // Resolve URL
    const urlResult = resolveParameterizedValue(input.url, envVarsMap);
    urlResult.unresolved.forEach(u => allUnresolved.add(u));
    let finalUrl = urlResult.resolved;
    
    // Add protocol if missing
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = input.protocol ? `${input.protocol}://${finalUrl}` : `https://${finalUrl}`;
    }

    // Resolve headers
    const headers = getDictFromHeaderRows(input.headers || [], envVarsMap, allUnresolved);

    // Determine which auth to use: request-level auth takes precedence over default
    const authId = input.authId || defaultAuthId;
    const activeAuth = authId ? auths.find(a => a.id === authId) || null : null;
    const requestAuth = getAuthForRequest(activeAuth, finalUrl);

    // Resolve params
    const urlParamsObj = input.params 
        ? getURLSearchParamsFromParamRows(input.params, envVarsMap, allUnresolved) 
        : new URLSearchParams();
    const urlParams = urlParamsObj.toString();

    // Prepare body
    let requestBody: string | ArrayBuffer | FormData | Record<string, string> | null = null;
    
    if (input.body && typeof input.body === 'object' && 'currentBodyType' in input.body) {
        // TabData body format
        const tabBody = input.body as RequestBody;
        if (tabBody.currentBodyType !== 'none') {
            // Set content-type if not present
            const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
            if (!contentTypeKey) {
                const contentType = getContentTypeFromBody(
                    tabBody.currentBodyType, 
                    tabBody.binaryData?.fileName, 
                    tabBody.textData?.textType
                );
                if (contentType) {
                    headers['Content-Type'] = contentType;
                }
            }
            requestBody = await convertBodyToRequestBody(tabBody, tabBody.currentBodyType, envVarsMap, allUnresolved);
        }
    } else if (input.request) {
        // Collection request format - extract body
        const bodyType = getBodyTypeFromCollectionRequest(input.request);
        const bodyContent = extractBodyFromCollectionRequest(input.request);
        
        if (bodyContent && bodyType === 'text') {
            const bodyResult = resolveParameterizedValue(bodyContent, envVarsMap);
            bodyResult.unresolved.forEach(u => allUnresolved.add(u));
            requestBody = bodyResult.resolved;
            
            // Set content-type based on body options
            const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
            if (!contentTypeKey && input.request.body?.options?.raw?.language) {
                const langMap: Record<string, string> = {
                    'json': 'application/json',
                    'xml': 'application/xml',
                    'html': 'text/html',
                    'text': 'text/plain'
                };
                const contentType = langMap[input.request.body.options.raw.language];
                if (contentType) {
                    headers['Content-Type'] = contentType;
                }
            }
        } else if (bodyType === 'form' && bodyContent) {
            requestBody = bodyContent;
            const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
            if (!contentTypeKey) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        }
    } else if (typeof input.body === 'string') {
        // Simple string body
        const bodyResult = resolveParameterizedValue(input.body, envVarsMap);
        bodyResult.unresolved.forEach(u => allUnresolved.add(u));
        requestBody = bodyResult.resolved;
    }

    // Check for unresolved placeholders
    if (allUnresolved.size > 0) {
        return {
            unresolved: Array.from(allUnresolved),
            error: `Unresolved placeholders: ${Array.from(allUnresolved).join(', ')}`
        };
    }

    // Serialize FormData if needed
    let serializableBody = requestBody;
    if (requestBody instanceof FormData) {
        const formDataEntries: Array<{ key: string; value: string | File }> = [];
        requestBody.forEach((value, key) => {
            formDataEntries.push({ key, value });
        });
        serializableBody = { type: 'formdata', entries: formDataEntries } as any;
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
            id: input.id,
            method: input.method,
            url: finalUrl,
            params: urlParams || undefined,
            headers,
            body: serializableBody,
            auth: requestAuth || undefined,
            envVars: Object.fromEntries(envVarsMap)
        }
    };
}
