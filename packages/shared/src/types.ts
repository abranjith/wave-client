/**
 * Type definitions for shared services
 * 
 * These types are used across VS Code extension, server, and web packages.
 */

// ============================================================================
// Collection Types
// ============================================================================

export interface CollectionInfo {
    waveId: string;
    name: string;
    description?: string;
    schema?: string;
    version?: string;
}

export interface Collection {
    info: CollectionInfo;
    item: CollectionItem[];
    variable?: CollectionVariable[];
    auth?: CollectionAuth;
    filename?: string;
}

export interface CollectionItem {
    id: string;
    name: string;
    item?: CollectionItem[];  // For folders
    request?: CollectionRequest;
    response?: unknown[];
}

export interface CollectionRequest {
    method: string;
    header?: HeaderRow[];
    url: string | CollectionUrl;
    body?: CollectionBody;
    auth?: CollectionAuth;
    description?: string;
}

export interface CollectionUrl {
    raw: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: ParamRow[];
}

export interface CollectionVariable {
    key: string;
    value: string;
    type?: string;
}

export interface CollectionAuth {
    type: string;
    [key: string]: unknown;
}

// ============================================================================
// Row Types (for headers, params, form data)
// ============================================================================

export interface HeaderRow {
    key: string;
    value: string;
    enabled?: boolean;
    description?: string;
}

export interface ParamRow {
    key: string;
    value: string;
    enabled?: boolean;
    description?: string;
}

export interface FormField {
    key: string;
    value: string;
    type?: 'text' | 'file';
    enabled?: boolean;
}

// ============================================================================
// Request Body Types
// ============================================================================

export interface CollectionBody {
    mode: 'none' | 'raw' | 'urlencoded' | 'formdata' | 'file';
    raw?: string;
    urlencoded?: FormField[];
    formdata?: FormField[];
    binary?: BinaryBodyData;
    options?: {
        raw?: {
            language?: 'json' | 'xml' | 'html' | 'text' | 'csv';
        };
    };
}

export interface BinaryBodyData {
    data: ArrayBuffer;
    fileName: string;
    contentType: string;
}

// ============================================================================
// Environment Types
// ============================================================================

export interface Environment {
    id: string;
    name: string;
    values: EnvironmentVariable[];
}

export interface EnvironmentVariable {
    key: string;
    value: string;
    type?: string;
    enabled: boolean;
}

// ============================================================================
// Cookie Types
// ============================================================================

export interface Cookie {
    id: string;
    domain: string;
    path: string;
    name: string;
    value: string;
    expires?: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    enabled: boolean;
}

// ============================================================================
// Proxy and Cert Types
// ============================================================================

export interface Proxy {
    id: string;
    name: string;
    enabled: boolean;
    domainFilters: string[];
    excludeDomains: string[];
    url: string;
    userName?: string;
    password?: string;
}

// Cert type enum for type discrimination
export enum CertType {
    CA = 'ca',
    SELF_SIGNED = 'selfSigned',
}

// Base interface with common properties for all cert types
interface BaseCert {
    id: string;
    name: string;
    enabled: boolean;
    domainFilters: string[];
    expiryDate?: string;
    passPhrase?: string;
}

// CA Certificate - only requires cert file
export interface CACert extends BaseCert {
    type: CertType.CA;
    certFile: string;
}

// Self-Signed Certificate - can have cert, key, pfx files and passphrase
export interface SelfSignedCert extends BaseCert {
    type: CertType.SELF_SIGNED;
    certFile?: string;
    keyFile?: string;
    pfxFile?: string;
}

// Union type for all cert types
export type Cert = CACert | SelfSignedCert;

// ============================================================================
// History Types
// ============================================================================

export interface ParsedRequest {
    id: string;
    name: string;
    method: string;
    url: string;
    headers: HeaderRow[];
    params: ParamRow[];
    body: CollectionBody | null;
    timestamp: number;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ResponseData {
    id: string;
    status: number;
    statusText: string;
    elapsedTime: number;
    size: number;
    body: string;
    headers: Record<string, string>;
    is_encoded: boolean;
    validationResult?: ValidationResult;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
    enabled: boolean;
    totalRules: number;
    passedRules: number;
    failedRules: number;
    allPassed: boolean;
    results: ValidationRuleResult[];
    executedAt: string;
}

export interface ValidationRuleResult {
    ruleId: string;
    ruleName: string;
    category: 'status' | 'header' | 'body' | 'time';
    passed: boolean;
    message: string;
    expected?: string;
    actual?: string;
    error?: string;
}

/**
 * Entry in the global validation rules store
 * Used for persisting validation rules with all needed metadata
 */
export interface GlobalValidationRule {
    id: string;
    name: string;
    description?: string;
    category: 'status' | 'header' | 'body' | 'time';
    enabled: boolean;
    createdAt: string;       // ISO timestamp
    updatedAt: string;       // ISO timestamp
    // Rule-specific fields
    operator: string;        // The operator type
    value?: number | string; // Primary value
    value2?: number;         // Secondary value (for 'between' operator)
    values?: (number | string)[]; // Multiple values (for 'in', 'not_in' operators)
    headerName?: string;     // For header rules
    jsonPath?: string;       // For body rules with JSON path
    caseSensitive?: boolean; // For header/body string comparisons
}

// ============================================================================
// Auth Types (re-export from auth services)
// Note: Full auth types are in services/auth/types.ts. These are simplified
// types for basic usage (e.g., Collection auth). For auth service types,
// import from services/auth/types.ts directly.
// ============================================================================

// Simple auth type string (for collection auth, etc.)
export type SimpleAuthType = 
    | 'none'
    | 'basic'
    | 'digest'
    | 'bearer'
    | 'apikey'
    | 'oauth2'
    | 'aws'
    | 'ntlm';

// Simple auth interface (for collection auth, etc.)
export interface SimpleAuth {
    type: SimpleAuthType;
    enabled: boolean;
    [key: string]: unknown;
}


// ============================================================================
// Settings Types
// ============================================================================

export interface AppSettings {
    saveFilesLocation: string;
    maxRedirects: number;
    requestTimeoutSeconds: number;
    maxHistoryItems: number;
    commonHeaderNames: string[];
    encryptionKeyEnvVar: string;
    encryptionKeyValidationStatus: 'none' | 'valid' | 'invalid';
    ignoreCertificateValidation: boolean;
}

// ============================================================================
// Auth Entry Types (for store)
// ============================================================================

export interface AuthEntry {
    id: string;
    name: string;
    type: string;
    [key: string]: unknown;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isFolder(item: CollectionItem): boolean {
    return Array.isArray(item.item);
}

export function isRequest(item: CollectionItem): boolean {
    return item.request !== undefined;
}

// ============================================================================
// Encryption Types
// ============================================================================

export interface EncryptionStatus {
    enabled: boolean;
    keyConfigured: boolean;
    envVarName: string;
    envVarFound: boolean;
}

// ============================================================================
// Axios Proxy Config
// ============================================================================

export interface AxiosProxyConfig {
    protocol?: string;
    host: string;
    port: number;
    auth?: {
        username: string;
        password: string;
    };
}
