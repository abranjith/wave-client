/**
 * Postman Collection v2.1.0 Schema Types
 * Based on https://schema.postman.com/json/collection/v2.1.0/collection.json
 * 
 * Note: This app does not support variables, events, auth, and protocolProfileBehavior.
 * Those types are omitted from this schema.
 */

/**
 * Postman Collection Information
 */
export interface PostmanInfo {
    _postman_id?: string;
    name: string;
    description?: string | PostmanDescription;
    version?: string;
    schema: string;
}

/**
 * Postman Description - can be string or object
 */
export interface PostmanDescription {
    content?: string;
    type?: string;
    version?: string;
}

/**
 * Postman URL - can be string or object
 */
export interface PostmanUrl {
    raw?: string;
    protocol?: string;
    host?: string | string[];
    port?: string;
    path?: string | string[];
    query?: PostmanQueryParam[];
    hash?: string;
}

/**
 * Postman Query Parameter
 */
export interface PostmanQueryParam {
    key: string | null;
    value: string | null;
    disabled?: boolean;
    description?: string | PostmanDescription;
}

/**
 * Postman Header
 */
export interface PostmanHeader {
    key: string;
    value: string;
    disabled?: boolean;
    description?: string | PostmanDescription;
}

/**
 * Postman Request Body - Form Data Parameter
 */
export interface PostmanFormParam {
    key: string;
    value?: string;
    disabled?: boolean;
    type?: 'text' | 'file';
    contentType?: string;
    description?: string | PostmanDescription;
    src?: string | string[];
}

/**
 * Postman Request Body - URL Encoded Parameter
 */
export interface PostmanUrlEncodedParam {
    key: string;
    value?: string;
    disabled?: boolean;
    description?: string | PostmanDescription;
}

/**
 * Postman Request Body - File reference
 */
export interface PostmanFile {
    src?: string | null;
    content?: string;
}

/**
 * Postman Request Body
 */
export interface PostmanBody {
    mode?: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
    raw?: string;
    urlencoded?: PostmanUrlEncodedParam[];
    formdata?: PostmanFormParam[];
    file?: PostmanFile;
    graphql?: {
        query?: string;
        variables?: string;
    };
    options?: {
        raw?: {
            language?: string;
        };
    };
    disabled?: boolean;
}

/**
 * Postman Request
 */
export interface PostmanRequest {
    url?: PostmanUrl | string;
    method?: string;
    description?: string | PostmanDescription;
    header?: PostmanHeader[] | string;
    body?: PostmanBody;
}

/**
 * Postman Cookie
 */
export interface PostmanCookie {
    domain: string;
    expires?: string | null;
    maxAge?: string;
    hostOnly?: boolean;
    httpOnly?: boolean;
    name?: string;
    path: string;
    secure?: boolean;
    session?: boolean;
    value?: string;
    extensions?: Array<{ key: string; value: string }>;
}

/**
 * Postman Response
 */
export interface PostmanResponse {
    id?: string;
    originalRequest?: PostmanRequest;
    responseTime?: number | string | null;
    timings?: Record<string, unknown> | null;
    header?: PostmanHeader[] | string | null;
    cookie?: PostmanCookie[];
    body?: string | null;
    status?: string;
    code?: number;
    _postman_previewlanguage?: string;
    _postman_previewtype?: string;
}

/**
 * Postman Item (Request or Folder)
 * An Item can contain a request (making it a request item) or
 * an array of items (making it a folder)
 */
export interface PostmanItem {
    id?: string;
    name?: string;
    description?: string | PostmanDescription;
    request?: PostmanRequest;
    response?: PostmanResponse[];
    item?: PostmanItem[];
}

/**
 * Postman Collection
 * The main collection structure
 */
export interface PostmanCollection {
    info: PostmanInfo;
    item: PostmanItem[];
}

/**
 * Type guard to check if an item is a folder (has nested items)
 */
export function isPostmanFolder(item: PostmanItem): boolean {
    return Array.isArray(item.item) && !item.request;
}

/**
 * Type guard to check if an item is a request
 */
export function isPostmanRequest(item: PostmanItem): boolean {
    return item.request !== undefined;
}
