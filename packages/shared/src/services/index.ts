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
} from './BaseStorageService.js';

export { SettingsService, settingsService } from './SettingsService.js';
export type { AppSettings } from './SettingsService.js';

export { EnvironmentService, environmentService } from './EnvironmentService.js';
export { CollectionService, collectionService } from './CollectionService.js';
export { HistoryService, historyService } from './HistoryService.js';
export { CookieService, cookieService } from './CookieService.js';
export { StoreService, storeService } from './StoreService.js';
export { 
    HttpService, 
    httpService, 
    setAuthServiceFactory,
    type HttpRequestConfig, 
    type HttpResponseResult,
    type SendConfig,
    type SendResult
} from './HttpService.js';
