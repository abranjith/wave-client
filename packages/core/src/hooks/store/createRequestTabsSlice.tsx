/**
 * Request Tabs Slice
 * Manages multiple request tabs with isolated state for each tab.
 * Supports concurrent request processing with proper state isolation.
 */

import { StateCreator } from 'zustand';
import { 
    CollectionRequest, 
    CollectionBody,
    CollectionReference,
    CollectionUrl,
    HeaderRow, 
    ParamRow, 
    ResponseData, 
    FormField, 
    MultiPartFormField, 
    Environment,
    BodyMode,
    FileReference,
    getRawUrl,
    isCollectionUrl,
} from '../../types/collection';
import { 
    TabData, 
    TAB_CONSTANTS,
    createEmptyTab,
    createEmptyParamRow,
    createEmptyHeaderRow,
    createEmptyFormField,
    createEmptyMultiPartFormField,
    createEmptyBody,
    createEmptyUrlencodedBody,
    createEmptyFormdataBody,
    createEmptyRawBody,
    createEmptyValidation,
    RequestSectionTab,
    ResponseSectionTab
} from '../../types/tab';
import { ValidationRuleRef, RequestValidation } from '../../types/validation';
import { parseUrlQueryParams, getContentTypeFromBodyMode, resolveParameterizedValue, isUrlInDomains } from '../../utils/common';
import { Auth } from './createAuthSlice';

// Type alias for backwards compatibility during migration
type RawBodyLanguage = 'json' | 'xml' | 'html' | 'text' | 'csv' | undefined;

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
    loadRequestIntoTab: (request: CollectionRequest, targetTabId?: string) => void;
    loadRequestIntoNewTab: (request: CollectionRequest) => TabData | null;
    
    // Clear/Reset tab
    clearActiveTab: () => void;
    clearTab: (tabId: string) => void;
    
    // Get request for saving/history (converts TabData to CollectionRequest)
    getCollectionRequest: (tabId?: string) => CollectionRequest;
    
    // Update tab metadata (name, folder path, collection ref) and mark clean
    updateTabMetadata: (tabId: string, metadata: { name?: string, folderPath?: string[], collectionRef?: CollectionReference }) => void;

    // Individual field updaters (operate on active tab)
    updateMethod: (method: string) => void;
    updateProtocol: (protocol: string) => void;
    updateUrl: (url: string) => void;
    updateName: (name: string) => void;
    updateFolderPath: (folderPath: string[]) => void;
    
    // Body updaters - work with CollectionBody discriminated union
    updateBodyMode: (mode: BodyMode) => void;
    updateRawBody: (data: string | null, language?: RawBodyLanguage) => void;
    updateFileBody: (file: FileReference | null) => void;
    updateUrlencodedBody: (data: FormField[] | null) => void;
    updateFormdataBody: (data: MultiPartFormField[] | null) => void;
    
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
    
    // Request validation management
    setRequestValidationEnabled: (enabled: boolean, tabId?: string) => void;
    addRequestValidationRule: (rule: ValidationRuleRef, tabId?: string) => void;
    removeRequestValidationRule: (index: number, tabId?: string) => void;
    updateRequestValidationRule: (index: number, rule: ValidationRuleRef, tabId?: string) => void;
    setRequestValidation: (validation: RequestValidation, tabId?: string) => void;
    
    // Build HTTP request from tab data (returns request config or error)
    buildHttpRequest: (
        environments: Environment[],
        auths: Auth[],
        tabId?: string
    ) => Promise<{ success: true; tabId: string; request: any; validation?: RequestValidation } | { success: false; error: string }>;
    
    // Set processing state for a tab
    setTabProcessingState: (tabId: string, isProcessing: boolean) => void;
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
 * Converts the CollectionBody to the appropriate format for the HTTP request
 */
async function convertBodyToRequestPayload(
    body: CollectionBody,
    envVarsMap: Map<string, string>,
    unresolved: Set<string>
): Promise<string | FormData | Record<string, string> | ArrayBuffer | null> {
    if (!body || body.mode === 'none') {
        return null;
    }
    
    switch (body.mode) {
        case 'raw': {
            let rawBody = body.raw || null;
            if (rawBody) {
                const bodyResult = resolveParameterizedValue(rawBody, envVarsMap);
                bodyResult.unresolved.forEach(u => unresolved.add(u));
                rawBody = bodyResult.resolved;
            }
            return rawBody;
        }
            
        case 'file': {
            // File body - return null for now, actual resolution happens in requestBuilder
            // The file content should be read by the adapter at execution time
            if (body.file) {
                // TODO: File content resolution should be handled by the HTTP adapter
                // For now, return a placeholder that the adapter can use
                return null;
            }
            return null;
        }
            
        case 'formdata': {
            const multiPartData = body.formdata;
            if (Array.isArray(multiPartData)) {
                const formData = new FormData();
                for (const field of multiPartData) {
                    if (field.key && field.key.trim() && !field.disabled) {
                        const keyResult = resolveParameterizedValue(field.key, envVarsMap);
                        keyResult.unresolved.forEach(u => unresolved.add(u));
                        const resolvedKey = keyResult.resolved;

                        if (typeof field.value === 'object' && field.value !== null && 'path' in field.value) {
                            // FileReference - will be resolved by adapter
                            const fileRef = field.value as FileReference;
                            // Create a blob placeholder with the file info
                            formData.append(resolvedKey, new Blob(), fileRef.fileName || 'file');
                        } else if (field.value !== undefined && field.value !== null) {
                            const valueResult = resolveParameterizedValue(String(field.value), envVarsMap);
                            valueResult.unresolved.forEach(u => unresolved.add(u));
                            formData.append(resolvedKey, valueResult.resolved);
                        }
                    }
                }
                return formData;
            }
            return null;
        }
            
        case 'urlencoded': {
            const urlEncodedData = body.urlencoded;
            if (Array.isArray(urlEncodedData)) {
                const dataRecord: Record<string, string> = {};
                for (const field of urlEncodedData) {
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
        }
            
        default:
            return null;
    }
}

/**
 * Gets the folder path from a collection request
 */
function getRequestFolderPath(request: CollectionRequest | null): string[] {
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
        
        loadRequestIntoTab: (request: CollectionRequest, targetTabId?: string) => {
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
            
            // Convert request headers to HeaderRow format (ensure IDs exist)
            const headerRows: HeaderRow[] = (request.header && request.header.length > 0)
                ? request.header.map(h => ({
                    id: h.id || `header-${crypto.randomUUID()}`,
                    key: h.key,
                    value: h.value,
                    disabled: h.disabled || false,
                }))
                : [createEmptyHeaderRow()];
            
            // Convert request query params to ParamRow format
            // Query params can come from request.query or from url.query if URL is a CollectionUrl
            const urlQueryParams = isCollectionUrl(request.url) ? request.url.query : undefined;
            const queryParams = request.query || urlQueryParams;
            const paramRows: ParamRow[] = (queryParams && queryParams.length > 0)
                ? queryParams.map((p: ParamRow) => ({
                    id: p.id || `param-${crypto.randomUUID()}`,
                    key: p.key,
                    value: p.value,
                    disabled: p.disabled || false,
                }))
                : [createEmptyParamRow()];
            
            // Extract raw URL string from CollectionUrl or use string directly
            const rawUrl = getRawUrl(request.url);
            
            // Use the body directly (it's already CollectionBody)
            const body: CollectionBody = request.body || createEmptyBody();
            
            const updatedTabData: Partial<TabData> = {
                id: tabId, // Use request ID as tab ID for proper matching
                name: request.name || TAB_CONSTANTS.DEFAULT_NAME,
                method: request.method || TAB_CONSTANTS.DEFAULT_METHOD,
                url: rawUrl,
                params: paramRows,
                headers: headerRows,
                body,
                folderPath: getRequestFolderPath(request),
                collectionRef: request.sourceRef || null,
                validation: request.validation || createEmptyValidation(),
                authId: request.authId || null,
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
        
        loadRequestIntoNewTab: (request: CollectionRequest) => {
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
            
            // Convert request headers to HeaderRow format (ensure IDs exist)
            const headerRows: HeaderRow[] = (request.header && request.header.length > 0)
                ? request.header.map(h => ({
                    id: h.id || `header-${crypto.randomUUID()}`,
                    key: h.key,
                    value: h.value,
                    disabled: h.disabled || false,
                }))
                : [createEmptyHeaderRow()];
            
            // Convert request query params to ParamRow format
            // Query params can come from request.query or from url.query if URL is a CollectionUrl
            const urlQueryParams = isCollectionUrl(request.url) ? request.url.query : undefined;
            const queryParams = request.query || urlQueryParams;
            const paramRows: ParamRow[] = (queryParams && queryParams.length > 0)
                ? queryParams.map((p: ParamRow) => ({
                    id: p.id || `param-${crypto.randomUUID()}`,
                    key: p.key,
                    value: p.value,
                    disabled: p.disabled || false,
                }))
                : [createEmptyParamRow()];
            
            // Extract raw URL string from CollectionUrl or use string directly
            const rawUrl = getRawUrl(request.url);
            
            const newTab = createEmptyTab();
            const updatedTab: TabData = {
                ...newTab,
                id: request.id || newTab.id, // Use request ID as tab ID
                name: request.name || TAB_CONSTANTS.DEFAULT_NAME,
                method: request.method || TAB_CONSTANTS.DEFAULT_METHOD,
                url: rawUrl,
                params: paramRows,
                headers: headerRows,
                body: request.body || createEmptyBody(),
                folderPath: getRequestFolderPath(request),
                collectionRef: request.sourceRef || null,
                validation: request.validation || createEmptyValidation(),
                authId: request.authId || null,
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
        
        // ==================== Get Collection Request ====================
        
        getCollectionRequest: (tabId?: string): CollectionRequest => {
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
                    header: [],
                    query: [],
                    body: createEmptyBody(),
                    sourceRef: { collectionFilename: '', collectionName: '', itemPath: [] },
                    validation: createEmptyValidation(),
                    authId: undefined
                };
            }
            
            // Filter out empty headers
            const nonEmptyHeaders = tab.headers?.filter(header => header.key || header.value) || [];
            // Filter out empty params
            const nonEmptyParams = tab.params?.filter(param => param.key || param.value) || [];
            
            return {
                id: tab.id,
                name: tab.name || '',
                method: tab.method || 'GET',
                url: tab.url || '',
                header: nonEmptyHeaders,
                query: nonEmptyParams,
                body: tab.body || createEmptyBody(),
                validation: tab.validation,
                authId: tab.authId || undefined,
                sourceRef: tab.collectionRef || { 
                    collectionFilename: '', 
                    collectionName: '', 
                    itemPath: tab.folderPath || [] 
                }
            };
        },
        
        updateTabMetadata: (tabId: string, metadata: { name?: string, folderPath?: string[], collectionRef?: CollectionReference }) => {
            updateTab(tabId, {
                ...metadata,
                isDirty: false
            });
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
        
        updateBodyMode: (mode: BodyMode) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            // When changing mode, preserve data for the selected mode if it exists
            let newBody: CollectionBody;
            
            switch (mode) {
                case 'none':
                    newBody = { mode: 'none' };
                    break;
                case 'raw':
                    // Preserve existing raw content and language if available
                    newBody = tab.body.mode === 'raw' 
                        ? tab.body 
                        : createEmptyRawBody();
                    break;
                case 'urlencoded':
                    // Preserve existing urlencoded data if available
                    newBody = tab.body.mode === 'urlencoded' 
                        ? tab.body 
                        : createEmptyUrlencodedBody();
                    break;
                case 'formdata':
                    // Preserve existing formdata if available
                    newBody = tab.body.mode === 'formdata' 
                        ? tab.body 
                        : createEmptyFormdataBody();
                    break;
                case 'file':
                    // Preserve existing file reference if available
                    newBody = tab.body.mode === 'file' 
                        ? tab.body 
                        : { mode: 'file', file: undefined };
                    break;
                default:
                    newBody = { mode: 'none' };
            }
            
            updateActiveTab({ body: newBody, isDirty: true });
        },
        
        updateRawBody: (data: string | null, language?: RawBodyLanguage) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            // Preserve existing language if not provided
            const currentLanguage = tab.body.mode === 'raw' 
                ? tab.body.options?.raw?.language 
                : undefined;
            
            const newBody: CollectionBody = {
                mode: 'raw',
                raw: data || '',
                options: (language || currentLanguage) 
                    ? { raw: { language: language || currentLanguage } } 
                    : undefined
            };
            
            updateActiveTab({ body: newBody, isDirty: true });
        },
        
        updateFileBody: (file: FileReference | null) => {
            const newBody: CollectionBody = {
                mode: 'file',
                file: file || undefined
            };
            
            updateActiveTab({ body: newBody, isDirty: true });
        },
        
        updateUrlencodedBody: (data: FormField[] | null) => {
            const urlencoded = data && data.length > 0 
                ? data 
                : [createEmptyFormField()];
            
            const newBody: CollectionBody = {
                mode: 'urlencoded',
                urlencoded
            };
            
            updateActiveTab({ body: newBody, isDirty: true });
        },
        
        updateFormdataBody: (data: MultiPartFormField[] | null) => {
            const formdata = data && data.length > 0 
                ? data 
                : [createEmptyMultiPartFormField()];
            
            const newBody: CollectionBody = {
                mode: 'formdata',
                formdata
            };
            
            updateActiveTab({ body: newBody, isDirty: true });
        },
        
        // ==================== Form Fields Management ====================
        
        toggleFormFieldEnabled: (id: string, currentDisabled: boolean) => {
            const tab = getActiveTabInternal();
            if (!tab || tab.body.mode !== 'urlencoded') return;
            
            const currentFormData = tab.body.urlencoded || [];
            const updatedFormData = currentFormData.map(field =>
                field.id === id ? { ...field, disabled: !currentDisabled } : field
            );
            
            updateActiveTab({
                body: {
                    mode: 'urlencoded',
                    urlencoded: updatedFormData
                },
                isDirty: true
            });
        },
        
        toggleMultiPartFormFieldEnabled: (id: string, currentDisabled: boolean) => {
            const tab = getActiveTabInternal();
            if (!tab || tab.body.mode !== 'formdata') return;
            
            const currentData = tab.body.formdata || [];
            const updatedData = currentData.map(field =>
                field.id === id ? { ...field, disabled: !currentDisabled } : field
            );
            
            updateActiveTab({
                body: {
                    mode: 'formdata',
                    formdata: updatedData
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
        
        // ==================== Request Validation Management ====================
        
        setRequestValidationEnabled: (enabled: boolean, tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            const tab = state.tabs.find(t => t.id === id);
            if (!tab) return;
            
            updateTab(id, { 
                validation: { ...tab.validation, enabled },
                isDirty: true 
            });
        },
        
        addRequestValidationRule: (rule: ValidationRuleRef, tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            const tab = state.tabs.find(t => t.id === id);
            if (!tab) return;
            
            updateTab(id, { 
                validation: { 
                    ...tab.validation, 
                    rules: [...tab.validation.rules, rule] 
                },
                isDirty: true 
            });
        },
        
        removeRequestValidationRule: (index: number, tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            const tab = state.tabs.find(t => t.id === id);
            if (!tab) return;
            
            const newRules = [...tab.validation.rules];
            newRules.splice(index, 1);
            
            updateTab(id, { 
                validation: { ...tab.validation, rules: newRules },
                isDirty: true 
            });
        },
        
        updateRequestValidationRule: (index: number, rule: ValidationRuleRef, tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            const tab = state.tabs.find(t => t.id === id);
            if (!tab) return;
            
            const newRules = [...tab.validation.rules];
            newRules[index] = rule;
            
            updateTab(id, { 
                validation: { ...tab.validation, rules: newRules },
                isDirty: true 
            });
        },
        
        setRequestValidation: (validation: RequestValidation, tabId?: string) => {
            const state = get();
            const id = tabId || state.activeTabId;
            updateTab(id, { validation, isDirty: true });
        },
        
        // ==================== Build HTTP Request ====================
        
        buildHttpRequest: async (environments, auths, tabId?) => {
            const state = get();
            const tab = tabId 
                ? state.tabs.find(t => t.id === tabId) 
                : getActiveTabInternal();
            
            if (!tab) {
                return { success: false, error: 'No tab found to send request' };
            }
            
            if (!tab.method || !tab.url) {
                updateTab(tab.id, { requestError: 'Method and URL are required' });
                return { success: false, error: 'Method and URL are required' };
            }

            // Build environment variables map from tab's selected environment
            const envVarsMap = buildEnvVarsMap(environments, tab.environmentId);

            // Track all unresolved placeholders
            const allUnresolved: Set<string> = new Set();
            
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

            // Set content-type if not present based on body mode
            if (tab.body && tab.body.mode !== 'none') {
                const contentTypeKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
                if (!contentTypeKey) {
                    const contentType = getContentTypeFromBodyMode(tab.body);
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
            if (tab.body && tab.body.mode !== 'none') {
                requestBody = await convertBodyToRequestPayload(tab.body, envVarsMap, allUnresolved);
            }

            // Check for unresolved placeholders
            if (allUnresolved.size > 0) {
                const unresolvedList = Array.from(allUnresolved).slice(0, 3).join(', ') + 
                    (allUnresolved.size > 3 ? '...' : '');
                const errorMsg = `Request has unresolved placeholders: ${unresolvedList}. Please resolve them and try again.`;
                updateTab(tab.id, { 
                    errorMessage: errorMsg
                });
                return { success: false, error: errorMsg };
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
            
            return { 
                success: true, 
                tabId: tab.id, 
                request, 
                validation: tab.validation 
            };
        },
        
        setTabProcessingState: (tabId: string, isProcessing: boolean) => {
            updateTab(tabId, { 
                isRequestProcessing: isProcessing,
                ...(isProcessing && { 
                    isCancelled: false, 
                    requestError: null, 
                    errorMessage: '' 
                })
            });
        }
    };
};

export default createRequestTabsSlice;
