/**
 * Services barrel export file.
 * Import all services from this file for convenience.
 */

export { 
    BaseStorageService, 
    AppSettings, 
    SettingsProvider, 
    setGlobalSettingsProvider, 
    getGlobalSettings,
    setSecurityServiceInstance
} from './BaseStorageService';
export { SettingsService, settingsService } from './SettingsService';
export { EnvironmentService, environmentService } from './EnvironmentService';
export { CollectionService, collectionService } from './CollectionService';
export { HistoryService, historyService } from './HistoryService';
export { CookieService, cookieService } from './CookieService';
export { StoreService, storeService, AuthEntry, AxiosProxyConfig } from './StoreService';
export { HttpService, httpService, HttpRequestConfig, HttpResponseResult } from './HttpService';
export { SecurityService, securityService, EncryptionStatus } from './SecurityService';

// Auth services
export * from './auth';

// Note: Importing settingsService triggers global settings provider registration
// Note: Importing securityService triggers its registration with BaseStorageService
