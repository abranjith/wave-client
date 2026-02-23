/**
 * Services barrel export file.
 * Import all services from this file for convenience.
 * 
 * Most services are re-exported from @wave-client/shared.
 * Only vscode-specific services (SecurityService) are defined locally.
 */

// Re-export all shared services
export { 
    BaseStorageService, 
    type AppSettings, 
    type SettingsProvider, 
    setGlobalSettingsProvider, 
    getGlobalSettings,
    setSecurityServiceInstance,
    type ISecurityService
} from '@wave-client/shared';
export { SettingsService, settingsService } from '@wave-client/shared';
export { EnvironmentService, environmentService } from '@wave-client/shared';
export { CollectionService, collectionService } from '@wave-client/shared';
export { HistoryService, historyService } from '@wave-client/shared';
export { CookieService, cookieService } from '@wave-client/shared';
export { StoreService, storeService } from '@wave-client/shared';
export { FlowService, flowService, type Flow, type FlowNode, type FlowConnector, type ConnectorCondition } from '@wave-client/shared';
export { TestSuiteService, testSuiteService, type TestSuite, type TestItem, type TestSuiteSettings } from '@wave-client/shared';
export { FileService, fileService, type FileResult } from '@wave-client/shared';
export type { AuthEntry, AxiosProxyConfig } from '@wave-client/shared';
export { 
    HttpService, 
    httpService, 
    setAuthServiceFactory 
} from '@wave-client/shared';
export type { 
    SendConfig,
    SendResult,
    HttpAuth
} from '@wave-client/shared';

// Note: HttpRequestConfig and HttpResponseResult are available from '@wave-client/core'
// Import them directly: import type { HttpRequestConfig, HttpResponseResult } from '@wave-client/core';

// Auth services from shared
export {
    AuthServiceBase,
    ApiKeyAuthService,
    BasicAuthService,
    DigestAuthService,
    OAuth2RefreshService,
    AuthServiceFactory,
    AuthType,
    authOk,
    authErr,
} from '@wave-client/shared';
export type {
    Auth,
    ApiKeyAuth,
    BasicAuth,
    DigestAuth,
    OAuth2RefreshAuth,
    AuthResult,
    AuthResultData,
    AuthRequestConfig,
    InternalAuthResponse,
    EnvVarsMap,
    CachedAuthData,
} from '@wave-client/shared';

// VS Code-specific services
export { SecurityService, securityService } from './SecurityService';
export type { EncryptionStatus } from './SecurityService';

// Arena services
export { ArenaService, arenaService } from './ArenaService';
export { ArenaStorageService, arenaStorageService } from '@wave-client/shared';

// Types (re-exported from shared for convenience)
export type {
    Collection,
    CollectionItem,
    CollectionRequest,
    CollectionInfo,
    Environment,
    EnvironmentVariable,
    Cookie,
    Proxy,
    Cert,
    GlobalValidationRule,
} from '@wave-client/shared';

// CertType is an enum, so export it as a value
export { CertType } from '@wave-client/shared';

// Note: Importing settingsService triggers global settings provider registration
// Note: Importing securityService triggers its registration with BaseStorageService
