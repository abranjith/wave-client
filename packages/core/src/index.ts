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
    IArenaAdapter,
    IClipboardAdapter,
    IRealtimeAdapter,
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

export type { ArenaAppSettings } from './hooks/store/createSettingsSlice';
export { DEFAULT_ARENA_APP_SETTINGS } from './hooks/store/createSettingsSlice';

// Arena types
export type {
    ArenaAgentId,
    ArenaCommandId,
    ArenaCommand,
    ArenaMessageRole,
    ArenaMessageStatus,
    ArenaMessage,
    ArenaMessageSource,
    ArenaSession,
    ArenaSessionWithMessages,
    ArenaProviderType,
    ArenaSettings,
    ArenaState,
    ArenaActions,
    ArenaSlice,
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    StreamHandle,
    StreamUnsubscribe,
    ArenaView,
    ArenaReadinessState,
    McpStatus,
    // Streaming state machine types
    ArenaStreamState,
    ArenaStreamManager,
    ArenaStreamCallbacks,
    // Chat block types
    ArenaChatBlock,
    ArenaChatBlockType,
    TextBlock,
    CodeBlock,
    JsonViewerBlock,
    RequestFormBlock,
    ResponseViewerBlock,
    EnvSelectorBlock,
    TableBlock,
    ConfirmationBlock,
    ProgressBlock,
    EnvOption,
    RequestFormData,
} from './types/arena';

export {
    ARENA_COMMANDS,
    ARENA_COMMAND_DEFINITIONS,
    // Chat block helpers
    textBlock,
    codeBlock,
    jsonViewerBlock,
    tableBlock,
    progressBlock,
} from './types/arena';

// Arena config (centralized constants)
export {
    ARENA_AGENT_IDS,
    ARENA_AGENT_DEFINITIONS,
    PROVIDER_DEFINITIONS,
    DEFAULT_ARENA_SETTINGS,
    STORAGE_KEYS,
    ARENA_DIR,
    ARENA_REFERENCES_FILE,
    ARENA_PROVIDER_SETTINGS_FILE,
    LLM_DEFAULTS,
    getAgentDefinition,
    getProviderDefinition,
    getDefaultProviderSettings,
    getEnabledProviders,
    isProviderConfigured,
    geminiGenerateContentUrl,
    geminiStreamUrl,
    geminiModelsUrl,
    ollamaChatUrl,
    ollamaTagsUrl,
    createSessionMetadata,
    getDefaultReferences,
    mergeReferences,
} from './config/arenaConfig';

export type {
    ArenaSessionMetadata,
    ProviderDefinition,
    DynamicModelInfo,
    ArenaAgentDefinition,
    ArenaSourceConfig,
    ArenaSourceType,
    ArenaReference,
    ArenaProviderSettings,
    ArenaProviderSettingsMap,
} from './config/arenaConfig';

// Collection types
export type {
    Collection,
    CollectionInfo,
    CollectionItem,
    CollectionRequest,
    WsCollectionRequest,
    SseCollectionRequest,
    AnyCollectionRequest,
    RequestProtocol,
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
    FolderPathOption,
    ResponseContentType,
} from './types/collection';

export { isFolder, isRequest, CertType, isCollectionUrl, getRawUrl } from './types/collection';

// Request type guard utilities
export {
    isHttpRequest,
    isWsRequest,
    isSseRequest,
    getRequestProtocol,
} from './utils/requestTypeGuards';

// Realtime state types (FEAT-002) + WS connection types (FEAT-004) + SSE connection types (FEAT-005)
export type {
    ConnectionStatus,
    WsMessage,
    SseEvent,
    RealtimeTabState,
    RealtimeStateByTabId,
    Unsubscribe,
    WsConnectionConfig,
    WsConnectionHandle,
    SseConnectionConfig,
    SseConnectionHandle,
} from './types/realtime';

export { createIdleRealtimeTabState } from './types/realtime';

// Flow types
export type {
    Flow,
    FlowNode,
    FlowConnector,
    ConnectorCondition,
    FlowRunResult,
    FlowNodeResult,
    FlowRunState,
    FlowRunStatus,
    FlowNodeStatus,
    FlowContext,
    FlowResolveResult,
} from './types/flow';

export {
    generateFlowId,
    generateNodeId,
    generateConnectorId,
    createEmptyFlow,
    createInitialFlowRunResult,
    isStartingNode,
    getStartingNodes,
    getOutgoingConnectors,
    getIncomingConnectors,
    getUpstreamNodeIds,
    isConditionSatisfied,
    validateFlow,
    getTopologicalOrder,
    calculateNodeDepths,
    autoLayoutFlow,
} from './utils/flowUtils';

// Test Suite types
export type {
    TestSuite,
    TestItem,
    RequestTestItem,
    FlowTestItem,
    TestSuiteSettings,
    TestSuiteRunState,
    TestSuiteRunResult,
    TestItemResult,
    RequestTestItemResult,
    FlowTestItemResult,
    FlowTestCaseResult,
    TestCase,
    TestCaseResult,
    TestCaseData,
} from './types/testSuite';

export {
    createNewTestSuite,
    createRequestTestItem,
    createFlowTestItem,
    isRequestTestItem,
    isFlowTestItem,
    DEFAULT_TEST_SUITE_SETTINGS,
} from './types/testSuite';

// Auth types (data model only - service types are in @wave-client/shared)
export type {
    Auth,
    ApiKeyAuth,
    BasicAuth,
    DigestAuth,
    OAuth2RefreshAuth,
    BaseAuth,
    EnvVarsMap,
} from './types/auth';

export { AuthType } from './types/auth';

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

// Execution types (shared across runners)
export type {
    ExecutionStatus,
    ValidationStatus,
    ExecutionConfig,
    ExecutionProgress,
} from './types/execution';

export {
    determineExecutionStatus,
    determineValidationStatus,
    extractErrorMessage,
    calculateAverageTime,
    updateProgress,
} from './types/execution';

// Tab types
export type {
    TabData,
    RequestSectionTab,
    ResponseSectionTab,
} from './types/tab';

export { 
    TAB_CONSTANTS, 
    createEmptyTab,
    createEmptyBody,
    createEmptyUrlencodedBody,
    createEmptyFormdataBody,
    createEmptyRawBody,
    createEmptyParamRow,
    createEmptyHeaderRow,
    createEmptyFormField,
    createEmptyMultiPartFormField,
    createEmptyValidation,
    getBodyMode,
    getTabDisplayName,
    getRequestTabsForProtocol,
    getResponseTabsForProtocol,
    getDefaultResponseSection,
    getDefaultRequestSection,
} from './types/tab';

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
    useArenaAdapter,
    useClipboardAdapter,
    usePlatform,
    useAdapterOptional,
    useAdapterEvent,
    useAdapterEvents,
    useAdapterEventEmitter,
} from './hooks/useAdapter';
export type { AdapterProviderProps } from './hooks/useAdapter';
export { useArenaModels } from './hooks/useArenaModels';
export type { UseArenaModelsResult } from './hooks/useArenaModels';

// Mock adapter for testing
export {
    createMockAdapter,
    createMinimalMockAdapter,
    createMockCollection,
    createMockEnvironment,
    createMockCollectionRequest,
} from './test/mocks/mockAdapter';
export type {
    MockDataStore,
    MockHttpOptions,
    MockNotificationLog,
    CreateMockAdapterOptions,
} from './test/mocks/mockAdapter';

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

// Encoding utilities
export * from './utils/encoding';

// Collection parser utilities
export * from './utils/collectionParser';

// Collection transformer utilities
export {
    transformCollection,
    exportCollection,
    detectFormatFromFilename,
    detectTransformer,
    getTransformer,
    getSupportedImportFormats,
    getSupportedExportFormats,
    getSupportedFormatNames,
    IMPORT_FORMAT_OPTIONS,
    EXPORT_FORMAT_OPTIONS,
} from './utils/transformers';

export type {
    CollectionFormatType,
    ImportFormatType,
    ExportFormatType,
} from './utils/transformers';

// Flow resolver utilities
export {
    hasUnresolvedVariables,
    extractVariables,
    createEmptyFlowContext,
    addToFlowContext,
    flowContextToDynamicEnvVars,
} from './utils/flowResolver';

// Collection lookup utilities
export {
    findRequestById,
    findFlowById,
    getAllRequestsFromCollection,
    getItemFolderPath,
} from './utils/collectionLookup';

// Executor types and implementations
export type {
    IItemExecutor,
    ExecutionContext,
    RequestOverrides,
    HttpExecutionInput,
    HttpExecutionResult,
    FlowExecutionInput,
    FlowExecutionConfig,
    FlowExecutionResult,
} from './utils/executors/types';

export {
    mergeHeadersWithOverrides,
    mergeParamsWithOverrides,
    mergeEnvVarsWithOverrides,
    extractUrlParts,
} from './utils/executors/types';

export { HttpRequestExecutor } from './utils/executors/httpRequestExecutor';
export { FlowExecutor } from './utils/executors/flowExecutor';

// Batch executor
export type {
    BatchExecutorCallbacks,
    BatchExecutionResult,
    BatchItem,
    ResultStatusExtractor,
} from './utils/batchExecutor';

export { BatchExecutor } from './utils/batchExecutor';

// ============================================================================
// State Management
// ============================================================================

// Zustand store
export { default as useAppStateStore } from './hooks/store/useAppStateStore';

// Arena slice helpers
export { createArenaMessage } from './hooks/store/createArenaSlice';

// Custom hooks
export { useCollectionRunner } from './hooks/useCollectionRunner';
export { useFlowRunner } from './hooks/useFlowRunner';
export { useTestSuiteRunner } from './hooks/useTestSuiteRunner';
export { useFileUpload } from './hooks/useFileUpload';
export { useArenaStreamManager } from './hooks/useArenaStreamManager';
export { useConfirmDialog } from './hooks/useConfirmDialog';
export { useWsConnection } from './hooks/useWsConnection';
export { useSseConnection } from './hooks/useSseConnection';

export type {
    ConfirmDialogOptions,
    UseConfirmDialogResult,
} from './hooks/useConfirmDialog';

export type {
    CollectionRunItem,
    CollectionRunResult,
    CollectionRunState,
    UseCollectionRunnerOptions,
    RunSettings,
} from './hooks/useCollectionRunner';

export type {
    UseFlowRunnerOptions,
    RunFlowOptions,
} from './hooks/useFlowRunner';

export type {
    UseTestSuiteRunnerOptions,
    RunTestSuiteOptions,
} from './hooks/useTestSuiteRunner';

// ============================================================================
// Components
// ============================================================================

// UI components and common application components
export * from './components';
