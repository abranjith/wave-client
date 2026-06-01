/**
 * Request Tabs Slice
 * Manages multiple request tabs with isolated state for each tab.
 * Supports concurrent request processing with proper state isolation.
 */

import { StateCreator } from 'zustand';
import { 
    CollectionRequest, 
    AnyCollectionRequest,
    WsCollectionRequest,
    SseCollectionRequest,
    RequestProtocol,
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
    getDefaultRequestSection,
    getDefaultResponseSection,
    RequestSectionTab,
    ResponseSectionTab
} from '../../types/tab';
import { 
    isHttpRequest, 
    isWsRequest, 
    isSseRequest, 
    getRequestProtocol 
} from '../../utils/requestTypeGuards';
import { ValidationRuleRef, RequestValidation } from '../../types/validation';
import { IFileAdapter } from '../../types/adapters';
import { parseUrlQueryParams } from '../../utils/common';
import { buildHttpRequest as buildHttpRequestFromCollection } from '../../utils/requestBuilder';
import { Auth } from './createAuthSlice';
import type { RealtimeSlice } from './createRealtimeSlice';

// Type alias for backwards compatibility during migration
type RawBodyLanguage = 'json' | 'xml' | 'html' | 'text' | 'csv' | undefined;

// Combined store type giving this slice access to the realtime slice at runtime
type RequestTabsSliceStore = RequestTabsSlice & RealtimeSlice;

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
    loadRequestIntoTab: (request: AnyCollectionRequest, targetTabId?: string) => void;
    loadRequestIntoNewTab: (request: AnyCollectionRequest) => TabData | null;
    
    // Clear/Reset tab
    clearActiveTab: () => void;
    clearTab: (tabId: string) => void;
    
    // Get request for saving/history (converts TabData to AnyCollectionRequest based on protocol)
    getCollectionRequest: (tabId?: string) => AnyCollectionRequest;
    
    // Update tab metadata (name, folder path, collection ref) and mark clean
    updateTabMetadata: (tabId: string, metadata: { name?: string, folderPath?: string[], collectionRef?: CollectionReference }) => void;

    // Individual field updaters (operate on active tab)
    updateMethod: (method: string) => void;
    /**
     * Switches the request protocol for the active tab.
     * - When switching to 'ws': normalizes URL scheme to ws:// or wss://, forces body to none.
     * - When switching to 'http' or 'sse': normalizes URL scheme to http:// or https://.
     */
    updateProtocol: (protocol: RequestProtocol) => void;
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
    insertHeaderAfter: (id: string) => void;
    upsertHeader: (id: string, key: string | undefined, value: string | undefined) => void;
    removeHeader: (id: string) => void;
    toggleHeaderEnabled: (id: string, currentDisabled: boolean) => void;
    
    // URL Parameters management
    addEmptyParam: () => void;
    insertParamAfter: (id: string) => void;
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
        tabId?: string,
        fileAdapter?: IFileAdapter
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
 * Gets the folder path from a collection request
 */
function getRequestFolderPath(request: AnyCollectionRequest | null): string[] {
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

// ==================== Slice Creator ====================

const createRequestTabsSlice: StateCreator<RequestTabsSliceStore, [], [], RequestTabsSlice> = (set, get) => {
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
                // Instead, reset the tab to an empty HTTP tab
                const resetTab = createEmptyTab();
                set({
                    tabs: [{ ...resetTab, id: state.tabs[0].id }],
                    activeTabId: state.tabs[0].id
                });
                // The tab is now HTTP — remove realtime state if it had any
                get().removeRealtimeTabState(tabId);
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
            // Tab is gone — remove its realtime entry to prevent orphan state
            get().removeRealtimeTabState(tabId);
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
        
        loadRequestIntoTab: (request: AnyCollectionRequest, targetTabId?: string) => {
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
            
            const protocol = getRequestProtocol(request);

            // Re-selecting an already-open HTTP request should not clear its runtime
            // response state. This allows users to switch away and back without
            // losing the last response snapshot in the tab.
            const shouldPreserveHttpRuntimeState = Boolean(
                targetTab &&
                request.id &&
                targetTab.id === request.id &&
                targetTab.protocol === 'http' &&
                protocol === 'http'
            );
            
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
            
            // Protocol-specific field resolution:
            // - HTTP: all fields present
            // - WS: no body (WS is always upgrade-only), no validation, no method
            // - SSE: has method and optional body, no validation
            const method = isWsRequest(request) ? TAB_CONSTANTS.DEFAULT_METHOD : (request.method || TAB_CONSTANTS.DEFAULT_METHOD);
            const body: CollectionBody = isWsRequest(request) ? createEmptyBody() : (('body' in request ? request.body : undefined) || createEmptyBody());
            const validation = isHttpRequest(request) ? (request.validation || createEmptyValidation()) : createEmptyValidation();
            
            const updatedTabData: Partial<TabData> = {
                id: tabId,
                name: request.name || TAB_CONSTANTS.DEFAULT_NAME,
                protocol,
                method,
                url: rawUrl,
                params: paramRows,
                headers: headerRows,
                body,
                folderPath: getRequestFolderPath(request),
                collectionRef: request.sourceRef || null,
                validation,
                authId: request.authId || null,
                responseData: shouldPreserveHttpRuntimeState ? targetTab?.responseData ?? null : null,
                isRequestProcessing: shouldPreserveHttpRuntimeState ? targetTab?.isRequestProcessing ?? false : false,
                requestError: shouldPreserveHttpRuntimeState ? targetTab?.requestError ?? null : null,
                isCancelled: shouldPreserveHttpRuntimeState ? targetTab?.isCancelled ?? false : false,
                errorMessage: shouldPreserveHttpRuntimeState ? targetTab?.errorMessage ?? '' : '',
                isDirty: false,
                activeRequestSection: shouldPreserveHttpRuntimeState ? targetTab?.activeRequestSection ?? getDefaultRequestSection(protocol) : getDefaultRequestSection(protocol),
                activeResponseSection: shouldPreserveHttpRuntimeState ? targetTab?.activeResponseSection ?? getDefaultResponseSection(protocol) : getDefaultResponseSection(protocol),
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
            
            // Synchronize realtime state with the new protocol.
            // Reloading always discards stale messages/events/headers so the tab
            // starts from a clean connection state.
            if (protocol === 'ws' || protocol === 'sse') {
                const existing = get().getRealtimeState(tabId);
                if (existing) {
                    // Reset to idle, preserving the tabId/protocol key in the map
                    get().resetRealtimeTabState(tabId);
                    // If the protocol changed (e.g., WS→SSE), we need a new entry with
                    // the correct protocol discriminant
                    if (existing.protocol !== protocol) {
                        get().removeRealtimeTabState(tabId);
                        get().ensureRealtimeTabState(tabId, protocol);
                    }
                } else {
                    get().ensureRealtimeTabState(tabId, protocol);
                }
            } else {
                // HTTP tab — remove any lingering realtime entry
                get().removeRealtimeTabState(tabId);
            }
            
            // Make this tab active
            set({ activeTabId: tabId });
        },
        
        loadRequestIntoNewTab: (request: AnyCollectionRequest) => {
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
            
            const protocol = getRequestProtocol(request);
            
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
            
            // Protocol-specific field resolution
            const method = isWsRequest(request) ? TAB_CONSTANTS.DEFAULT_METHOD : (request.method || TAB_CONSTANTS.DEFAULT_METHOD);
            const body: CollectionBody = isWsRequest(request) ? createEmptyBody() : (('body' in request ? request.body : undefined) || createEmptyBody());
            const validation = isHttpRequest(request) ? (request.validation || createEmptyValidation()) : createEmptyValidation();
            
            const newTab = createEmptyTab();
            const updatedTab: TabData = {
                ...newTab,
                id: request.id || newTab.id, // Use request ID as tab ID
                name: request.name || TAB_CONSTANTS.DEFAULT_NAME,
                protocol,
                method,
                url: rawUrl,
                params: paramRows,
                headers: headerRows,
                body,
                folderPath: getRequestFolderPath(request),
                collectionRef: request.sourceRef || null,
                validation,
                authId: request.authId || null,
                activeRequestSection: getDefaultRequestSection(protocol),
                activeResponseSection: getDefaultResponseSection(protocol),
            };
            
            set({
                tabs: [...state.tabs, updatedTab],
                activeTabId: updatedTab.id
            });
            
            // Initialize idle realtime state for WS/SSE tabs
            if (protocol === 'ws' || protocol === 'sse') {
                get().ensureRealtimeTabState(updatedTab.id, protocol);
            }
            
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
            // Cleared tab resets to HTTP — remove any realtime entry
            get().removeRealtimeTabState(state.activeTabId);
        },
        
        clearTab: (tabId: string) => {
            const resetData = createEmptyTab();
            updateTab(tabId, {
                ...resetData,
                id: tabId
            });
            // Cleared tab resets to HTTP — remove any realtime entry
            get().removeRealtimeTabState(tabId);
        },
        
        // ==================== Get Collection Request ====================
        
        /**
         * Serializes the active (or specified) tab into the correct `AnyCollectionRequest` union
         * member based on the tab's protocol:
         * - `'http'` → `CollectionRequest` (method, body, validation all included)
         * - `'ws'`   → `WsCollectionRequest` (no method, body, or validation)
         * - `'sse'`  → `SseCollectionRequest` (method and optional body; no validation)
         */
        getCollectionRequest: (tabId?: string): AnyCollectionRequest => {
            const state = get();
            const tab = tabId 
                ? state.tabs.find(t => t.id === tabId) 
                : getActiveTabInternal();
            
            if (!tab) {
                // Return empty HTTP request as fallback
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
                } satisfies CollectionRequest;
            }
            
            // Filter out empty headers and params
            const nonEmptyHeaders = tab.headers?.filter(header => header.key || header.value) || [];
            const nonEmptyParams = tab.params?.filter(param => param.key || param.value) || [];
            
            const sourceRef = tab.collectionRef || { 
                collectionFilename: '', 
                collectionName: '', 
                itemPath: tab.folderPath || [] 
            };
            
            if (tab.protocol === 'ws') {
                // WS tabs — no method, body, or validation
                const wsRequest: WsCollectionRequest = {
                    id: tab.id,
                    name: tab.name || '',
                    protocol: 'ws',
                    url: tab.url || '',
                    header: nonEmptyHeaders,
                    query: nonEmptyParams,
                    authId: tab.authId || undefined,
                    sourceRef,
                };
                return wsRequest;
            }
            
            if (tab.protocol === 'sse') {
                // SSE tabs — has method and optional body, no validation
                const sseRequest: SseCollectionRequest = {
                    id: tab.id,
                    name: tab.name || '',
                    protocol: 'sse',
                    method: tab.method || 'GET',
                    url: tab.url || '',
                    header: nonEmptyHeaders,
                    query: nonEmptyParams,
                    body: tab.body,
                    authId: tab.authId || undefined,
                    sourceRef,
                };
                return sseRequest;
            }
            
            // HTTP tabs — full request shape including method, body, and validation
            const httpRequest: CollectionRequest = {
                id: tab.id,
                name: tab.name || '',
                protocol: 'http',
                method: tab.method || 'GET',
                url: tab.url || '',
                header: nonEmptyHeaders,
                query: nonEmptyParams,
                body: tab.body || createEmptyBody(),
                validation: tab.validation,
                authId: tab.authId || undefined,
                sourceRef,
            };
            return httpRequest;
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
        
        updateProtocol: (protocol: RequestProtocol) => {
            const tab = getActiveTabInternal();
            if (!tab) return;
            
            const currentUrl = tab.url || '';
            let newUrl = currentUrl;
            
            try {
                if (protocol === 'ws') {
                    // Switching to WebSocket — normalize URL scheme to ws:// or wss://
                    newUrl = currentUrl
                        .replace(/^https:\/\//i, 'wss://')
                        .replace(/^http:\/\//i, 'ws://');
                    // If no scheme at all, add ws://
                    if (newUrl && !newUrl.includes('://')) {
                        newUrl = `ws://${newUrl}`;
                    }
                } else {
                    // Switching to HTTP or SSE — normalize scheme back to http:// or https://
                    newUrl = currentUrl
                        .replace(/^wss:\/\//i, 'https://')
                        .replace(/^ws:\/\//i, 'http://');
                }
            } catch {
                // URL normalization is best-effort; keep the original URL on error
            }
            
            const updates: Partial<TabData> = {
                protocol,
                url: newUrl,
                isDirty: true,
                activeRequestSection: getDefaultRequestSection(protocol),
                activeResponseSection: getDefaultResponseSection(protocol),
            };
            
            // WS tabs have no body — force to none when switching to WS
            if (protocol === 'ws') {
                updates.body = createEmptyBody();
            }
            
            updateActiveTab(updates);
            
            // Synchronize realtime state with the new protocol.
            // Any change in protocol discards the old connection state.
            const tabId = tab.id;
            const prevProtocol = tab.protocol;
            if (protocol === 'ws' || protocol === 'sse') {
                if (prevProtocol !== protocol) {
                    // Protocol changed (HTTP→WS/SSE or WS↔SSE) — always start fresh
                    get().removeRealtimeTabState(tabId);
                    get().ensureRealtimeTabState(tabId, protocol);
                } else {
                    // Same protocol (e.g., user re-selected current protocol) — no-op
                    get().ensureRealtimeTabState(tabId, protocol);
                }
            } else {
                // Switching to HTTP — remove any realtime entry
                get().removeRealtimeTabState(tabId);
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
            const schemeMatch = url.match(/^([a-z][a-z0-9+\-.]*):\/\//i);
            
            if (schemeMatch) {
                // URL already has a scheme — detect protocol from it
                const scheme = schemeMatch[1].toLowerCase();
                const detectedProtocol: RequestProtocol | undefined =
                    scheme === 'ws' || scheme === 'wss' ? 'ws' : undefined;
                    
                fullUrl = url;
                if (detectedProtocol && detectedProtocol !== tab.protocol) {
                    // Auto-switch protocol discriminant when URL scheme clearly indicates WS.
                    // Keep protocol side-effects aligned with updateProtocol():
                    // initialize realtime state and reset WS-incompatible fields.
                    const tabId = tab.id;
                    const protocolUpdates: Partial<TabData> = {
                        protocol: detectedProtocol,
                        activeRequestSection: getDefaultRequestSection(detectedProtocol),
                        activeResponseSection: getDefaultResponseSection(detectedProtocol),
                    };

                    if (detectedProtocol === 'ws') {
                        protocolUpdates.body = createEmptyBody();
                    }

                    updateActiveTab(protocolUpdates);

                    // URL-based protocol detection should create the realtime entry,
                    // otherwise connection status updates become no-ops and UI stays idle.
                    get().removeRealtimeTabState(tabId);
                    get().ensureRealtimeTabState(tabId, detectedProtocol);
                }
            }
            // No scheme — keep the URL as-is; the scheme will be in the URL string itself
            
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

        insertHeaderAfter: (id: string) => {
            const tab = getActiveTabInternal();
            if (!tab) return;

            const currentHeaders = tab.headers || [];
            const index = currentHeaders.findIndex(h => h.id === id);
            const insertAt = index !== -1 ? index + 1 : currentHeaders.length;
            const newHeader = createEmptyHeaderRow();
            const updatedHeaders = [
                ...currentHeaders.slice(0, insertAt),
                newHeader,
                ...currentHeaders.slice(insertAt),
            ];
            updateActiveTab({ headers: updatedHeaders, isDirty: true });
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

        insertParamAfter: (id: string) => {
            const tab = getActiveTabInternal();
            if (!tab) return;

            const currentParams = tab.params || [];
            const index = currentParams.findIndex(p => p.id === id);
            const insertAt = index !== -1 ? index + 1 : currentParams.length;
            const newParam = createEmptyParamRow();
            const updatedParams = [
                ...currentParams.slice(0, insertAt),
                newParam,
                ...currentParams.slice(insertAt),
            ];
            const updatedUrl = updateUrlWithParams(tab.url, updatedParams);
            updateActiveTab({ params: updatedParams, url: updatedUrl, isDirty: true });
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
            // Check if response is an error (status 0 and statusText 'Error')
            const isError = (response.status === 0 || response.status >= 500 ) && response.statusText === 'Error';
            const activeRespSection = isError ? 'Error' : 'Body';
            
            updateTab(tabId, {
                responseData: response,
                sentRequest: response.sentRequest ?? null,
                isRequestProcessing: false,
                isCancelled: false,
                requestError: null,
                activeResponseSection: activeRespSection as ResponseSectionTab,
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
        
        buildHttpRequest: async (environments, auths, tabId?, fileAdapter?) => {
            const state = get();
            const tab = tabId 
                ? state.tabs.find(t => t.id === tabId) 
                : getActiveTabInternal();
            
            if (!tab) {
                return { success: false, error: 'No tab found to send request' };
            }
            
            // buildHttpRequest only applies to HTTP protocol tabs
            if (tab.protocol !== 'http') {
                return { success: false, error: 'buildHttpRequest is only valid for HTTP tabs' };
            }
            
            if (!tab.method || !tab.url) {
                updateTab(tab.id, { requestError: 'Method and URL are required' });
                return { success: false, error: 'Method and URL are required' };
            }

            // Serialize the HTTP tab into a CollectionRequest
            const collectionRequest = state.getCollectionRequest(tab.id) as CollectionRequest;
            
            // Ensure URL has a scheme — default to https:// if missing
            let urlWithProtocol = tab.url;
            if (!urlWithProtocol.startsWith('http://') && !urlWithProtocol.startsWith('https://')) {
                urlWithProtocol = `https://${urlWithProtocol}`;
            }
            collectionRequest.url = urlWithProtocol;

            // Use the shared buildHttpRequest from requestBuilder
            // Pass fileAdapter for resolving file references in request body
            const buildResult = await buildHttpRequestFromCollection(
                collectionRequest,
                tab.environmentId,
                environments,
                auths,
                null, // defaultAuthId - tab already has authId
                undefined, // dynamicEnvVars
                fileAdapter
            );

            // Handle build errors
            if (buildResult.error || !buildResult.request) {
                const errorMsg = buildResult.error || 'Failed to build request';
                
                // Check for unresolved placeholders
                if (buildResult.unresolved && buildResult.unresolved.length > 0) {
                    const unresolvedList = buildResult.unresolved.slice(0, 3).join(', ') + 
                        (buildResult.unresolved.length > 3 ? '...' : '');
                    const unresolvedMsg = `Request has unresolved placeholders: ${unresolvedList}. Please resolve them and try again.`;
                    updateTab(tab.id, { errorMessage: unresolvedMsg });
                    return { success: false, error: unresolvedMsg };
                }
                
                updateTab(tab.id, { errorMessage: errorMsg });
                return { success: false, error: errorMsg };
            }
            
            return { 
                success: true, 
                tabId: tab.id, 
                request: buildResult.request, 
                validation: tab.validation 
            };
        },
        
        setTabProcessingState: (tabId: string, isProcessing: boolean) => {
            updateTab(tabId, { 
                isRequestProcessing: isProcessing,
                ...(isProcessing && { 
                    sentRequest: null,
                    isCancelled: false, 
                    requestError: null, 
                    errorMessage: '' 
                })
            });
        }
    };
};

export default createRequestTabsSlice;
