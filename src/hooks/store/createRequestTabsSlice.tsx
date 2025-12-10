/**
 * Request Tabs Slice
 * Manages multiple request tabs with isolated state for each tab.
 * Supports concurrent request processing with proper state isolation.
 */

import { StateCreator } from 'zustand';
import { 
    ParsedRequest, 
    HeaderRow, 
    ParamRow, 
    ResponseData, 
    RequestBodyType, 
    RequestBodyTextType, 
    FormField, 
    MultiPartFormField, 
    CollectionReference, 
    EnvironmentVariable,
    Environment
} from '../../types/collection';
import { 
    TabData, 
    RequestBody,
    TAB_CONSTANTS,
    createEmptyTab,
    createEmptyParamRow,
    createEmptyHeaderRow,
    createEmptyFormField,
    createEmptyMultiPartFormField,
    createEmptyRequestBody,
    RequestSectionTab,
    ResponseSectionTab
} from '../../types/tab';
import { parseUrlQueryParams, getContentTypeFromBody, resolveParameterizedValue, isUrlInDomains } from '../../utils/common';
import { FileWithPreview } from '../useFileUpload';
import { Auth } from './createAuthSlice';

// ==================== Slice Interface ====================

export interface RequestTabsSlice {
    // Tab Management State
    tabs: TabData[];
    activeTabId: string;
    
    // Tab Management Actions
    addTab: () => TabData | null;
    closeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    getActiveTab: () => TabData | undefined;
    getTabById: (tabId: string) => TabData | undefined;
    canAddTab: () => boolean;
    
    // Load request into tab (from collection, history, etc.)
    loadRequestIntoTab: (request: ParsedRequest, targetTabId?: string) => void;
    loadRequestIntoNewTab: (request: ParsedRequest) => TabData | null;
    
    // Clear/Reset tab
    clearActiveTab: () => void;
    clearTab: (tabId: string) => void;
    
    // Get parsed request for saving/history
    getParsedRequest: (tabId?: string) => ParsedRequest;
    
    // Individual field updaters (operate on active tab)
    updateMethod: (method: string) => void;
    updateProtocol: (protocol: string) => void;
    updateUrl: (url: string) => void;
    updateName: (name: string) => void;
    updateFolderPath: (folderPath: string[]) => void;
    
    // Body updaters
    updateTextBody: (data: string | null, bodyTextType: RequestBodyTextType) => void;
    updateBinaryBody: (data: FileWithPreview | null) => void;
    updateFormBody: (data: FormField[] | null) => void;
    updateMultiPartFormBody: (data: MultiPartFormField[] | null) => void;
    updateCurrentBodyType: (bodyType: RequestBodyType) => void;
    
    // Form fields management
    toggleFormFieldEnabled: (id: string, currentDisabled: boolean) => void;
    
    // Multi-part form fields management
    toggleMultiPartFormFieldEnabled: (id: string, currentDisabled: boolean) => void;
    
    // Headers management
    addEmptyHeader: () => void;
    upsertHeader: (id: string, key: string | undefined, value: string | undefined) => void;
    removeHeader: (id: string) => void;
    toggleHeaderEnabled: (id: string, currentDisabled: boolean) => void;
    
    // URL Parameters management
    addEmptyParam: () => void;
    upsertParam: (id: string, key: string | undefined, value: string | undefined) => void;
    removeParam: (id: string) => void;
    toggleParamEnabled: (id: string, currentDisabled: boolean) => void;
    
    // Per-tab Environment & Auth selection
    setTabEnvironment: (environmentId: string | null) => void;
    setTabAuth: (authId: string | null) => void;
    
    // UI State
    setActiveRequestSection: (section: RequestSectionTab) => void;
    setActiveResponseSection: (section: ResponseSectionTab) => void;
    
    // Response management (specific tab by ID for concurrency)
    handleHttpResponse: (tabId: string, response: ResponseData) => void;
    clearResponseData: (tabId?: string) => void;
    
    // Request processing state
    setIsRequestProcessing: (tabId: string, isProcessing: boolean) => void;
    setRequestError: (tabId: string, error: string | null) => void;
    setErrorMessage: (error: string, tabId?: string) => void;
    
    // Cancellation management
    cancelRequest: (tabId?: string) => void;
    setIsCancelled: (tabId: string, cancelled: boolean) => void;
    
    // Dirty tracking
    markTabDirty: (tabId?: string) => void;
    markTabClean: (tabId?: string) => void;
    
    // Send request handler
    handleSendRequest: (
        vsCodeApi: any, 
        environments: Environment[],
        auths: Auth[],
        tabId?: string
    ) => void;
}

// ==================== Helper Functions ====================

/**
 * Updates the URL with query parameters from param rows
 */
const updateUrlWithParams = (currentUrl: string, paramRows: ParamRow[]): string => {
    if (!currentUrl) {
        return currentUrl;
    }
    
    try {
        const questionMarkIndex = currentUrl.indexOf('?');
        const baseUrl = questionMarkIndex !== -1 ? currentUrl.substring(0, questionMarkIndex) : currentUrl;
        
        const params: string[] = [];
        paramRows.forEach(param => {
            if (param.key && param.key.trim() && !param.disabled) {
                params.push(`${param.key.trim()}=${param.value}`);
            }
        });
        const searchString = params.join('&');
        
        if (searchString) {
            return `${baseUrl}?${searchString}`;
        }
        
        return baseUrl;
    } catch (e) {
        return currentUrl;
    }
};

/**
 * Resolves header rows to a dictionary, resolving environment variables
 */
const getDictFromHeaderRows = (
    headerRows: HeaderRow[], 
    envVarsMap: Map<string, string>, 
    unresolved: Set<string>
): Record<string, string | string[]> => {
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
};

/**
 * Converts param rows to URLSearchParams, resolving environment variables
 */
const getURLSearchParamsFromParamRows = (
    paramRows: ParamRow[], 
    envVarsMap: Map<string, string>, 
    unresolved: Set<string>
): URLSearchParams => {
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
};

/**
 * Converts the body data to the appropriate format for the HTTP request
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
 * Gets the folder path from a parsed request
 */
function getRequestFolderPath(request: ParsedRequest | null): string[] {
    const fullFolderPath: string[] = [];
    if (request?.sourceRef) {
        if (request.sourceRef.collectionName) {
            fullFolderPath.push(request.sourceRef.collectionName);
        }
        if (request.sourceRef.itemPath) {
            fullFolderPath.push(...request.sourceRef.itemPath);
        }
    }
    return fullFolderPath;
}

/**
 * Validates auth for the request (checks domain, expiry)
 */
function getAuthForRequest(activeAuth: Auth | null | undefined, requestUrl: string): Auth | null {
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
 * Creates environment variables map from global and active environment
 */
function buildEnvVarsMap(environments: Environment[], environmentId: string | null): Map<string, string> {
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

// ==================== Slice Creator ====================

const createRequestTabsSlice: StateCreator<RequestTabsSlice> = (set, get) => {
    // Create initial tab
    const initialTab = createEmptyTab();
    
    /**
     * Helper to update a specific tab in the tabs array
     */
    const updateTab = (tabId: string, updates: Partial<TabData>) => {
        set(state => ({
            tabs: state.tabs.map(tab => 
                tab.id === tabId ? { ...tab, ...updates } : tab
            )
        }));
    };
    
    /**
     * Helper to update the active tab
     */
    const updateActiveTab = (updates: Partial<TabData>) => {
        const state = get();
        updateTab(state.activeTabId, updates);
    };
    
    /**
     * Helper to get active tab
     */
    const getActiveTabInternal = (): TabData | undefined => {
        const state = get();
        return state.tabs.find(tab => tab.id === state.activeTabId);
    };

    return {
        // Initial State
        tabs: [initialTab],
        activeTabId: initialTab.id,
        
        // ==================== Tab Management ====================
        
        addTab: () => {
            const state = get();
            if (state.tabs.length >= TAB_CONSTANTS.MAX_TABS) {
                console.warn(`Maximum number of tabs (${TAB_CONSTANTS.MAX_TABS}) reached`);
                return null;
            }
            
            const newTab = createEmptyTab();
            set({
                tabs: [...state.tabs, newTab],
                activeTabId: newTab.id
            });
            
            return newTab;
        },
        
        closeTab: (tabId: string) => {
            const state = get();
            
            // Don't close the last tab
            if (state.tabs.length <= 1) {
                // Instead, reset the tab
                const resetTab = createEmptyTab();
                set({
                    tabs: [{ ...resetTab, id: state.tabs[0].id }],
                    activeTabId: state.tabs[0].id
                });
                return;
            }
            
            const tabIndex = state.tabs.findIndex(tab => tab.id === tabId);
            const newTabs = state.tabs.filter(tab => tab.id !== tabId);
            
            // If we're closing the active tab, switch to an adjacent tab
            let newActiveTabId = state.activeTabId;
            if (tabId === state.activeTabId) {
                // Prefer the tab to the left, unless we're closing the first tab
                const newIndex = Math.max(0, tabIndex - 1);
                newActiveTabId = newTabs[newIndex].id;
            }
            
            set({
                tabs: newTabs,
                activeTabId: newActiveTabId
            });
        },
        
        setActiveTab: (tabId: string) => {
            const state = get();
            if (state.tabs.some(tab => tab.id === tabId)) {
                set({ activeTabId: tabId });
            }
        },
        
        getActiveTab: () => {
            return getActiveTabInternal();
        },
        
        getTabById: (tabId: string) => {
            return get().tabs.find(tab => tab.id === tabId);
        },
        
        canAddTab: () => {
            return get().tabs.length < TAB_CONSTANTS.MAX_TABS;
        },
        
        // ==================== Load Request ====================
        
        loadRequestIntoTab: (request: ParsedRequest, targetTabId?: string) => {
            const state = get();
            
            // Determine the tab ID to use
            // Priority: request.id > targetTabId > activeTabId
            const tabId = request.id || targetTabId || state.activeTabId;
            
            // Check if we're updating an existing tab or need to handle duplicates
            const existingTabWithRequestId = request.id 
                ? state.tabs.find(tab => tab.id === request.id)
                : null;
            
            const targetTab = state.tabs.find(tab => tab.id === tabId);
            
            // If request has an ID and there's already a different tab with that ID, remove it
            if (existingTabWithRequestId && existingTabWithRequestId.id !== tabId) {
                const newTabs = state.tabs.filter(tab => tab.id !== request.id);
                set({ tabs: newTabs });
            }
            
            const updatedTabData: Partial<TabData> = {
                id: tabId, // Use request ID as tab ID for proper matching
                name: request.name || TAB_CONSTANTS.DEFAULT_NAME,
                method: request.method || TAB_CONSTANTS.DEFAULT_METHOD,
                url: request.url || '',
                params: (request.params && request.params.length > 0) 
                    ? request.params 
                    : [createEmptyParamRow()],
                headers: (request.headers && request.headers.length > 0) 
                    ? request.headers 
                    : [createEmptyHeaderRow()],
                body: request.body ? {
                    textData: { data: typeof request.body === 'string' ? request.body : null, textType: 'none' },
                    binaryData: null,
                    formData: { data: [createEmptyFormField()] },
                    multiPartFormData: { data: [createEmptyMultiPartFormField()] },
                    currentBodyType: 'text'
                } : createEmptyRequestBody(),
                folderPath: getRequestFolderPath(request),
                collectionRef: request.sourceRef || null,
                responseData: null,
                isRequestProcessing: false,
                requestError: null,
                isCancelled: false,
                errorMessage: '',
                isDirty: false,
            };
            
            // If the target tab exists, update it; otherwise create a new tab with this ID
            if (targetTab) {
                updateTab(tabId, updatedTabData);
            } else {
                // Create a new tab with the request ID
                const newTab: TabData = {
                    ...createEmptyTab(),
                    ...updatedTabData,
                    id: tabId
                } as TabData;
                
                set(state => ({
                    tabs: [...state.tabs, newTab]
                }));
            }
            
            // Make this tab active
            set({ activeTabId: tabId });
        },
        
        loadRequestIntoNewTab: (request: ParsedRequest) => {
            const state = get();
            
            // Check if a tab with this request ID already exists
            if (request.id) {
                const existingTab = state.tabs.find(tab => tab.id === request.id);
                if (existingTab) {
                    // Just activate the existing tab
                    set({ activeTabId: existingTab.id });
                    return existingTab;
                }
            }
            
            if (state.tabs.length >= TAB_CONSTANTS.MAX_TABS) {
                // Load into active tab instead
                get().loadRequestIntoTab(request);
                return getActiveTabInternal() || null;
            }
            
            const newTab = createEmptyTab();
            const updatedTab: TabData = {
                ...newTab,
                id: request.id || newTab.id, // Use request ID as tab ID
                name: request.name || TAB_CONSTANTS.DEFAULT_NAME,
                method: request.method || TAB_CONSTANTS.DEFAULT_METHOD,
                url: request.url || '',
                params: (request.params && request.params.length > 0) 
                    ? request.params 
                    : [createEmptyParamRow()],
                headers: (request.headers && request.headers.length > 0) 
                    ? request.headers 
                    : [createEmptyHeaderRow()],
                body: request.body ? {
                    textData: { data: typeof request.body === 'string' ? request.body : null, textType: 'none' },
                    binaryData: null,
                    formData: { data: [createEmptyFormField()] },
                    multiPartFormData: { data: [createEmptyMultiPartFormField()] },
                    currentBodyType: 'text'
                } : createEmptyRequestBody(),
                folderPath: getRequestFolderPath(request),
                collectionRef: request.sourceRef || null,
            };
            
            set({
                tabs: [...state.tabs, updatedTab],
                activeTabId: updatedTab.id
            });
            
            return updatedTab;
        },
        
        // ==================== Clear/Reset ====================
        
        clearActiveTab: () => {
            const state = get();
            const resetData = createEmptyTab();
            updateTab(state.activeTabId, {
                ...resetData,
                id: state.activeTabId // Keep the same tab ID
            });
        },
        
        clearTab: (tabId: string) => {
            const resetData = createEmptyTab();
            updateTab(tabId, {
                ...resetData,
                id: tabId
            });
        },
        
        // ==================== Get Parsed Request ====================
        
        getParsedRequest: (tabId?: string) => {
            const state = get();
            const tab = tabId 
                ? state.tabs.find(t => t.id === tabId) 
                : getActiveTabInternal();
            
            if (!tab) {
                // Return empty request
                return {
                    id: '',
                    name: '',
                    method: 'GET',
                    url: '',
                    headers: [],
                    params: [],
                    body: null,
                    sourceRef: { collectionFilename: '', collectionName: '', itemPath: [] }
                };
            }
            
            const nonEmptyHeaders = tab.headers?.filter(header => header.key && header.value) || [];
            const nonEmptyParams = tab.params?.filter(param => param.key && param.value) || [];
            
            return {
                id: tab.id,
                name: tab.name || '',
                method: tab.method || 'GET',
                url: tab.url || '',
                headers: nonEmptyHeaders,
                params: nonEmptyParams,
                body: tab.body?.textData?.data || null,
                sourceRef: tab.collectionRef || { 
                    collectionFilename: '', 
                    collectionName: '', 
                    itemPath: tab.folderPath || [] 
                }
            };
        },
        
        // ==================== Field Updaters ====================
        
        updateMethod: (method: string) => {
            updateActiveTab({ method, isDirty: true });
        },
        
        updateProtocol: (protocol: string) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const newProtocol = protocol.toLowerCase();
            let currentUrl = tab.url || '';
            
            try {
                if (!currentUrl || currentUrl === `${tab.protocol}://`) {
                    updateActiveTab({ protocol: newProtocol, url: `${newProtocol}://`, isDirty: true });
                    return;
                }

                const urlParts = currentUrl.split('://');
                if (urlParts.length > 1) {
                    const urlWithoutProtocol = urlParts.slice(1).join('://');
                    updateActiveTab({ protocol: newProtocol, url: `${newProtocol}://${urlWithoutProtocol}`, isDirty: true });
                } else {
                    updateActiveTab({ protocol: newProtocol, url: `${newProtocol}://${currentUrl}`, isDirty: true });
                }
            } catch (error) {
                console.error('Error updating protocol:', error);
            }
        },
        
        updateUrl: (url: string) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            if (!url) {
                updateActiveTab({ 
                    url: '', 
                    params: [createEmptyParamRow()],
                    isDirty: true 
                });
                return;
            }
            
            let fullUrl = url;
            const urlParts = url.split('://');
            
            if (urlParts.length > 1) {
                updateActiveTab({ protocol: urlParts[0].toLowerCase() });
                fullUrl = url;
            } else {
                fullUrl = `${tab.protocol}://${url}`;
            }
            
            const parsedParams = parseUrlQueryParams(fullUrl);
            
            if (parsedParams.length > 0) {
                updateActiveTab({ url: fullUrl, params: parsedParams, isDirty: true });
            } else {
                updateActiveTab({ url: fullUrl, isDirty: true });
            }
        },
        
        updateName: (name: string) => {
            updateActiveTab({ name, isDirty: true });
        },
        
        updateFolderPath: (folderPath: string[]) => {
            updateActiveTab({ folderPath, isDirty: true });
        },
        
        // ==================== Body Updaters ====================
        
        updateTextBody: (data: string | null, bodyTextType: RequestBodyTextType) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            updateActiveTab({
                body: {
                    ...tab.body,
                    textData: { data, textType: bodyTextType }
                },
                isDirty: true
            });
        },
        
        updateBinaryBody: (data: FileWithPreview | null) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            updateActiveTab({
                body: {
                    ...tab.body,
                    binaryData: { data, fileName: data ? data.file.name : null }
                },
                isDirty: true
            });
        },
        
        updateFormBody: (data: FormField[] | null) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const formData = data && data.length > 0 
                ? data 
                : [createEmptyFormField()];
            
            updateActiveTab({
                body: {
                    ...tab.body,
                    formData: { data: formData }
                },
                isDirty: true
            });
        },
        
        updateMultiPartFormBody: (data: MultiPartFormField[] | null) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const multiPartFormData = data && data.length > 0 
                ? data 
                : [createEmptyMultiPartFormField()];
            
            updateActiveTab({
                body: {
                    ...tab.body,
                    multiPartFormData: { data: multiPartFormData }
                },
                isDirty: true
            });
        },
        
        updateCurrentBodyType: (bodyType: RequestBodyType) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            updateActiveTab({
                body: { ...tab.body, currentBodyType: bodyType },
                isDirty: true
            });
        },
        
        // ==================== Form Fields Management ====================
        
        toggleFormFieldEnabled: (id: string, currentDisabled: boolean) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const currentFormData = tab.body.formData?.data || [];
            const updatedFormData = currentFormData.map(field =>
                field.id === id ? { ...field, disabled: !currentDisabled } : field
            );
            
            updateActiveTab({
                body: {
                    ...tab.body,
                    formData: { data: updatedFormData }
                },
                isDirty: true
            });
        },
        
        toggleMultiPartFormFieldEnabled: (id: string, currentDisabled: boolean) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const currentData = tab.body.multiPartFormData?.data || [];
            const updatedData = currentData.map(field =>
                field.id === id ? { ...field, disabled: !currentDisabled } : field
            );
            
            updateActiveTab({
                body: {
                    ...tab.body,
                    multiPartFormData: { data: updatedData }
                },
                isDirty: true
            });
        },
        
        // ==================== Headers Management ====================
        
        addEmptyHeader: () => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const newHeader = createEmptyHeaderRow();
            updateActiveTab({
                headers: [...tab.headers, newHeader],
                isDirty: true
            });
        },
        
        upsertHeader: (id: string, key: string | undefined, value: string | undefined) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const currentHeaders = tab.headers || [];
            const existingIndex = currentHeaders.findIndex(h => h.id === id);
            
            if (existingIndex !== -1) {
                const updatedHeaders = [...currentHeaders];
                updatedHeaders[existingIndex] = {
                    id,
                    key: key ?? updatedHeaders[existingIndex].key,
                    value: value ?? updatedHeaders[existingIndex].value,
                    disabled: false
                };
                updateActiveTab({ headers: updatedHeaders, isDirty: true });
            } else {
                const newHeaders = [...currentHeaders, { id, key: key || '', value: value || '', disabled: false }];
                updateActiveTab({ headers: newHeaders, isDirty: true });
            }
        },
        
        removeHeader: (id: string) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            let filteredHeaders = tab.headers.filter(h => h.id !== id);
            if (filteredHeaders.length === 0) {
                filteredHeaders = [createEmptyHeaderRow()];
            }
            updateActiveTab({ headers: filteredHeaders, isDirty: true });
        },
        
        toggleHeaderEnabled: (id: string, currentDisabled: boolean) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const updatedHeaders = tab.headers.map(h =>
                h.id === id ? { ...h, disabled: !currentDisabled } : h
            );
            updateActiveTab({ headers: updatedHeaders, isDirty: true });
        },
        
        // ==================== Params Management ====================
        
        addEmptyParam: () => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const newParam = createEmptyParamRow();
            const updatedParams = [...tab.params, newParam];
            const updatedUrl = updateUrlWithParams(tab.url, updatedParams);
            
            updateActiveTab({
                params: updatedParams,
                url: updatedUrl,
                isDirty: true
            });
        },
        
        upsertParam: (id: string, key: string | undefined, value: string | undefined) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const currentParams = tab.params || [];
            const existingIndex = currentParams.findIndex(p => p.id === id);
            
            let updatedParams: ParamRow[];
            if (existingIndex !== -1) {
                updatedParams = [...currentParams];
                updatedParams[existingIndex] = {
                    id,
                    key: key ?? updatedParams[existingIndex].key,
                    value: value ?? updatedParams[existingIndex].value,
                    disabled: false
                };
            } else {
                updatedParams = [...currentParams, { id, key: key || '', value: value || '', disabled: false }];
            }
            
            const updatedUrl = updateUrlWithParams(tab.url, updatedParams);
            updateActiveTab({ params: updatedParams, url: updatedUrl, isDirty: true });
        },
        
        removeParam: (id: string) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            let filteredParams = tab.params.filter(p => p.id !== id);
            if (filteredParams.length === 0) {
                filteredParams = [createEmptyParamRow()];
            }
            
            const updatedUrl = updateUrlWithParams(tab.url, filteredParams);
            updateActiveTab({ params: filteredParams, url: updatedUrl, isDirty: true });
        },
        
        toggleParamEnabled: (id: string, currentDisabled: boolean) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const updatedParams = tab.params.map(p =>
                p.id === id ? { ...p, disabled: !currentDisabled } : p
            );
            const updatedUrl = updateUrlWithParams(tab.url, updatedParams);
            
            updateActiveTab({ params: updatedParams, url: updatedUrl, isDirty: true });
        },
        
        // ==================== Per-Tab Environment & Auth ====================
        
        setTabEnvironment: (environmentId: string | null) => {
            updateActiveTab({ environmentId });
        },
        
        setTabAuth: (authId: string | null) => {
            updateActiveTab({ authId });
        },
        
        // ==================== UI State ====================
        
        setActiveRequestSection: (section: RequestSectionTab) => {
            updateActiveTab({ activeRequestSection: section });
        },
        
        setActiveResponseSection: (section: ResponseSectionTab) => {
            updateActiveTab({ activeResponseSection: section });
        },
        
        // ==================== Response Management ====================
        
        handleHttpResponse: (tabId: string, response: ResponseData) => {
            updateTab(tabId, {
                responseData: response,
                isRequestProcessing: false,
                isCancelled: false,
                requestError: null
            });
        },
        
        clearResponseData: (tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            updateTab(id, { responseData: null });
        },
        
        // ==================== Request Processing State ====================
        
        setIsRequestProcessing: (tabId: string, isProcessing: boolean) => {
            updateTab(tabId, { isRequestProcessing: isProcessing });
        },
        
        setRequestError: (tabId: string, error: string | null) => {
            updateTab(tabId, { requestError: error });
        },
        
        setErrorMessage: (error: string, tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            updateTab(id, { errorMessage: error });
        },
        
        // ==================== Cancellation ====================
        
        cancelRequest: (tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            updateTab(id, {
                isCancelled: true,
                isRequestProcessing: false,
                requestError: 'Request cancelled by user'
            });
        },
        
        setIsCancelled: (tabId: string, cancelled: boolean) => {
            updateTab(tabId, { isCancelled: cancelled });
        },
        
        // ==================== Dirty Tracking ====================
        
        markTabDirty: (tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            updateTab(id, { isDirty: true });
        },
        
        markTabClean: (tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            updateTab(id, { isDirty: false });
        },
        
        // ==================== Send Request ====================
        
        handleSendRequest: async (vsCodeApi, environments, auths, tabId?) => {
            const state = get();
            const tab = tabId 
                ? state.tabs.find(t => t.id === tabId) 
                : getActiveTabInternal();
            
            if (!tab) {
                console.error('No tab found to send request');
                return;
            }
            
            if (!tab.method || !tab.url) {
                updateTab(tab.id, { requestError: 'Method and URL are required' });
                return;
            }
            
            if (typeof vsCodeApi === 'undefined') {
                return;
            }

            // Build environment variables map from tab's selected environment
            const envVarsMap = buildEnvVarsMap(environments, tab.environmentId);

            // Track all unresolved placeholders
            const allUnresolved: Set<string> = new Set();

            // Set processing state
            updateTab(tab.id, { 
                isRequestProcessing: true, 
                isCancelled: false, 
                requestError: null, 
                errorMessage: '' 
            });
            
            // Resolve URL
            const urlResult = resolveParameterizedValue(tab.url, envVarsMap);
            urlResult.unresolved.forEach(u => allUnresolved.add(u));
            let finalUrl = urlResult.resolved;
            
            // Add protocol if missing
            if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
                finalUrl = tab.protocol ? `${tab.protocol}://${finalUrl}` : `https://${finalUrl}`;
            }

            // Resolve headers
            const headers = getDictFromHeaderRows(tab.headers || [], envVarsMap, allUnresolved);

            // Get auth for request
            const activeAuth = tab.authId 
                ? auths.find(a => a.id === tab.authId) || null 
                : null;
            const requestAuth = getAuthForRequest(activeAuth, finalUrl);

            // Set content-type if not present
            if (tab.body && tab.body.currentBodyType !== 'none') {
                const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
                if (!contentTypeKey) {
                    const contentType = getContentTypeFromBody(
                        tab.body.currentBodyType, 
                        tab.body?.binaryData?.fileName, 
                        tab.body?.textData?.textType
                    );
                    if (contentType) {
                        headers['Content-Type'] = contentType;
                    }
                }
            }

            // Resolve params
            const urlParamsObj = tab.params 
                ? getURLSearchParamsFromParamRows(tab.params, envVarsMap, allUnresolved) 
                : new URLSearchParams();
            const urlParams = urlParamsObj.toString();
            
            // Prepare body
            let requestBody: string | ArrayBuffer | FormData | Record<string, string> | null = null;
            if (tab.body && tab.body.currentBodyType !== 'none') {
                requestBody = await convertBodyToRequestBody(tab.body, tab.body.currentBodyType, envVarsMap, allUnresolved);
            }

            // Check for unresolved placeholders
            if (allUnresolved.size > 0) {
                const unresolvedList = Array.from(allUnresolved).slice(0, 3).join(', ') + 
                    (allUnresolved.size > 3 ? '...' : '');
                const errorMsg = `Request has unresolved placeholders: ${unresolvedList}. Please resolve them and try again.`;
                updateTab(tab.id, { 
                    errorMessage: errorMsg,
                    isRequestProcessing: false
                });
                return;
            }
            
            // Serialize FormData
            let serializableBody = requestBody;
            if (requestBody instanceof FormData) {
                const formDataEntries: Array<{ key: string; value: string | File }> = [];
                requestBody.forEach((value, key) => {
                    formDataEntries.push({ key, value });
                });
                serializableBody = { type: 'formdata', entries: formDataEntries } as any;
            }

            // Remove params from URL (sent separately)
            const urlObj = new URL(finalUrl);
            urlObj.search = '';
            finalUrl = urlObj.toString();

            const request = { 
                method: tab.method, 
                url: finalUrl, 
                params: urlParams || undefined, 
                headers, 
                body: serializableBody,
                auth: requestAuth || undefined,
                envVars: Object.fromEntries(envVarsMap)
            };
            
            // Send request with tab ID for correlation
            vsCodeApi.postMessage({ type: 'httpRequest', request, id: tab.id });
        }
    };
};

export default createRequestTabsSlice;
