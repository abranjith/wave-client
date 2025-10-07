import { StateCreator } from 'zustand'
import { ParsedRequest, HeaderRow, ParamRow, ResponseData, RequestBodyType, RequestBodyTextType, FormField, MultiPartFormField } from '../../types/collection';
import { parseUrlQueryParams, getContentTypeFromBody } from '../../utils/utils';
import { FileWithPreview } from '../useFileUpload';

type BodyDataType = string | FileWithPreview | MultiPartFormField[] | FormField[] | null;

interface RequestBody {
    data: BodyDataType;
    fileName: string | null;
    contentType: string | null;
    bodyType: RequestBodyType;
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
    updateBody: (
        data: BodyDataType,
        bodyType: RequestBodyType,
        bodyTextType: RequestBodyTextType
    ) => void;
    updateName: (name: string) => void;
    updateFolderPath: (folderPath: string[]) => void;
    isBodyValidJson: () => boolean;

    
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

const getFileFromBinaryBody = (data: BodyDataType, bodyType: RequestBodyType): File | null => {
    if (bodyType === 'binary' && data && typeof data !== 'string' && 'file' in data && data.file instanceof File) {
        return data.file;
    }
    return null;
};


/**
 * Converts the body data to the appropriate format for the HTTP request
 * based on the body type.
 */
async function convertBodyToRequestBody(
    data: BodyDataType,
    bodyType: RequestBodyType
): Promise<string | FormData | Record<string, string> | ArrayBuffer | null> {
    if (!data) {
        return null;
    }
    
    switch (bodyType) {
        case 'none':
            return null;
            
        case 'text':
            // Text-based content types are sent as strings
            return typeof data === 'string' ? data : JSON.stringify(data);
            
        case 'binary':
            // Binary data from file upload
            if (typeof data !== 'string' && 'file' in data && data.file instanceof File) {
                // Convert File to ArrayBuffer
                return await data.file.arrayBuffer();
            }
            return null;
            
        case 'multipart':
            // FormData is sent as-is
            if (data instanceof FormData) {
                return data;
            }
            //construct FormData from MultiPartFormField[]
            if (Array.isArray(data)) {
                const formData = new FormData();
                data.forEach(field => {
                    if (field.key.trim()) {
                        //if file field and value is File, append as file
                        if (field.value instanceof File) {
                            formData.append(field.key, field.value, field.value.name);
                        } else if (field.value !== undefined) {
                            formData.append(field.key, field.value);
                        }
                    }
                });
                return formData;
            }
            return null;
            
        case 'form':
            // URL-encoded form data should be a Record
            if (typeof data === 'object' && !(data instanceof FormData) && !(data instanceof File)) {
                //construct Record<string, string> from FormField[]
                const formFields = Array.isArray(data) ? data as FormField[] : [];
                const dataRecord: Record<string, string> = {};
                formFields.forEach(field => {
                    if (field.key.trim() && field.value !== undefined) {
                        dataRecord[field.key] = field.value;
                    }
                });
                return dataRecord;
            }
            return null;
            
        default:
            // Default to string for unknown types
            return typeof data === 'string' ? data : null;
    }
}

const createCurrentRequestSlice: StateCreator<CurrentRequestSlice> = (set, get) => ({
    id: Date.now().toString(),
    name: null,
    method: 'GET',
    url: null,
    params: [{ id: `param-${Date.now()}`, key: '', value: '', disabled: false }],
    headers: [{ id: `header-${Date.now()}`, key: '', value: '', disabled: false }],
    body: {
        data: '',
        fileName: null,
        contentType: null,
        bodyType: 'none'
    },
    folderPath: null,
    responseData: null,
    isRequestProcessing: false,
    requestError: null,
    isCancelled: false,

    // Core request setters
    setCurrentRequest: (request) => set({
        id: request?.id ? request.id : Date.now().toString(),
        name: request?.name,
        method: request?.method,
        url: request?.url,
        params: (request?.params && request?.params.length > 0) ? request.params : [{ id: `param-${Date.now()}`, key: '', value: '', disabled: false }],
        headers: (request?.headers && request?.headers.length > 0) ? request.headers : [{ id: `header-${Date.now()}`, key: '', value: '', disabled: false }],
        body: request?.body ? {
            data: request.body,
            fileName: null,
            contentType: 'text/plain',
            bodyType: 'text'
        } : {
            data: '',
            fileName: null,
            contentType: null,
            bodyType: 'none'
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
            data: '',
            fileName: null,
            contentType: null,
            bodyType: 'none'
        },
        folderPath: null,
        responseData: null,
        isRequestProcessing: false,
        requestError: null,
        isCancelled: false
    }),
    getParsedRequest: () => {
        const state = get();
        const { id, name, method, url, headers, body, params, folderPath } = state;
        return {
            id,
            name: name || '',
            method: method || 'GET',
            url: url || '',
            headers: headers || [],
            body: typeof body?.data === 'string' ? body.data : null,
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
    updateBody: (data, bodyType, bodyTextType) => {
        let fileName: string | null = null;
        const file = getFileFromBinaryBody(data, bodyType);
        if(Boolean(file)) {
            fileName = file?.name || null;
        }
        
        const contentType = getContentTypeFromBody(bodyType, fileName, bodyTextType);
        
        set({ 
            body: {
                data,
                fileName,
                contentType,
                bodyType
            }
        });
    },
    updateName: (name) => set({ name: name }),
    updateFolderPath: (folderPath) => set({ folderPath: folderPath }),
    isBodyValidJson: () => {
        const state = get();
        try {
            if (typeof state.body?.data === 'string') {
                JSON.parse(state.body.data);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

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
        if (state.body && state.body.bodyType !== 'none' && state.body.contentType) {
            const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
            if (!contentTypeKey) {
                headers['Content-Type'] = state.body.contentType;
            }
        }
        const paramsString = state.params ? getURLSearchParamsFromParamRows(state.params).toString() : '';
        
        // Prepare body based on body type
        let requestBody: string | ArrayBuffer | FormData | Record<string, string> | null = null;
        
        if (state.body && state.body.bodyType !== 'none') {
            requestBody = await convertBodyToRequestBody(state.body.data, state.body.bodyType);
        }
        
        // Convert request to the expected format
        const request = { 
            method: state.method, 
            url: state.url, 
            params: paramsString || undefined, 
            headers, 
            body: requestBody
        };
        
        // Send request to VS Code
        vsCodeApi.postMessage({ type: 'httpRequest', request });
    }
});

export default createCurrentRequestSlice;


