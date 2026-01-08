/**
 * Shared services barrel export file.
 * Import all services from this file for convenience.
 */

export { 
    BaseStorageService, 
    setGlobalSettingsProvider, 
    getGlobalSettings,
    setSecurityServiceInstance,
    type SettingsProvider,
    type ISecurityService
} from './BaseStorageService';

export { SettingsService, settingsService } from './SettingsService';
export type { AppSettings } from './SettingsService';

export { EnvironmentService, environmentService } from './EnvironmentService';
export { CollectionService, collectionService } from './CollectionService';
export { HistoryService, historyService } from './HistoryService';
export { CookieService, cookieService } from './CookieService';
export { StoreService, storeService } from './StoreService';
export { FlowService, flowService, type Flow, type FlowNode, type FlowConnector, type ConnectorCondition } from './FlowService';
export { 
    HttpService, 
    httpService, 
    setAuthServiceFactory,
    type HttpRequestConfig, 
    type HttpResponseResult,
    type SendConfig,
    type SendResult,
    type HttpAuth
} from './HttpService';

// Auth services
export * from './auth/index';
