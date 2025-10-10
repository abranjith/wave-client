import { StateCreator } from 'zustand'
import { ParsedRequest, HeaderRow, ParamRow, ResponseData, RequestBodyType, RequestBodyTextType, FormField, MultiPartFormField } from '../../types/collection';
import { parseUrlQueryParams, getContentTypeFromBody } from '../../utils/utils';
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

    // Core request methods
    setCurrentRequest: (request: ParsedRequest | null) => void;
    clearCurrentRequest: () => void;
    getParsedRequest: () => ParsedRequest;

    // Individual field updaters
    updateMethod: (method: string) => void;
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

    handleSendRequest: (vsCodeApi: any) => void;
}

const getDictFromHeaderRows = (headerRows: HeaderRow[]): Record<string, string | string[]> => {
    const headers: Record<string, string | string[]> = {};
    
    headerRows.forEach(header => {
      if (header.key.trim()) {
        const key = header.key.trim();
        const value = header.value;

        if (headers[key]) {
          // Key already exists, convert to array or add to existing array
          if (Array.isArray(headers[key])) {
            (headers[key] as string[]).push(value);
          } else {
            headers[key] = [headers[key] as string, value];
          }
        } else {
          headers[key] = value;
        }
      }
    });
    return headers;
}

const getURLSearchParamsFromParamRows = (paramRows: ParamRow[]): URLSearchParams => {
    const urlParams = new URLSearchParams();
    
    paramRows.forEach(param => {
        if (param.key.trim() && !param.disabled) {
            const key = param.key.trim();
            const value = param.value;
            urlParams.append(key, value);
        }
    });
    
    return urlParams;
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
        // Parse the URL to get base URL without query params
        const urlObj = new URL(currentUrl);
        
        // Clear existing search params
        urlObj.search = '';
        
        // Add params from param rows (URL-encoded automatically by URLSearchParams)
        const searchParams = getURLSearchParamsFromParamRows(paramRows);
        const searchString = searchParams.toString();
        
        if (searchString) {
            urlObj.search = searchString;
        }
        
        return urlObj.toString();
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
    bodyType: RequestBodyType
): Promise<string | FormData | Record<string, string> | ArrayBuffer | null> {
    if (!body) {
        return null;
    }
    
    switch (bodyType) {
        case 'none':
            return null;
            
        case 'text':
            // Text-based content types are sent as strings
            return body.textData?.data || null;
            
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
                multiPartData.forEach(field => {
                    if (field.key.trim()) {
                        //if file field and value is File, append as file
                        if (field.value instanceof File) {
                            formData.append(field.key, field.value, field.value.name);
                        } else if (field.value !== undefined) {
                            formData.append(field.key, field.value || '');
                        }
                    }
                });
                return formData;
            }
            return null;
            
        case 'form':
            // URL-encoded form data should be a Record
            const urlEncodedFormData = body.formData?.data;
            if (urlEncodedFormData) {
                const formFields = Array.isArray(urlEncodedFormData) ? urlEncodedFormData as FormField[] : [];
                const dataRecord: Record<string, string> = {};
                formFields.forEach(field => {
                    if (field.key.trim() && field.value !== undefined) {
                        dataRecord[field.key] = field.value || '';
                    }
                });
                return dataRecord;
            }
            return null;
            
        default:
            // Default to string for unknown types
            return body.textData?.data || null;
    }
}

function emptyFormField(): FormField {
    return { id: crypto.randomUUID(), key: '', value: '' };
}

function emptyMultiPartFormField(): MultiPartFormField {
    return { id: crypto.randomUUID(), key: '', value: '', fieldType: 'text' };
}

const createCurrentRequestSlice: StateCreator<CurrentRequestSlice> = (set, get) => ({
    id: Date.now().toString(),
    name: null,
    method: 'GET',
    url: null,
    params: [{ id: `param-${Date.now()}`, key: '', value: '', disabled: false }],
    headers: [{ id: `header-${Date.now()}`, key: '', value: '', disabled: false }],
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

    //TODO
    // Core request setters
    setCurrentRequest: (request) => set({
        id: request?.id ? request.id : Date.now().toString(),
        name: request?.name,
        method: request?.method,
        url: request?.url,
        params: (request?.params && request?.params.length > 0) ? request.params : [{ id: `param-${Date.now()}`, key: '', value: '', disabled: false }],
        headers: (request?.headers && request?.headers.length > 0) ? request.headers : [{ id: `header-${Date.now()}`, key: '', value: '', disabled: false }],
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
        folderPath: request?.folderPath,
        responseData: null,
        isRequestProcessing: false,
        requestError: null,
        isCancelled: false
    }),
    clearCurrentRequest: () => set({
        name: null,
        method: 'GET',
        url: null,
        params: [{ id: `param-${Date.now()}`, key: '', value: '', disabled: false }],
        headers: [{ id: `header-${Date.now()}`, key: '', value: '', disabled: false }],
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
    //TODO - needs to be updated
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
            folderPath: folderPath || []
        };
    },

    // Individual field updaters
    updateMethod: (method) => set({ method: method }),
    updateUrl: (url) => {
        // Parse query params from the URL
        const parsedParams = parseUrlQueryParams(url);
        
        if(parsedParams.length > 0) {
            set({ url: url, params: parsedParams });
            return;
        }
        //in case url is being cleared(empty string), clear params as well
        if(!Boolean(url)) {
            set({ url: url, params: [{ id: `param-${Date.now()}`, key: '', value: '', disabled: false }]});
            return;
        }
        set({ url: url});
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
        const newHeader = { id: `header-${Date.now()}`, key: '', value: '', disabled: false };
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
            filteredHeaders.push({ id: `header-${Date.now()}`, key: '', value: '', disabled: false });
        }
        set({ headers: filteredHeaders });
    },
    
    // URL Parameters management
    addEmptyParam: () => {
        const state = get();
        const newParam = { id: `param-${Date.now()}`, key: '', value: '', disabled: false };
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
            filteredParams.push({ id: `param-${Date.now()}`, key: '', value: '', disabled: false });
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

    //Add method to start Processing request
    handleSendRequest: async (vsCodeApi) => {
        const state = get();
        
        if (!state.method || !state.url) {
            set({ requestError: 'Method and URL are required' });
            return;
        }
        
        if (typeof vsCodeApi === 'undefined') {
            return;
        }

        // Set processing state
        set({ isRequestProcessing: true, isCancelled: false, requestError: null });
        
        // Convert headers and params to expected format
        const headers = state.headers ? getDictFromHeaderRows(state.headers) : {};
        //if headers does not have content-type and body is present, set content-type from body
        if (state.body && state.body.currentBodyType !== 'none') {
            const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
            if (!contentTypeKey) {
                const contentType = getContentTypeFromBody(state.body.currentBodyType, state.body?.binaryData?.fileName, state.body?.textData?.textType);
                if(contentType){
                    headers['Content-Type'] = contentType;
                }
            }
        }
        const paramsString = state.params ? getURLSearchParamsFromParamRows(state.params).toString() : '';
        
        // Prepare body based on body type
        let requestBody: string | ArrayBuffer | FormData | Record<string, string> | null = null;
        
        if (state.body && state.body.currentBodyType !== 'none') {
            requestBody = await convertBodyToRequestBody(state.body, state.body.currentBodyType);
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
        
        const request = { 
            method: state.method, 
            url: state.url, 
            params: paramsString || undefined, 
            headers, 
            body: serializableBody
        };
        
        // Send request to VS Code
        vsCodeApi.postMessage({ type: 'httpRequest', request });
    }
});

export default createCurrentRequestSlice;
