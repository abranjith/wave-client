import { StateCreator } from 'zustand'
import { ParsedRequest, HeaderRow, ParamRow, ResponseData, RequestBodyType, RequestBodyTextType, FormField, MultiPartFormField, CollectionReference, EnvironmentVariable } from '../../types/collection';
import { parseUrlQueryParams, getContentTypeFromBody, resolveParameterizedValue } from '../../utils/common';
import { FileWithPreview } from '../useFileUpload';

interface RequestTextBody {
    data: string | null;
    textType: RequestBodyTextType | null;
}

interface RequestBinaryBody {
    data: FileWithPreview | null;
    fileName: string | null;
}

interface RequestFormBody {
    data: FormField[] | null;
}

interface RequestMultiPartFormBody {
    data: MultiPartFormField[] | null;
}

interface RequestBody {
    textData: RequestTextBody | null;
    binaryData: RequestBinaryBody | null;
    formData: RequestFormBody | null;
    multiPartFormData: RequestMultiPartFormBody | null;
    currentBodyType: RequestBodyType;
}

interface CurrentRequestSlice {
    id: string;
    name: string | null;
    protocol: string | null;
    method: string | null;
    url: string | null;
    params: ParamRow[] | null;
    headers: HeaderRow[] | null;
    body: RequestBody;
    folderPath: string[] | null;
    responseData: ResponseData | null;
    isRequestProcessing: boolean;
    requestError: string | null;
    isCancelled: boolean;
    collectionRef: CollectionReference | null;
    errorMessage: string;

    // Core request methods
    setCurrentRequest: (request: ParsedRequest | null) => void;
    clearCurrentRequest: () => void;
    getParsedRequest: () => ParsedRequest;

    // Individual field updaters
    updateMethod: (method: string) => void;
    updateProtocol: (protocol: string) => void;
    updateUrl: (url: string) => void;
    updateTextBody: (
        data: string | null,
        bodyTextType: RequestBodyTextType
    ) => void;
    updateBinaryBody: (data: FileWithPreview | null) => void;
    updateFormBody: (data: FormField[] | null) => void;
    updateMultiPartFormBody: (data: MultiPartFormField[] | null) => void;
    updateCurrentBodyType: (bodyType: RequestBodyType) => void;
    updateName: (name: string) => void;
    updateFolderPath: (folderPath: string[]) => void;
    
    // Headers management
    addEmptyHeader: () => void;
    upsertHeader: (id: string, key: string | undefined, value: string | undefined) => void;
    removeHeader: (id: string) => void;
    
    // URL Parameters management
    addEmptyParam: () => void;
    upsertParam: (id: string, key: string | undefined, value: string | undefined) => void;
    removeParam: (id: string) => void;

    // Response management
    setResponseData: (response: ResponseData | null) => void;
    clearResponseData: () => void;
    
    // Cancellation management
    cancelRequest: () => void;
    setIsCancelled: (cancelled: boolean) => void;
    
    // State management
    setIsRequestProcessing: (isLoading: boolean) => void;
    setRequestError: (error: string | null) => void;
    setErrorMessage: (error: string) => void;

    handleSendRequest: (vsCodeApi: any, activeEnvironmentVariables?: EnvironmentVariable[] | null) => void;
}

const getDictFromHeaderRows = (headerRows: HeaderRow[], envVarsMap: Map<string, string>, unresolved: Set<string>): Record<string, string | string[]> => {
    const headers: Record<string, string | string[]> = {};
    
    for (const header of headerRows) {
        if (header.key && header.key.trim() && !header.disabled) {
            // Resolve header key
            const keyResult = resolveParameterizedValue(header.key, envVarsMap);
            keyResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedKey = keyResult.resolved.trim();

            // Resolve header value
            const valueResult = resolveParameterizedValue(header.value, envVarsMap);
            valueResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedValue = valueResult.resolved;

            if (headers[resolvedKey]) {
                // Key already exists, convert to array or add to existing array
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

const getURLSearchParamsFromParamRows = (paramRows: ParamRow[], envVarsMap: Map<string, string>, unresolved: Set<string>): URLSearchParams => {
    const resolvedParams: Array<{key: string, value: string}> = [];
    for (const param of paramRows) {
        if (param.key && param.key.trim() && !param.disabled) {
            // Resolve param key
            const keyResult = resolveParameterizedValue(param.key, envVarsMap);
            keyResult.unresolved.forEach(u => unresolved.add(u));
            const resolvedKey = keyResult.resolved.trim();

            // Resolve param value
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
};

const getParamRowsAsString = (paramRows: ParamRow[]): string => {
    const params: string[] = [];
    paramRows.forEach(param => {
        if (param.key && param.key.trim() && !param.disabled) {
            const key = param.key.trim();
            const value = param.value;
            params.push(`${key}=${value}`);
        }
    });
    return params.join('&');
};

/**
 * Updates the URL with query parameters from param rows
 * Removes existing query params and appends new ones
 */
const updateUrlWithParams = (currentUrl: string | null, paramRows: ParamRow[]): string | null => {
    if (!currentUrl) {
        return currentUrl;
    }
    
    try {
        // Split URL into base and query string without using URL constructor to avoid encoding
        const questionMarkIndex = currentUrl.indexOf('?');
        const baseUrl = questionMarkIndex !== -1 ? currentUrl.substring(0, questionMarkIndex) : currentUrl;
        
        // Get params string from param rows
        const searchString = getParamRowsAsString(paramRows);
        
        // Reconstruct URL with new params
        if (searchString) {
            return `${baseUrl}?${searchString}`;
        }
        
        return baseUrl;
    } catch (e) {
        // If URL is invalid, return as-is
        return currentUrl;
    }
};

/**
 * Converts the body data to the appropriate format for the HTTP request
 * based on the body type.
 */
async function convertBodyToRequestBody(
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
            // Text-based content types are sent as strings
            let txtBody = body.textData?.data || null;
            if (txtBody) {
                const bodyResult = resolveParameterizedValue(txtBody, envVarsMap);
                bodyResult.unresolved.forEach(u => unresolved.add(u));
                txtBody = bodyResult.resolved;
            }
            return txtBody;
            
        case 'binary':
            // Binary data from file upload
            const binaryData = body.binaryData?.data;
            if (binaryData && binaryData.file instanceof File) {
                // Convert File to ArrayBuffer
                return await binaryData.file.arrayBuffer();
            }
            return null;
            
        case 'multipart':
            // FormData is sent as-is
            const multiPartData = body.multiPartFormData?.data;
            
            if (multiPartData instanceof FormData) {
                return multiPartData;
            }
            //construct FormData from MultiPartFormField[]
            if (Array.isArray(multiPartData)) {
                const formData = new FormData();
                for (const field of multiPartData) {
                    if (field.key && field.key.trim()) {
                        // Resolve key
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
            // URL-encoded form data should be a Record
            const urlEncodedFormData = body.formData?.data;
            if (urlEncodedFormData) {
                const formFields = Array.isArray(urlEncodedFormData) ? urlEncodedFormData as FormField[] : [];
                const dataRecord: Record<string, string> = {};
                for (const field of formFields) {
                    if (field.key && field.key.trim() && field.value !== undefined) {
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
            // Default to string for unknown types
            let defaultTxtBody = body.textData?.data || null;
            if (defaultTxtBody) {
                const bodyResult = resolveParameterizedValue(defaultTxtBody, envVarsMap);
                bodyResult.unresolved.forEach(u => unresolved.add(u));
                defaultTxtBody = bodyResult.resolved;
            }
            return defaultTxtBody;
    }
}

function emptyFormField(): FormField {
    return { id: crypto.randomUUID(), key: '', value: '' };
}

function emptyMultiPartFormField(): MultiPartFormField {
    return { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' };
}

const createCurrentRequestSlice: StateCreator<CurrentRequestSlice> = (set, get) => ({
    id: crypto.randomUUID(),
    name: null,
    method: 'GET',
    protocol: 'https',
    url: null,
    params: [{ id: `param-${crypto.randomUUID()}`, key: '', value: '', disabled: false }],
    headers: [{ id: `header-${crypto.randomUUID()}`, key: '', value: '', disabled: false }],
    body: {
        textData: null,
        binaryData: null,
        formData: {data: [emptyFormField()]},
        multiPartFormData: {data: [emptyMultiPartFormField()]},
        currentBodyType: 'none'
    },
    folderPath: null,
    responseData: null,
    isRequestProcessing: false,
    requestError: null,
    isCancelled: false,
    collectionRef: null,
    errorMessage: '',

    setCurrentRequest: (request) => set({
        id: request?.id ? request.id : crypto.randomUUID(),
        name: request?.name,
        method: request?.method,
        url: request?.url,
        params: (request?.params && request?.params.length > 0) ? request.params : [{ id: `param-${crypto.randomUUID()}`, key: '', value: '', disabled: false }],
        headers: (request?.headers && request?.headers.length > 0) ? request.headers : [{ id: `header-${crypto.randomUUID()}`, key: '', value: '', disabled: false }],
        body: request?.body ? {
            textData: { data: (request.body && typeof request.body === 'string') ? request.body : null, textType: 'text' },
            binaryData: null,
            formData: {data: [emptyFormField()]},
            multiPartFormData: {data: [emptyMultiPartFormField()]},
            currentBodyType: 'text'
        } : {
            textData: null,
            binaryData: null,
            formData: {data: [emptyFormField()]},
            multiPartFormData: {data: [emptyMultiPartFormField()]},
            currentBodyType: 'none'
        },
        folderPath: getRequestFolderPath(request),
        responseData: null,
        isRequestProcessing: false,
        requestError: null,
        isCancelled: false,
        collectionRef: request?.sourceRef ? request.sourceRef : null
    }),
    clearCurrentRequest: () => set({
        name: null,
        method: 'GET',
        url: null,
        params: [{ id: `param-${crypto.randomUUID()}`, key: '', value: '', disabled: false }],
        headers: [{ id: `header-${crypto.randomUUID()}`, key: '', value: '', disabled: false }],
        body: {
            textData: null,
            binaryData: null,
            formData: {data: [emptyFormField()]},
            multiPartFormData: {data: [emptyMultiPartFormField()]},
            currentBodyType: 'none'
        },
        folderPath: null,
        responseData: null,
        isRequestProcessing: false,
        requestError: null,
        isCancelled: false
    }),
    //TODO - needs to be updated to hande non text body
    getParsedRequest: () => {
        const state = get();
        const { id, name, method, url, headers, body, params, folderPath } = state;
        return {
            id,
            name: name || '',
            method: method || 'GET',
            url: url || '',
            headers: headers || [],
            body: body?.textData?.data ? body.textData.data : null,
            params: params || [],
            sourceRef: state.collectionRef || { collectionFilename: '', collectionName: '', itemPath: folderPath ? folderPath : [] }
        };
    },

    // Individual field updaters
    updateMethod: (method) => set({ method: method }),

    // Update protocol (http/https)
    updateProtocol: (protocol) => {
        const state = get();
        const newProtocol = protocol.toLowerCase();
        let currentUrl = state.url || '';
        
        try {
            // Update the protocol state
            set({ protocol: newProtocol });
            
            // If URL is empty or just a protocol, set it to the new protocol
            if (!currentUrl || currentUrl === `${state.protocol}://`) {
                set({ url: `${newProtocol}://` });
                return;
            }

            // If URL has a protocol, replace it
            const urlParts = currentUrl.split('://');
            if (urlParts.length > 1) {
                const urlWithoutProtocol = urlParts.slice(1).join('://');
                set({ url: `${newProtocol}://${urlWithoutProtocol}` });
            } else {
                // URL doesn't have protocol, add it
                set({ url: `${newProtocol}://${currentUrl}` });
            }
        } catch (error) {
            console.error('Error updating protocol:', error);
        }
    },

    updateUrl: (url) => {
        const state = get();
        
        // If URL is empty, clear params as well
        if (!Boolean(url)) {
            set({ url: '', params: [{ id: `param-${crypto.randomUUID()}`, key: '', value: '', disabled: false }]});
            return;
        }
        
        // Construct full URL with protocol for parsing
        let fullUrl = url;
        const urlParts = url.split('://');
        
        // Check if URL already has a protocol
        if (urlParts.length > 1) {
            // URL has protocol, update the protocol state
            set({ protocol: urlParts[0].toLowerCase() });
            fullUrl = url;
        } else {
            // URL doesn't have protocol, use current protocol from state
            fullUrl = `${state.protocol}://${url}`;
        }
        
        // Parse query params from the full URL
        const parsedParams = parseUrlQueryParams(fullUrl);
        
        // Store the full URL with protocol and update params if any were found
        if (parsedParams.length > 0) {
            set({ url: fullUrl, params: parsedParams });
        } else {
            set({ url: fullUrl });
        }
    },

    //implement update methods for different body types
    updateTextBody: (data, bodyTextType) => {
        set(state => ({
            body: {
                ...state.body,
                textData: { data: data, textType: bodyTextType },
            }
        }));
    },
    updateBinaryBody: (data) => {
        set(state => ({
            body: {
            ...state.body,
            binaryData: { data: data, fileName: data ? data.file.name : null },
            }
        }));
    },
    updateFormBody: (data) => {
        // If data is null or empty array, add an empty row
        const formData = data && data.length > 0 ? data : [{ id: crypto.randomUUID(), key: '', value: '' }];
        
        set(state => ({
            body: {
            ...state.body,
            formData: { data: formData },
            }
        }));
    },
    updateMultiPartFormBody: (data) => {
        // If data is null or empty array, add an empty row
        const multiPartFormData = data && data.length > 0 ? data : [{ id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' as const }];
        
        set(state => ({
            body: {
            ...state.body,
            multiPartFormData: { data: multiPartFormData },
            }
        }));
    },
    updateCurrentBodyType: (bodyType) => {
        const state = get();
        let updatedBody = { ...state.body, currentBodyType: bodyType };
        set({ body: updatedBody });
    },

    updateName: (name) => set({ name: name }),
    updateFolderPath: (folderPath) => set({ folderPath: folderPath }),

    // Headers management
    addEmptyHeader: () => {
        const newHeader = { id: `header-${crypto.randomUUID()}`, key: '', value: '', disabled: false };
        set(state => ({ headers: [...(state.headers || []), newHeader] }));
    },
    upsertHeader: (id: string, key: string | undefined, value: string | undefined) => {
        const state = get();
        const currentHeaders = state.headers || [];
        
        // Find existing header by id
        const existingHeaderIndex = currentHeaders.findIndex(header => header.id === id);
        
        if (existingHeaderIndex !== -1) {
            // Update existing header
            const updatedHeaders = [...currentHeaders];
            // Allow partial updates (handle undefined key/value)
            updatedHeaders[existingHeaderIndex] = { 
                id, 
                key: key ?? updatedHeaders[existingHeaderIndex].key, 
                value: value ?? updatedHeaders[existingHeaderIndex].value,
                disabled: false
            };
            set({ headers: updatedHeaders });
        } else {
            // Add new header
            const newHeaders = [...currentHeaders, { id, key: key || '', value: value || '', disabled: false }];
            set({ headers: newHeaders });
        }
    },
    removeHeader: (id: string) => {
        const state = get();
        const currentHeaders = state.headers || [];
        const filteredHeaders = currentHeaders.filter(header => header.id !== id);
        if (filteredHeaders.length === 0) {
            filteredHeaders.push({ id: `header-${crypto.randomUUID()}`, key: '', value: '', disabled: false });
        }
        set({ headers: filteredHeaders });
    },
    
    // URL Parameters management
    addEmptyParam: () => {
        const state = get();
        const newParam = { id: `param-${crypto.randomUUID()}`, key: '', value: '', disabled: false };
        const updatedParams = [...(state.params || []), newParam];
        const updatedUrl = updateUrlWithParams(state.url, updatedParams);
        
        set({ params: updatedParams, url: updatedUrl });
    },
    upsertParam: (id: string, key: string | undefined, value: string | undefined) => {
        const state = get();
        const currentParams = state.params || [];

        // Find existing param by id
        const existingParamIndex = currentParams.findIndex(param => param.id === id);

        let updatedParams: ParamRow[];
        if (existingParamIndex !== -1) {
            // Update existing param
            updatedParams = [...currentParams];
            // Allow partial updates (handle undefined key/value)
            updatedParams[existingParamIndex] = { 
                id, 
                key: key ?? updatedParams[existingParamIndex].key, 
                value: value ?? updatedParams[existingParamIndex].value,
                disabled: false
            };
        } else {
            // Add new param
            updatedParams = [...currentParams, { id, key: key || '', value: value || '', disabled: false }];
        }
        
        // Update URL with new params
        const updatedUrl = updateUrlWithParams(state.url, updatedParams);
        
        set({ params: updatedParams, url: updatedUrl });
    },
    removeParam: (id: string) => {
        const state = get();
        const currentParams = state.params || [];
        let filteredParams = currentParams.filter(param => param.id !== id);
        if (filteredParams.length === 0) {
            filteredParams.push({ id: `param-${crypto.randomUUID()}`, key: '', value: '', disabled: false });
        }
        
        // Update URL with remaining params
        const updatedUrl = updateUrlWithParams(state.url, filteredParams);
        
        set({ params: filteredParams, url: updatedUrl });
    },

    // Response management
    setResponseData: (response) => set({ responseData: response }),
    clearResponseData: () => set({ responseData: null }),
    
    // Cancellation management
    cancelRequest: () => set({ 
        isCancelled: true, 
        isRequestProcessing: false,
        requestError: 'Request cancelled by user' 
    }),
    setIsCancelled: (cancelled) => set({ isCancelled: cancelled }),
    
    // State management
    setIsRequestProcessing: (isProcessing) => set({ isRequestProcessing: isProcessing }),
    setRequestError: (error) => set({ requestError: error }),
    setErrorMessage: (error) => set({ errorMessage: error }),

    //Add method to start Processing request
    handleSendRequest: async (vsCodeApi, activeEnvironmentVariables) => {
        const state = get();
        
        if (!state.method || !state.url) {
            set({ requestError: 'Method and URL are required' });
            return;
        }
        
        if (typeof vsCodeApi === 'undefined') {
            return;
        }

        // Create environment variables map from active environment
        const envVarsMap = new Map<string, string>();
        if (activeEnvironmentVariables) {
            activeEnvironmentVariables.forEach(variable => {
                if (variable.enabled) {
                    envVarsMap.set(variable.key, variable.value);
                }
            });
        }

        // Track all unresolved placeholders
        const allUnresolved: Set<string> = new Set();

        // Set processing state and reset error message
        set({ isRequestProcessing: true, isCancelled: false, requestError: null, errorMessage: '' });
        
        // Resolve URL
        const urlResult = resolveParameterizedValue(state.url, envVarsMap);
        urlResult.unresolved.forEach(u => allUnresolved.add(u));
        let finalUrl = urlResult.resolved;

        // Resolve and convert headers
        const headers = getDictFromHeaderRows(state.headers || [], envVarsMap, allUnresolved);

        // If headers does not have content-type and body is present, set content-type from body
        if (state.body && state.body.currentBodyType !== 'none') {
            const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
            if (!contentTypeKey) {
                const contentType = getContentTypeFromBody(state.body.currentBodyType, state.body?.binaryData?.fileName, state.body?.textData?.textType);
                if(contentType){
                    headers['Content-Type'] = contentType;
                }
            }
        }

        // Resolve and convert params to URLSearchParams
        const urlParams = state.params ? getURLSearchParamsFromParamRows(state.params, envVarsMap, allUnresolved).toString() : '';
        
        // Prepare body based on body type and resolve placeholders
        let requestBody: string | ArrayBuffer | FormData | Record<string, string> | null = null;
        if (state.body && state.body.currentBodyType !== 'none') {
            requestBody = await convertBodyToRequestBody(state.body, state.body.currentBodyType, envVarsMap, allUnresolved);
        }

        // Check if there are any unresolved placeholders
        if (allUnresolved.size > 0) {
            const unresolvedList = Array.from(allUnresolved).slice(0, 3).join(', ') + (allUnresolved.size > 3 ? '...' : '');
            const errorMsg = `Request has unresolved placeholders: ${unresolvedList}. Please resolve them and try again.`;
            set({ 
                errorMessage: errorMsg,
                isRequestProcessing: false
            });
            return;
        }
        
        // Convert request to the expected format
        let serializableBody = requestBody;
        // Convert FormData to a serializable format
        if (requestBody instanceof FormData) {
            const formDataEntries: Array<{ key: string; value: string | File }> = [];
            requestBody.forEach((value, key) => {
                formDataEntries.push({ key, value });
            });
            serializableBody = { type: 'formdata', entries: formDataEntries } as any;
        }

        //if url is missing protocol, prepend protocol
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = `${state.protocol}://${finalUrl}`;
        }
        //remove params from url if present as it is being sent separately as paramsString (also url encode)
        const urlObj = new URL(finalUrl);
        urlObj.search = '';
        finalUrl = urlObj.toString();

        const request = { 
            method: state.method, 
            url: finalUrl, 
            params: urlParams || undefined, 
            headers, 
            body: serializableBody
        };
        
        // Send request to VS Code
        vsCodeApi.postMessage({ type: 'httpRequest', request, id: state.id });
    }
});

export default createCurrentRequestSlice;

function getRequestFolderPath(request: ParsedRequest | null): string[] | null | undefined {
    let fullFolderPath: string[] = [];
    if (request?.sourceRef) {
        if(request.sourceRef.collectionName){
            fullFolderPath.push(request.sourceRef.collectionName);
        }
        if(request.sourceRef.itemPath){
            fullFolderPath.push(...request.sourceRef.itemPath);
        }
    }
    return fullFolderPath;
}
