/**
 * Wave Client Core
 * 
 * Platform-agnostic React UI components, state management, and adapter interfaces
 * for the Wave Client REST API tool.
 * 
 * This package is designed to be consumed by:
 * - @wave-client/vscode - VS Code extension
 * - @wave-client/web - Standalone web application
 * 
 * @packageDocumentation
 */

// ============================================================================
// Types
// ============================================================================

// Adapter interfaces
export type {
    IPlatformAdapter,
    IStorageAdapter,
    IHttpAdapter,
    IFileAdapter,
    ISecretAdapter,
    ISecurityAdapter,
    INotificationAdapter,
    IAdapterEvents,
    HttpRequestConfig,
    HttpResponseResult,
    SaveDialogOptions,
    OpenDialogOptions,
    NotificationType,
    EncryptionStatus,
    AppSettings,
    AdapterEventType,
    AdapterEventMap,
    AdapterEventHandler,
    BannerEvent,
    EncryptionStatusEvent,
} from './types/adapters';

export { isAdapterSuccess, isAdapterError, createAdapterEventEmitter } from './types/adapters';

// Collection types
export type {
    Collection,
    CollectionInfo,
    CollectionItem,
    CollectionRequest,
    CollectionResponse,
    CollectionBody,
    CollectionUrl,
    CollectionReference,
    BinaryBodyData,
    Environment,
    EnvironmentVariable,
    ParsedRequest,
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
    FolderPathOption,
    RequestBodyTextType,
    RequestBodyType,
    ResponseContentType,
} from './types/collection';

export { isFolder, isRequest, CertType } from './types/collection';

// Auth types
export type {
    Auth,
    ApiKeyAuth,
    BasicAuth,
    DigestAuth,
    OAuth2RefreshAuth,
    BaseAuth,
    AuthRequestConfig,
    AuthResultData,
    AuthResult,
    InternalAuthResponse,
    CachedAuthData,
    EnvVarsMap,
} from './types/auth';

export { AuthType, authOk, authErr } from './types/auth';

// Validation types
export type {
    ValidationRule,
    ValidationRuleCategory,
    StatusValidationRule,
    HeaderValidationRule,
    BodyValidationRule,
    TimeValidationRule,
    ValidationRuleRef,
    RequestValidation as RequestValidationData,  // Renamed to avoid conflict with RequestValidation component
    ValidationResult,
    ValidationRuleResult,
    GlobalValidationRule,
} from './types/validation';

// Tab types
export type {
    TabData,
    RequestTextBody,
    RequestBinaryBody,
    RequestFormBody,
    RequestMultiPartFormBody,
    RequestBody as RequestBodyData,  // Renamed to avoid conflict with RequestBody component
    FileWithPreview,
    FileMetadata,
    RequestSectionTab,
    ResponseSectionTab,
} from './types/tab';

export { TAB_CONSTANTS, createEmptyTab } from './types/tab';

// ============================================================================
// Hooks & Context
// ============================================================================

// Adapter context and hooks
export {
    AdapterProvider,
    useAdapter,
    useStorageAdapter,
    useHttpAdapter,
    useFileAdapter,
    useSecretAdapter,
    useSecurityAdapter,
    useNotificationAdapter,
    usePlatform,
    useAdapterOptional,
    useAdapterEvent,
    useAdapterEvents,
    useAdapterEventEmitter,
} from './hooks/useAdapter';
export type { AdapterProviderProps } from './hooks/useAdapter';

// Mock adapter for testing
export {
    createMockAdapter,
    createMinimalMockAdapter,
    createMockCollection,
    createMockEnvironment,
    createMockParsedRequest,
} from './hooks/mockAdapter';
export type {
    MockDataStore,
    MockHttpOptions,
    MockNotificationLog,
    CreateMockAdapterOptions,
} from './hooks/mockAdapter';

// ============================================================================
// Utilities
// ============================================================================

// Result pattern
export { ok, err, Ok, Err } from './utils/result';
export type { Result, Ok as OkType, Err as ErrType } from './utils/result';

// Styling utilities
export {
    cn,
    renderParameterizedText,
} from './utils/styling';

// Common utilities
export * from './utils/common';

// Collection parser utilities
export * from './utils/collectionParser';

// ============================================================================
// State Management
// ============================================================================

// Zustand store
export { default as useAppStateStore } from './hooks/store/useAppStateStore';

// Custom hooks
export { useCollectionRunner } from './hooks/useCollectionRunner';
export { useFileUpload } from './hooks/useFileUpload';

// ============================================================================
// Components
// ============================================================================

// UI components and common application components
export * from './components';
