/**
 * Type definitions for shared services
 * 
 * Most types are re-exported from @wave-client/core.
 * This file contains only server-specific types and backwards-compatible aliases.
 */

// ============================================================================
// Re-export types from core
// ============================================================================
// Note: These types are the source of truth from @wave-client/core.
// Import them from core in new code where possible.

export type {
    Collection,
    CollectionInfo,
    CollectionItem,
    CollectionRequest,
    CollectionResponse,
    CollectionBody,
    CollectionUrl,
    CollectionReference,
    FileReference,
    FileStorageType,
    FilePathType,
    BodyNone,
    BodyRaw,
    BodyUrlEncoded,
    BodyFormData,
    BodyFile,
    BodyMode,
    RawBodyLanguage,
    Environment,
    EnvironmentVariable,
    HeaderRow,
    ParamRow,
    FormField,
    MultiPartFormField,
    ResponseData,
    Cookie,
    Proxy,
    Cert,
    CACert,
    SelfSignedCert,
    HttpResponseResult
} from '@wave-client/core';

export { isFolder, isRequest, CertType } from '@wave-client/core';

// Validation types from core
export type {
    ValidationRule,
    ValidationRuleCategory,
    StatusValidationRule,
    HeaderValidationRule,
    BodyValidationRule,
    TimeValidationRule,
    ValidationRuleRef,
    RequestValidationData as RequestValidation,  // Rename back for shared package consumers
    ValidationResult,
    ValidationRuleResult,
    GlobalValidationRule,
} from '@wave-client/core';

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
// Auth Types (server-specific)
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

// Auth entry for store
export interface AuthEntry {
    id: string;
    name: string;
    type: string;
    [key: string]: unknown;
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
