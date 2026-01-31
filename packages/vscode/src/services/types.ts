/**
 * Type definitions for extension host services
 * 
 * Re-exports types from @wave-client/shared for convenience.
 * Some types are kept locally for VS Code-specific functionality.
 */

// Import CollectionRequest for the type alias
import type { CollectionRequest } from '@wave-client/shared';

// Re-export all types from shared
export {
    type Collection,
    type CollectionItem,
    type CollectionRequest,
    type CollectionInfo,
    type CollectionUrl,
    type CollectionBody,
    type HeaderRow,
    type ParamRow,
    type FormField,
    type Environment,
    type EnvironmentVariable,
    type Cookie,
    type Proxy,
    type Cert,
    type CACert,
    type SelfSignedCert,
    CertType,
    type ResponseData,
    type ValidationResult,
    type ValidationRuleResult,
    isFolder,
    isRequest,
} from '@wave-client/shared';
