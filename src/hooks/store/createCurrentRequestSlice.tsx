import { StateCreator } from 'zustand'
import { ParsedRequest, HeaderRow, ParamRow, ResponseData } from '../../types/collection';

interface CurrentRequestSlice {
    id: string;
    name: string | null;
    method: string | null;
    url: string | null;
    params: ParamRow[] | null;
    headers: HeaderRow[] | null;
    body: string | null;
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
    updateBody: (body: string) => void;
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

    handleSendRequest: () => void;
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
        if (param.key.trim()) {
            const key = param.key.trim();
            const value = param.value;
            urlParams.append(key, value);
        }
    });
    
    return urlParams;
};

const createCurrentRequestSlice: StateCreator<CurrentRequestSlice> = (set, get) => ({
    id: Date.now().toString(),
    name: null,
    method: 'GET',
    url: null,
    params: [{ id: `param-${Date.now()}`, key: '', value: '' }],
    headers: [{ id: `header-${Date.now()}`, key: '', value: '' }],
    body: null,
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
        params: request?.params || [{ id: `param-${Date.now()}`, key: '', value: '' }],
        headers: request?.headers || [{ id: `header-${Date.now()}`, key: '', value: '' }],
        body: request?.body,
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
        params: [{ id: `param-${Date.now()}`, key: '', value: '' }],
        headers: [{ id: `header-${Date.now()}`, key: '', value: '' }],
        body: null,
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
            body: body || '',
            params: params || [],
            folderPath: folderPath || []
        };
    },

    // Individual field updaters
    updateMethod: (method) => set({ method: method }),
    updateUrl: (url) => set({ url: url }),
    updateBody: (body) => set({ body: body }),
    updateName: (name) => set({ name: name }),
    updateFolderPath: (folderPath) => set({ folderPath: folderPath }),
    isBodyValidJson: () => {
        const state = get();
        try {
            JSON.parse(state.body || '');
            return true;
        } catch {
            return false;
        }
    },

    // Headers management
    addEmptyHeader: () => {
        const newHeader = { id: `header-${Date.now()}`, key: '', value: '' };
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
            //allow partial updates (handle undefined key/value)
            updatedHeaders[existingHeaderIndex] = { 
                id, 
                key: key ?? updatedHeaders[existingHeaderIndex].key, 
                value: value ?? updatedHeaders[existingHeaderIndex].value 
            };
            //if both key and value are present, add an empty row so UI can show next row to update
            if (updatedHeaders[existingHeaderIndex].key && updatedHeaders[existingHeaderIndex].value) {
                updatedHeaders.push({ id: `header-${Date.now()}`, key: '', value: '' });
            }
            set({ headers: updatedHeaders });
        } else {
            // Add new header
            const newHeaders = [...currentHeaders, { id, key: key || '', value: value || '' }];
            set({ headers: newHeaders });
        }
    },
    removeHeader: (id: string) => {
        const state = get();
        const currentHeaders = state.headers || [];
        const filteredHeaders = currentHeaders.filter(header => header.id !== id);
        if (filteredHeaders.length === 0) {
            filteredHeaders.push({ id: `header-${Date.now()}`, key: '', value: '' });
        }
        set({ headers: filteredHeaders });
    },
    
    // URL Parameters management
    addEmptyParam: () => {
        const newParam = { id: `param-${Date.now()}`, key: '', value: '' };
        set(state => ({ params: [...(state.params || []), newParam] }));
    },
    upsertParam: (id: string, key: string | undefined, value: string | undefined) => {
        const state = get();
        const currentParams = state.params || [];

        // Find existing param by id
        const existingParamIndex = currentParams.findIndex(param => param.id === id);

        if (existingParamIndex !== -1) {
            // Update existing param
            const updatedParams = [...currentParams];
            // Allow partial updates (handle undefined key/value)
            updatedParams[existingParamIndex] = { 
                id, 
                key: key ?? updatedParams[existingParamIndex].key, 
                value: value ?? updatedParams[existingParamIndex].value 
            };
            //if both key and value are present, add an empty row so UI can show next row to update
            if (updatedParams[existingParamIndex].key && updatedParams[existingParamIndex].value) {
                updatedParams.push({ id: `param-${Date.now()}`, key: '', value: '' });
            }
            set({ params: updatedParams });
        } else {
            // Add new param
            const newParams = [...currentParams, { id, key: key || '', value: value || '' }];
            set({ params: newParams });
        }
    },
    removeParam: (id: string) => {
        const state = get();
        const currentParams = state.params || [];
        const filteredParams = currentParams.filter(param => param.id !== id);
        if (filteredParams.length === 0) {
            filteredParams.push({ id: `param-${Date.now()}`, key: '', value: '' });
        }
        set({ params: filteredParams });
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
    handleSendRequest: () => {
        const state = get();
        
        if (!state.method || !state.url) {
            set({ requestError: 'Method and URL are required' });
            return;
        }
        
        if (typeof acquireVsCodeApi === 'undefined') {
            return;
        }

        // Set processing state
        set({ isRequestProcessing: true, isCancelled: false, requestError: null });
        
        // Convert headers and params to expected format
        const headers = state.headers ? getDictFromHeaderRows(state.headers) : {};
        const paramsString = state.params ? getURLSearchParamsFromParamRows(state.params).toString() : '';
        
        // Convert request to the expected format
        const request = { 
            method: state.method, 
            url: state.url, 
            params: paramsString || undefined, 
            headers, 
            body: state.body || undefined
        };
        
        // Send request to VS Code
        const vscode = acquireVsCodeApi();
        vscode.postMessage({ type: 'httpRequest', request });
    }
});

export default createCurrentRequestSlice;
