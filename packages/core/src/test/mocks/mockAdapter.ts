import type {
  IPlatformAdapter,
  IStorageAdapter,
  IHttpAdapter,
  IFileAdapter,
  ISecretAdapter,
  ISecurityAdapter,
  INotificationAdapter,
  IAdapterEvents,
  EncryptionStatus,
  HttpRequestConfig,
  HttpResponseResult,
  SaveDialogOptions,
  OpenDialogOptions,
} from '../../types/adapters';
import type {
  Collection,
  Environment,
  ParsedRequest,
  Cookie,
  Proxy,
  Cert,
} from '../../types/collection';
import type { Auth } from '../../types/auth';
import type { ValidationRule } from '../../types/validation';
import type { AppSettings } from '../../types/adapters';
import { Ok, Err } from '../../utils/result';
import { createAdapterEventEmitter } from '../../types/adapters';

/**
 * Factory function to create a mock adapter for testing
 * 
 * Usage:
 * ```ts
 * const adapter = createMockAdapter({
 *   storage: {
 *     loadCollections: async () => Ok([mockCollection]),
 *   },
 *   http: {
 *     executeRequest: async () => Ok(mockResponse),
 *   },
 * });
 * ```
 */
export function createMockAdapter(
  overrides: Partial<{
    storage: Partial<IStorageAdapter>;
    http: Partial<IHttpAdapter>;
    file: Partial<IFileAdapter>;
    secret: Partial<ISecretAdapter>;
    security: Partial<ISecurityAdapter>;
    notification: Partial<INotificationAdapter>;
    platform: 'vscode' | 'web' | 'test';
  }> = {}
): IPlatformAdapter {
  const events = createAdapterEventEmitter();

  // Default mock implementations that return empty/success results
  const defaultStorage: IStorageAdapter = {
    loadCollections: async () => Ok([]),
    saveCollection: async (collection) => Ok(collection),
    deleteCollection: async () => Ok(undefined),
    saveRequestToCollection: async (collectionFilename, itemPath, item) => Ok(createMockCollection()),
    deleteRequestFromCollection: async () => Ok(createMockCollection()),
    importCollection: async () => Ok([]),
    exportCollection: async () => Ok({ filePath: '', fileName: '' }),
    loadEnvironments: async () => Ok([]),
    saveEnvironment: async () => Ok(undefined),
    saveEnvironments: async () => Ok(undefined),
    deleteEnvironment: async () => Ok(undefined),
    importEnvironments: async () => Ok([]),
    exportEnvironments: async () => Ok({ filePath: '', fileName: '' }),
    loadHistory: async () => Ok([]),
    saveRequestToHistory: async () => Ok(undefined),
    clearHistory: async () => Ok(undefined),
    loadCookies: async () => Ok([]),
    saveCookies: async () => Ok(undefined),
    loadAuths: async () => Ok([]),
    saveAuths: async () => Ok(undefined),
    loadProxies: async () => Ok([]),
    saveProxies: async () => Ok(undefined),
    loadCerts: async () => Ok([]),
    saveCerts: async () => Ok(undefined),
    loadSettings: async () => Ok({ encryptionEnabled: false }),
    saveSettings: async () => Ok(undefined),
    loadValidationRules: async () => Ok([]),
    saveValidationRules: async () => Ok(undefined),
    ...overrides.storage,
  };

  const defaultHttp: IHttpAdapter = {
    executeRequest: async () =>
      Ok({
        id: 'test-request-id',
        status: 200,
        statusText: 'OK',
        elapsedTime: 100,
        size: 1024,
        body: '',
        headers: {},
        is_encoded: false,
      }),
    cancelRequest: () => {},
    ...overrides.http,
  };

  const defaultFile: IFileAdapter = {
    showSaveDialog: async () => null,
    showOpenDialog: async () => null,
    readFile: async () => Ok(''),
    readFileAsBinary: async () => Ok(new Uint8Array()),
    writeFile: async () => Ok(undefined),
    writeBinaryFile: async () => Ok(undefined),
    downloadResponse: async () => Ok(undefined),
    importFile: async () => Ok(null),
    ...overrides.file,
  };

  const defaultSecret: ISecretAdapter = {
    storeSecret: async () => Ok(undefined),
    getSecret: async () => Ok(undefined),
    deleteSecret: async () => Ok(undefined),
    hasSecret: async () => false,
    ...overrides.secret,
  };

  const defaultSecurity: ISecurityAdapter = {
    getEncryptionStatus: async () => ({
      enabled: false,
      hasKey: false,
      recoveryAvailable: false,
    }),
    enableEncryption: async () => Ok(undefined),
    disableEncryption: async () => Ok(undefined),
    changePassword: async () => Ok(undefined),
    exportRecoveryKey: async () => Ok(undefined),
    recoverWithKey: async () => Ok(undefined),
    ...overrides.security,
  };

  const defaultNotification: INotificationAdapter = {
    showNotification: () => {},
    showConfirmation: async () => true,
    showInput: async () => null,
    ...overrides.notification,
  };

  return {
    storage: defaultStorage,
    http: defaultHttp,
    file: defaultFile,
    secret: defaultSecret,
    security: defaultSecurity,
    notification: defaultNotification,
    events,
    platform: overrides.platform ?? 'test',
  };
}

/**
 * Helper to create mock collections for testing
 */
export function createMockCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    info: {
      waveId: 'test-id',
      name: 'Test Collection',
    },
    item: [],
    filename: 'test-collection',
    ...overrides,
  };
}

/**
 * Helper to create mock environments for testing
 */
export function createMockEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'test-env',
    name: 'Test Environment',
    values: [],
    ...overrides,
  };
}

/**
 * Helper to create mock HTTP response for testing
 */
export function createMockHttpResponse(
  overrides: Partial<HttpResponseResult> = {}
): HttpResponseResult {
  return {
    id: 'test-response',
    status: 200,
    statusText: 'OK',
    elapsedTime: 100,
    size: 1024,
    body: '',
    headers: {},
    is_encoded: false,
    ...overrides,
  };
}

/**
 * Helper to create mock HTTP request config for testing
 */
export function createMockHttpRequest(
  overrides: Partial<HttpRequestConfig> = {}
): HttpRequestConfig {
  return {
    id: 'test-request',
    method: 'GET',
    url: 'https://api.example.com',
    headers: [],
    params: [],
    body: { type: 'none' },
    envVars: {},
    ...overrides,
  };
}
