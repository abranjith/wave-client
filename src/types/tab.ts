/**
 * Tab types for multi-tab request management
 * Each tab maintains its own isolated state for request, response, and UI settings
 */

import { 
    HeaderRow, 
    ParamRow, 
    ResponseData, 
    RequestBodyType, 
    RequestBodyTextType, 
    FormField, 
    MultiPartFormField,
    CollectionReference
} from './collection';
import { FileWithPreview } from '../hooks/useFileUpload';

// ==================== Request Body Types ====================

export interface RequestTextBody {
    data: string | null;
    textType: RequestBodyTextType | null;
}

export interface RequestBinaryBody {
    data: FileWithPreview | null;
    fileName: string | null;
}

export interface RequestFormBody {
    data: FormField[] | null;
}

export interface RequestMultiPartFormBody {
    data: MultiPartFormField[] | null;
}

export interface RequestBody {
    textData: RequestTextBody | null;
    binaryData: RequestBinaryBody | null;
    formData: RequestFormBody | null;
    multiPartFormData: RequestMultiPartFormBody | null;
    currentBodyType: RequestBodyType;
}

// ==================== Tab UI State ====================

export type RequestSectionTab = 'Params' | 'Headers' | 'Body';
export type ResponseSectionTab = 'Body' | 'Headers';

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
    body: RequestBody;
    
    // Collection reference (for save functionality)
    folderPath: string[];
    collectionRef: CollectionReference | null;
    
    // Per-tab environment and auth selection
    environmentId: string | null;
    authId: string | null;
    
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
        body: createEmptyRequestBody(),
        folderPath: [],
        collectionRef: null,
        environmentId: null,
        authId: null,
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
 * Creates an empty request body with default values
 */
export function createEmptyRequestBody(): RequestBody {
    return {
        textData: null,
        binaryData: null,
        formData: { data: [createEmptyFormField()] },
        multiPartFormData: { data: [createEmptyMultiPartFormField()] },
        currentBodyType: 'none',
    };
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
