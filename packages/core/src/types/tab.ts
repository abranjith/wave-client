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
} from './collection';
import { RequestValidation, ValidationRuleRef } from './validation';

// ==================== Tab UI State ====================

export type RequestSectionTab = 'Params' | 'Headers' | 'Body' | 'Validation';
export type ResponseSectionTab = 'Error' | 'Body' | 'Headers' | 'Validation';

// ==================== Tab Data ====================

/**
 * TabData represents the complete state for a single request tab.
 * Each tab is isolated and maintains its own:
 * - Request configuration (URL, method, headers, params, body)
 * - Response data
 * - Environment and Auth selection (per-tab, not global)
 * - UI state (active sections, dirty flag)
 */
export interface TabData {
    // Unique identifier for the tab (used for concurrency handling)
    id: string;
    
    // Request metadata
    name: string;
    
    // Request configuration
    protocol: string;
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
    
    // Validation configuration
    validation: RequestValidation;
    
    // Response state
    responseData: ResponseData | null;
    
    // Request processing state
    isRequestProcessing: boolean;
    requestError: string | null;
    isCancelled: boolean;
    
    // UI state
    errorMessage: string;
    activeRequestSection: RequestSectionTab;
    activeResponseSection: ResponseSectionTab;
    
    // Change tracking
    isDirty: boolean;
}

// ==================== Tab Configuration ====================

export const TAB_CONSTANTS = {
    MAX_TABS: 5,
    DEFAULT_NAME: 'Untitled Request',
    DEFAULT_METHOD: 'GET',
    DEFAULT_PROTOCOL: 'https',
} as const;

// ==================== Helper Functions ====================

/**
 * Creates a new empty tab with default values
 */
export function createEmptyTab(): TabData {
    const id = crypto.randomUUID();
    return {
        id,
        name: TAB_CONSTANTS.DEFAULT_NAME,
        protocol: TAB_CONSTANTS.DEFAULT_PROTOCOL,
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
        activeRequestSection: 'Params',
        activeResponseSection: 'Body',
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
            // Try to extract hostname from URL
            const urlWithProtocol = tab.url.includes('://') 
                ? tab.url 
                : `${tab.protocol}://${tab.url}`;
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
