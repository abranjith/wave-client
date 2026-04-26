/**
 * Tab types for multi-tab request management
 * Each tab maintains its own isolated state for request, response, and UI settings
 */

import { 
    HeaderRow, 
    ParamRow, 
    ResponseData, 
    FormField, 
    MultiPartFormField,
    CollectionReference,
    CollectionBody,
    BodyMode,
    RequestProtocol,
} from './collection';
import { RequestValidation, ValidationRuleRef } from './validation';

// ==================== Tab UI State ====================

export type RequestSectionTab = 'Params' | 'Headers' | 'Body' | 'Validation';
export type ResponseSectionTab = 'Error' | 'Body' | 'Headers' | 'Validation' | 'Messages' | 'Events';

// ==================== Tab Data ====================

/**
 * TabData represents the complete state for a single request tab.
 * Each tab is isolated and maintains its own:
 * - Request configuration (URL, method, headers, params, body)
 * - Response data
 * - Environment and Auth selection (per-tab, not global)
 * - UI state (active sections, dirty flag)
 *
 * The `protocol` field is a `RequestProtocol` discriminant (`'http' | 'ws' | 'sse'`)
 * that determines which request type this tab represents. It is NOT the URL scheme
 * (http / https / ws / wss) — those are encoded directly in the URL string.
 * Legacy tabs loaded without a protocol field default to `'http'`.
 */
export interface TabData {
    // Unique identifier for the tab (used for concurrency handling)
    id: string;
    
    // Request metadata
    name: string;
    
    // Request configuration
    /**
     * The transport protocol for this tab: 'http' | 'ws' | 'sse'.
     * Determines which fields are active (e.g., WS tabs have no body/validation).
     */
    protocol: RequestProtocol;
    /**
     * HTTP method. Used by HTTP and SSE tabs; ignored for WS tabs (WS always
     * uses an upgrade handshake, not a verb).
     */
    method: string;
    url: string;
    params: ParamRow[];
    headers: HeaderRow[];
    /** Request body using unified CollectionBody discriminated union */
    body: CollectionBody;
    
    // Collection reference (for save functionality)
    folderPath: string[];
    collectionRef: CollectionReference | null;
    
    // Per-tab environment and auth selection
    environmentId: string | null;
    authId: string | null;
    
    /**
     * Response validation rules. Used only by HTTP tabs; WS and SSE tabs
     * do not support validation (streaming semantics make single-response
     * validation inapplicable).
     */
    validation: RequestValidation;
    
    // Response state
    responseData: ResponseData | null;
    
    // Request processing state
    isRequestProcessing: boolean;
    requestError: string | null;
    isCancelled: boolean;
    
    // UI state
    errorMessage: string;
    /**
     * The currently visible request-side editor section.
     * Default values vary by protocol — see `getDefaultRequestSection()`.
     */
    activeRequestSection: RequestSectionTab;
    /**
     * The currently visible response-side section.
     * Default values vary by protocol — see `getDefaultResponseSection()`.
     */
    activeResponseSection: ResponseSectionTab;
    
    // Change tracking
    isDirty: boolean;
}

// ==================== Tab Configuration ====================

export const TAB_CONSTANTS = {
    MAX_TABS: 25,
    DEFAULT_NAME: 'Untitled Request',
    DEFAULT_METHOD: 'GET',
    /** Default request protocol for new tabs. */
    DEFAULT_PROTOCOL: 'http' as RequestProtocol,
} as const;

// ==================== Protocol-Aware Defaults ====================

/**
 * Returns the default active request section for a given request protocol.
 *
 * - HTTP: `'Params'` — all sections available
 * - WS: `'Params'` — Body and Validation sections are hidden for WS tabs
 * - SSE: `'Params'` — Validation section is hidden for SSE tabs
 */
export function getDefaultRequestSection(protocol: RequestProtocol): RequestSectionTab {
    // All protocols start on Params.
    return 'Params';
}

/**
 * Returns the valid request-side section tabs for the given protocol.
 * Used to render only the applicable tabs in the request editor toolbar.
 *
 * - `'http'` → Params, Headers, Body, Validation
 * - `'ws'`   → Params, Headers (WS has no body or validation)
 * - `'sse'`  → Params, Headers, Body (SSE supports a request body but not validation)
 */
export function getRequestTabsForProtocol(protocol: RequestProtocol): RequestSectionTab[] {
    if (protocol === 'ws') {return ['Params', 'Headers'];}
    if (protocol === 'sse') {return ['Params', 'Headers', 'Body'];}
    return ['Params', 'Headers', 'Body', 'Validation'];
}

/**
 * Returns the valid response-side output tabs for the given protocol.
 * Used to render only the applicable tabs in the response/output area.
 * Note: the `'Error'` tab is added dynamically when a request fails; it is not
 * included here (it is not a "baseline" tab for any protocol).
 *
 * - `'http'` → Body, Headers, Validation
 * - `'ws'`   → Messages, Headers (WebSocket timeline rendered in FEAT-006)
 * - `'sse'`  → Events, Headers (SSE stream rendered in FEAT-007)
 */
export function getResponseTabsForProtocol(protocol: RequestProtocol): ResponseSectionTab[] {
    if (protocol === 'ws') {return ['Messages', 'Headers'];}
    if (protocol === 'sse') {return ['Events', 'Headers'];}
    return ['Body', 'Headers', 'Validation'];
}

/**
 * Returns the default active response section for a given request protocol.
 *
 * - HTTP: `'Body'`
 * - WS:   `'Messages'` (WebSocket message timeline)
 * - SSE:  `'Events'` (SSE event stream)
 */
export function getDefaultResponseSection(protocol: RequestProtocol): ResponseSectionTab {
    if (protocol === 'ws') {return 'Messages';}
    if (protocol === 'sse') {return 'Events';}
    return 'Body';
}

// ==================== Helper Functions ====================

/**
 * Creates a new empty tab with default values.
 * The initial protocol is `'http'` — the URL is left empty and carries
 * no scheme until the user types one.
 */
export function createEmptyTab(): TabData {
    const id = crypto.randomUUID();
    const protocol = TAB_CONSTANTS.DEFAULT_PROTOCOL;
    return {
        id,
        name: TAB_CONSTANTS.DEFAULT_NAME,
        protocol,
        method: TAB_CONSTANTS.DEFAULT_METHOD,
        url: '',
        params: [createEmptyParamRow()],
        headers: [createEmptyHeaderRow()],
        body: createEmptyBody(),
        folderPath: [],
        collectionRef: null,
        environmentId: null,
        authId: null,
        validation: createEmptyValidation(),
        responseData: null,
        isRequestProcessing: false,
        requestError: null,
        isCancelled: false,
        errorMessage: '',
        activeRequestSection: getDefaultRequestSection(protocol),
        activeResponseSection: getDefaultResponseSection(protocol),
        isDirty: false,
    };
}

/**
 * Creates an empty parameter row
 */
export function createEmptyParamRow(): ParamRow {
    return {
        id: `param-${crypto.randomUUID()}`,
        key: '',
        value: '',
        disabled: false,
    };
}

/**
 * Creates an empty header row
 */
export function createEmptyHeaderRow(): HeaderRow {
    return {
        id: `header-${crypto.randomUUID()}`,
        key: '',
        value: '',
        disabled: false,
    };
}

/**
 * Creates an empty form field
 */
export function createEmptyFormField(): FormField {
    return {
        id: crypto.randomUUID(),
        key: '',
        value: '',
        disabled: false,
    };
}

/**
 * Creates an empty multipart form field
 */
export function createEmptyMultiPartFormField(): MultiPartFormField {
    return {
        id: crypto.randomUUID(),
        key: '',
        value: '',
        fieldType: 'text',
        disabled: false,
    };
}

/**
 * Creates an empty body (mode: 'none')
 */
export function createEmptyBody(): CollectionBody {
    return { mode: 'none' };
}

/**
 * Creates an empty urlencoded body with one empty field
 */
export function createEmptyUrlencodedBody(): CollectionBody {
    return { 
        mode: 'urlencoded', 
        urlencoded: [createEmptyFormField()] 
    };
}

/**
 * Creates an empty formdata body with one empty field
 */
export function createEmptyFormdataBody(): CollectionBody {
    return { 
        mode: 'formdata', 
        formdata: [createEmptyMultiPartFormField()] 
    };
}

/**
 * Creates an empty raw body
 */
export function createEmptyRawBody(language?: 'json' | 'xml' | 'html' | 'text' | 'csv'): CollectionBody {
    return { 
        mode: 'raw', 
        raw: '',
        options: language ? { raw: { language } } : undefined
    };
}

/**
 * Gets the body mode from a CollectionBody
 */
export function getBodyMode(body: CollectionBody | undefined): BodyMode {
    return body?.mode ?? 'none';
}

/**
 * Creates an empty validation configuration
 */
export function createEmptyValidation(): RequestValidation {
    return {
        enabled: false,
        rules: [],
    };
}

/**
 * Creates an empty validation rule reference
 */
export function createEmptyValidationRuleRef(): ValidationRuleRef {
    return {};
}

/**
 * Generates a display name for a tab based on its URL or request name
 */
export function getTabDisplayName(tab: TabData): string {
    if (tab.name && tab.name !== TAB_CONSTANTS.DEFAULT_NAME) {
        return tab.name;
    }
    
    if (tab.url) {
        try {
            // Ensure the URL has a scheme so the URL constructor can parse it.
            // tab.protocol is now a RequestProtocol ('http'|'ws'|'sse'), not a URL
            // scheme, so we use a safe https:// fallback when the URL has none.
            const urlWithProtocol = tab.url.includes('://')
                ? tab.url
                : `https://${tab.url}`;
            const url = new URL(urlWithProtocol);
            const pathPart = url.pathname !== '/' ? url.pathname.split('/').pop() : '';
            return pathPart || url.hostname || TAB_CONSTANTS.DEFAULT_NAME;
        } catch {
            // If URL parsing fails, use the raw URL (truncated)
            return tab.url.length > 30 ? `${tab.url.substring(0, 30)}...` : tab.url;
        }
    }
    
    return TAB_CONSTANTS.DEFAULT_NAME;
}
