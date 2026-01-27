/**
 * Mock Platform Adapter for Testing
 * 
 * Provides in-memory implementations of all adapter interfaces.
 * Useful for:
 * - Unit testing components that use adapters
 * - Storybook stories
 * - Development without a real backend
 * 
 * Usage:
 * ```tsx
 * import { createMockAdapter } from './mockAdapter';
 * 
 * const mockAdapter = createMockAdapter({
 *   collections: [mockCollection],
 *   environments: [mockEnv],
 * });
 * 
 * <AdapterProvider adapter={mockAdapter}>
 *   <ComponentUnderTest />
 * </AdapterProvider>
 * ```
 */

import { ok, err, type Result } from '../../utils/result';
import {
    createAdapterEventEmitter,
    type IPlatformAdapter,
    type IStorageAdapter,
    type IHttpAdapter,
    type IFileAdapter,
    type ISecretAdapter,
    type ISecurityAdapter,
    type INotificationAdapter,
    type IAdapterEvents,
    type HttpRequestConfig,
    type HttpResponseResult,
    type SaveDialogOptions,
    type OpenDialogOptions,
    type NotificationType,
    type EncryptionStatus,
    type AppSettings,
} from '../../types/adapters';
import type {
    Collection,
    CollectionItem,
    Environment,
    CollectionRequest,
    Cookie,
    Proxy,
    Cert,
} from '../../types/collection';
import type { Auth } from '../../types/auth';
import type { ValidationRule } from '../../types/validation';
import type { Flow } from '../../types/flow';
import type { TestSuite } from '../../types/testSuite';

// ============================================================================
// Mock Data Store (in-memory)
// ============================================================================

export interface MockDataStore {
    collections: Collection[];
    environments: Environment[];
    history: CollectionRequest[];
    cookies: Cookie[];
    auths: Auth[];
    proxies: Proxy[];
    certs: Cert[];
    validationRules: ValidationRule[];
    flows: Flow[];
    testSuites?: TestSuite[];
    settings: AppSettings;
    secrets: Map<string, string>;
    files: Map<string, string | Uint8Array>;
}

function createDefaultMockStore(): MockDataStore {
    return {
        collections: [],
        environments: [],
        history: [],
        cookies: [],
        auths: [],
        proxies: [],
        certs: [],
        validationRules: [],
        flows: [],
        settings: {
            encryptionEnabled: false,
            theme: 'system',
            autoSaveHistory: true,
            maxHistoryItems: 100,
        },
        secrets: new Map(),
        files: new Map(),
    };
}

// ============================================================================
// Mock Storage Adapter
// ============================================================================

function createMockStorageAdapter(store: MockDataStore): IStorageAdapter {
    return {
        // Collections
        async loadCollections() {
            return ok([...store.collections]);
        },
        async saveCollection(collection) {
            const index = store.collections.findIndex(
                c => c.info.waveId === collection.info.waveId
            );
            if (index >= 0) {
                store.collections[index] = collection;
            } else {
                store.collections.push(collection);
            }
            return ok(collection);
        },
        async deleteCollection(collectionId) {
            store.collections = store.collections.filter(
                c => c.info.waveId !== collectionId
            );
            return ok(undefined);
        },
        async saveRequestToCollection(collectionFilename, itemPath, item) {
            const collection = store.collections.find(c => c.filename === collectionFilename);
            if (!collection) {
                return err(`Collection not found: ${collectionFilename}`);
            }
            // Simple mock - just add to root
            collection.item.push(item);
            return ok(collection);
        },
        async deleteRequestFromCollection(collectionFilename, itemPath, itemId) {
            const collection = store.collections.find(c => c.filename === collectionFilename);
            if (!collection) {
                return err(`Collection not found: ${collectionFilename}`);
            }
            collection.item = collection.item.filter(i => i.id !== itemId);
            return ok(collection);
        },
        async importCollection(fileName, fileContent) {
            try {
                const parsed = JSON.parse(fileContent);
                const collections = Array.isArray(parsed) ? parsed : [parsed];
                store.collections.push(...collections);
                return ok(collections);
            } catch (error) {
                return err(`Failed to parse collection: ${error}`);
            }
        },
        async exportCollection(collectionFileName) {
            const collection = store.collections.find(c => c.filename === collectionFileName);
            if (!collection) {
                return err(`Collection not found: ${collectionFileName}`);
            }
            const filePath = `mock://exports/${collectionFileName}`;
            const fileName = collectionFileName;
            store.files.set(filePath, JSON.stringify(collection, null, 2));
            return ok({ filePath, fileName });
        },

        // Environments
        async loadEnvironments() {
            return ok([...store.environments]);
        },
        async saveEnvironment(environment) {
            const index = store.environments.findIndex(e => e.id === environment.id);
            if (index >= 0) {
                store.environments[index] = environment;
            } else {
                store.environments.push(environment);
            }
            return ok(undefined);
        },
        async saveEnvironments(environments) {
            store.environments = [...environments];
            return ok(undefined);
        },
        async deleteEnvironment(environmentId) {
            store.environments = store.environments.filter(e => e.id !== environmentId);
            return ok(undefined);
        },
        async importEnvironments(fileContent) {
            try {
                const parsed = JSON.parse(fileContent);
                const environments = Array.isArray(parsed) ? parsed : [parsed];
                store.environments.push(...environments);
                return ok(environments);
            } catch (error) {
                return err(`Failed to parse environments: ${error}`);
            }
        },
        async exportEnvironments() {
            const filePath = `mock://exports/environments.json`;
            const fileName = 'environments.json';
            store.files.set(filePath, JSON.stringify(store.environments, null, 2));
            return ok({ filePath, fileName });
        },

        // History
        async loadHistory() {
            return ok([...store.history]);
        },
        async saveRequestToHistory(request) {
            store.history.unshift(request);
            if (store.history.length > (store.settings.maxHistoryItems ?? 100)) {
                store.history = store.history.slice(0, store.settings.maxHistoryItems ?? 100);
            }
            return ok(undefined);
        },
        async clearHistory() {
            store.history = [];
            return ok(undefined);
        },

        // Cookies
        async loadCookies() {
            return ok([...store.cookies]);
        },
        async saveCookies(cookies) {
            store.cookies = [...cookies];
            return ok(undefined);
        },

        // Auth Store
        async loadAuths() {
            return ok([...store.auths]);
        },
        async saveAuths(auths) {
            store.auths = [...auths];
            return ok(undefined);
        },

        // Proxy Store
        async loadProxies() {
            return ok([...store.proxies]);
        },
        async saveProxies(proxies) {
            store.proxies = [...proxies];
            return ok(undefined);
        },

        // Certificate Store
        async loadCerts() {
            return ok([...store.certs]);
        },
        async saveCerts(certs) {
            store.certs = [...certs];
            return ok(undefined);
        },

        // Validation Rules Store
        async loadValidationRules() {
            return ok([...store.validationRules]);
        },
        async saveValidationRules(rules) {
            store.validationRules = [...rules];
            return ok(undefined);
        },

        // Settings
        async loadSettings() {
            return ok({ ...store.settings });
        },
        async saveSettings(settings) {
            store.settings = { ...settings };
            return ok(undefined);
        },

        // Flows
        async loadFlows() {
            return ok([...store.flows]);
        },
        async saveFlow(flow) {
            const index = store.flows.findIndex(f => f.id === flow.id);
            if (index >= 0) {
                store.flows[index] = flow;
            } else {
                store.flows.push(flow);
            }
            return ok(flow);
        },
        async deleteFlow(flowId) {
            store.flows = store.flows.filter(f => f.id !== flowId);
            return ok(undefined);
        },

        // Test Suites
        async loadTestSuites() {
            return ok([...store.testSuites || []]);
        },
        async saveTestSuite(testSuite) {
            if (!store.testSuites) {
                store.testSuites = [];
            }
            const index = store.testSuites.findIndex(ts => ts.id === testSuite.id);
            if (index >= 0) {
                store.testSuites[index] = testSuite;
            } else {
                store.testSuites.push(testSuite);
            }
            return ok(testSuite);
        },
        async deleteTestSuite(testSuiteId) {
            if (store.testSuites) {
                store.testSuites = store.testSuites.filter(ts => ts.id !== testSuiteId);
            }
            return ok(undefined);
        },
    };
}

// ============================================================================
// Mock HTTP Adapter
// ============================================================================

export interface MockHttpOptions {
    /**
     * Default response to return for all requests
     */
    defaultResponse?: Partial<HttpResponseResult>;
    /**
     * Map of URL patterns to responses
     */
    responses?: Map<string | RegExp, HttpResponseResult | ((config: HttpRequestConfig) => HttpResponseResult)>;
    /**
     * Simulate network delay in ms
     */
    delay?: number;
    /**
     * Simulate errors for certain URLs
     */
    errorUrls?: Set<string | RegExp>;
}

function createMockHttpAdapter(options: MockHttpOptions = {}): IHttpAdapter {
    const pendingRequests = new Map<string, AbortController>();

    return {
        async executeRequest(config) {
            const controller = new AbortController();
            pendingRequests.set(config.id, controller);

            try {
                // Simulate network delay
                if (options.delay) {
                    await new Promise(resolve => setTimeout(resolve, options.delay));
                }

                // Check if aborted
                if (controller.signal.aborted) {
                    return err('Request cancelled');
                }

                // Check for error URLs
                if (options.errorUrls) {
                    for (const pattern of options.errorUrls) {
                        if (typeof pattern === 'string' && config.url.includes(pattern)) {
                            return err(`Network error: ${config.url}`);
                        }
                        if (pattern instanceof RegExp && pattern.test(config.url)) {
                            return err(`Network error: ${config.url}`);
                        }
                    }
                }

                // Check for custom responses
                if (options.responses) {
                    for (const [pattern, response] of options.responses) {
                        const matches = typeof pattern === 'string'
                            ? config.url.includes(pattern)
                            : pattern.test(config.url);

                        if (matches) {
                            const result = typeof response === 'function'
                                ? response(config)
                                : response;
                            // Ensure we use the request's id, not any id from the response template
                            const { id: _responseId, ...restResult } = result;
                            return ok({ ...restResult, id: config.id });
                        }
                    }
                }

                // Return default mock response
                // Extract id from defaultResponse to avoid duplicate property warning
                const { id: _ignoredId, ...restDefaultResponse } = options.defaultResponse ?? {};
                const defaultResponse: HttpResponseResult = {
                    id: config.id,
                    status: 200,
                    statusText: 'OK',
                    elapsedTime: options.delay ?? 50,
                    size: 100,
                    body: JSON.stringify({ success: true, mock: true }),
                    headers: { 'content-type': 'application/json' },
                    isEncoded: false,
                    ...restDefaultResponse,
                };

                return ok(defaultResponse);
            } finally {
                pendingRequests.delete(config.id);
            }
        },

        cancelRequest(requestId) {
            const controller = pendingRequests.get(requestId);
            if (controller) {
                controller.abort();
                pendingRequests.delete(requestId);
            }
        },
    };
}

// ============================================================================
// Mock File Adapter
// ============================================================================

function createMockFileAdapter(store: MockDataStore): IFileAdapter {
    return {
        async showSaveDialog(options) {
            // In tests, return a predictable path
            return `/mock/path/${options.defaultFileName ?? 'file.txt'}`;
        },

        async showOpenDialog(options) {
            // In tests, return empty array (user cancelled) by default
            // Override in specific tests as needed
            return null;
        },

        async readFile(path) {
            const content = store.files.get(path);
            if (content === undefined) {
                return err(`File not found: ${path}`);
            }
            if (content instanceof Uint8Array) {
                return ok(new TextDecoder().decode(content));
            }
            return ok(content);
        },

        async readFileAsBinary(path) {
            const content = store.files.get(path);
            if (content === undefined) {
                return err(`File not found: ${path}`);
            }
            if (typeof content === 'string') {
                return ok(new TextEncoder().encode(content));
            }
            return ok(content);
        },

        async writeFile(path, content) {
            store.files.set(path, content);
            return ok(undefined);
        },

        async writeBinaryFile(path, data) {
            store.files.set(path, data);
            return ok(undefined);
        },

        async downloadResponse(data, filename, contentType) {
            // In mock, just store the file
            store.files.set(`/downloads/${filename}`, data);
            return ok(undefined);
        },

        async importFile(options) {
            // In tests, return null (cancelled) by default
            return ok(null);
        },
    };
}

// ============================================================================
// Mock Secret Adapter
// ============================================================================

function createMockSecretAdapter(store: MockDataStore): ISecretAdapter {
    return {
        async storeSecret(key, value) {
            store.secrets.set(key, value);
            return ok(undefined);
        },

        async getSecret(key) {
            return ok(store.secrets.get(key));
        },

        async deleteSecret(key) {
            store.secrets.delete(key);
            return ok(undefined);
        },

        async hasSecret(key) {
            return store.secrets.has(key);
        },
    };
}

// ============================================================================
// Mock Security Adapter
// ============================================================================

function createMockSecurityAdapter(store: MockDataStore): ISecurityAdapter {
    let encryptionEnabled = false;
    let hasKey = false;

    return {
        async getEncryptionStatus(): Promise<EncryptionStatus> {
            return {
                enabled: encryptionEnabled,
                hasKey,
                recoveryAvailable: hasKey,
            };
        },

        async enableEncryption(password) {
            if (password.length < 8) {
                return err('Password must be at least 8 characters');
            }
            encryptionEnabled = true;
            hasKey = true;
            return ok(undefined);
        },

        async disableEncryption(password) {
            encryptionEnabled = false;
            hasKey = false;
            return ok(undefined);
        },

        async changePassword(oldPassword, newPassword) {
            if (newPassword.length < 8) {
                return err('New password must be at least 8 characters');
            }
            return ok(undefined);
        },

        async exportRecoveryKey() {
            return ok(undefined);
        },

        async recoverWithKey(recoveryKeyPath) {
            hasKey = true;
            return ok(undefined);
        },
    };
}

// ============================================================================
// Mock Notification Adapter
// ============================================================================

export interface MockNotificationLog {
    type: NotificationType;
    message: string;
    timestamp: number;
}

function createMockNotificationAdapter(
    notificationLog?: MockNotificationLog[]
): INotificationAdapter {
    const log = notificationLog ?? [];

    return {
        showNotification(type, message, duration) {
            log.push({ type, message, timestamp: Date.now() });
            // In tests, notifications are just logged
        },

        async showConfirmation(message, confirmLabel, cancelLabel) {
            // Default to true in tests
            return true;
        },

        async showInput(message, defaultValue, placeholder) {
            // Default to the default value in tests
            return defaultValue ?? null;
        },
    };
}

// ============================================================================
// Create Mock Adapter Factory
// ============================================================================

export interface CreateMockAdapterOptions {
    /**
     * Initial data for the mock store
     */
    initialData?: Partial<MockDataStore>;
    /**
     * HTTP mock options
     */
    http?: MockHttpOptions;
    /**
     * Notification log (for assertions in tests)
     */
    notificationLog?: MockNotificationLog[];
}

/**
 * Creates a complete mock platform adapter for testing.
 * Returns both the adapter and the underlying store for manipulation in tests.
 */
export function createMockAdapter(options: CreateMockAdapterOptions = {}): {
    adapter: IPlatformAdapter;
    store: MockDataStore;
    notificationLog: MockNotificationLog[];
} {
    const store: MockDataStore = {
        ...createDefaultMockStore(),
        ...options.initialData,
        secrets: new Map(options.initialData?.secrets ?? []),
        files: new Map(options.initialData?.files ?? []),
    };

    const notificationLog = options.notificationLog ?? [];

    const adapter: IPlatformAdapter = {
        platform: 'test',
        storage: createMockStorageAdapter(store),
        http: createMockHttpAdapter(options.http),
        file: createMockFileAdapter(store),
        secret: createMockSecretAdapter(store),
        security: createMockSecurityAdapter(store),
        notification: createMockNotificationAdapter(notificationLog),
        events: createAdapterEventEmitter(),
    };

    return { adapter, store, notificationLog };
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Creates a minimal mock adapter for simple component tests.
 * Use createMockAdapter for more control.
 */
export function createMinimalMockAdapter(): IPlatformAdapter {
    return createMockAdapter().adapter;
}

/**
 * Creates a mock collection for testing
 */
export function createMockCollection(overrides: Partial<Collection> = {}): Collection {
    return {
        info: {
            waveId: `mock-${Date.now()}`,
            name: 'Mock Collection',
            description: 'A mock collection for testing',
        },
        item: [],
        filename: 'mock-collection.json',
        ...overrides,
    };
}

/**
 * Creates a mock environment for testing
 */
export function createMockEnvironment(overrides: Partial<Environment> = {}): Environment {
    return {
        id: `mock-env-${Date.now()}`,
        name: 'Mock Environment',
        values: [
            { key: 'BASE_URL', value: 'https://api.example.com', type: 'default', enabled: true },
        ],
        ...overrides,
    };
}

/**
 * Creates a mock collection request for testing
 */
export function createMockCollectionRequest(overrides: Partial<CollectionRequest> = {}): CollectionRequest {
    return {
        id: `mock-req-${Date.now()}`,
        name: 'Mock Request',
        method: 'GET',
        url: 'https://api.example.com/test',
        header: [],
        query: [],
        body: { mode: 'none' },
        sourceRef: {
            collectionFilename: 'mock.json',
            collectionName: 'Mock Collection',
            itemPath: [],
        },
        ...overrides,
    };
}
