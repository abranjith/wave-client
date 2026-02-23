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
export { FileService, fileService, type FileResult } from './FileService';
export { FlowService, flowService, type Flow, type FlowNode, type FlowConnector, type ConnectorCondition } from './FlowService';
export { TestSuiteService, testSuiteService, type TestSuite, type TestItem, type TestSuiteSettings } from './TestSuiteService';
export { 
    HttpService, 
    httpService, 
    setAuthServiceFactory,
    type SendConfig,
    type SendResult,
    type HttpAuth
} from './HttpService';

/** Persistent on-disk storage service for all Arena AI chat data. */
export {
    ArenaStorageService,
    arenaStorageService,
} from './ArenaStorageService';

// Auth services
export * from './auth/index';
