/**
 * VS Code Adapter Bridge
 * 
 * Implements IPlatformAdapter for the VS Code webview environment.
 * This adapter bridges the new adapter interface with the existing postMessage pattern,
 * allowing incremental migration without breaking the current extension.
 * 
 * How it works:
 * 1. Adapter methods call vsCodeApi.postMessage() to send requests to the extension
 * 2. The extension's MessageHandler.ts processes requests and sends responses
 * 3. This adapter listens for responses and resolves the corresponding promises
 * 
 * This is a transitional implementation. Eventually, the message handling could be
 * simplified when we fully migrate to the adapter pattern.
 */

import {
    ok,
    err,
    type Result,
    type IPlatformAdapter,
    type IStorageAdapter,
    type IHttpAdapter,
    type IFileAdapter,
    type ISecretAdapter,
    type ISecurityAdapter,
    type INotificationAdapter,
    type HttpRequestConfig,
    type HttpResponseResult,
    type SaveDialogOptions,
    type OpenDialogOptions,
    type NotificationType,
    type EncryptionStatus,
    type AppSettings,
    type Collection,
    type CollectionItem,
    type Environment,
    type ParsedRequest,
    type Cookie,
    type Proxy,
    type Cert,
    type Auth,
    type ValidationRule,
} from '@wave-client/core';

// ============================================================================
// Types for message handling
// ============================================================================

interface PendingRequest<T> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

type MessageListener = (event: MessageEvent) => void;

// ============================================================================
// VS Code API Type
// ============================================================================

interface VSCodeAPI {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

// ============================================================================
// Request ID Generator
// ============================================================================

let requestIdCounter = 0;
function generateRequestId(): string {
    return `req-${Date.now()}-${++requestIdCounter}`;
}

// ============================================================================
// VS Code Storage Adapter
// ============================================================================

function createVSCodeStorageAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    defaultTimeout: number
): IStorageAdapter {
    function sendAndWait<T>(
        type: string,
        data?: Record<string, unknown>,
        responseType?: string
    ): Promise<Result<T, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();
            
            const timeout = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out: ${type}`));
            }, defaultTimeout);

            pendingRequests.set(requestId, {
                resolve: (value) => resolve(value as Result<T, string>),
                reject: (error) => resolve(err(error.message)),
                timeout,
            });

            vsCodeApi.postMessage({
                type,
                requestId,
                ...data,
            });
        });
    }

    return {
        // Collections
        async loadCollections(): Promise<Result<Collection[], string>> {
            return sendAndWait<Collection[]>('loadCollections', undefined, 'collectionsLoaded');
        },

        async saveCollection(collection): Promise<Result<Collection, string>> {
            vsCodeApi.postMessage({
                type: 'saveCollection',
                data: { collection: JSON.stringify(collection, null, 2) }
            });
            return ok(collection);
        },

        async deleteCollection(collectionId): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'deleteCollection',
                data: { collectionId }
            });
            return ok(undefined);
        },

        async saveRequestToCollection(collectionFilename, itemPath, item): Promise<Result<Collection, string>> {
            return sendAndWait<Collection>(
                'saveRequestToCollection',
                {
                    data: {
                        requestContent: JSON.stringify(item.request, null, 2),
                        requestName: item.name,
                        collectionFileName: collectionFilename,
                        folderPath: itemPath,
                    }
                },
                'collectionUpdated'
            );
        },

        async deleteRequestFromCollection(collectionFilename, itemPath, itemId): Promise<Result<Collection, string>> {
            vsCodeApi.postMessage({
                type: 'deleteRequestFromCollection',
                data: { collectionFilename, itemPath, itemId }
            });
            return ok({} as Collection);
        },

        // Environments
        async loadEnvironments(): Promise<Result<Environment[], string>> {
            return sendAndWait<Environment[]>('loadEnvironments', undefined, 'environmentsLoaded');
        },

        async saveEnvironment(environment): Promise<Result<void, string>> {
            return sendAndWait<void>(
                'saveEnvironment',
                { data: { environment: JSON.stringify(environment, null, 2) } },
                'environmentUpdated'
            );
        },

        async saveEnvironments(environments): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveEnvironments',
                data: { environments: JSON.stringify(environments, null, 2) }
            });
            return ok(undefined);
        },

        async deleteEnvironment(environmentId): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'deleteEnvironment',
                data: { environmentId }
            });
            return ok(undefined);
        },

        // History
        async loadHistory(): Promise<Result<ParsedRequest[], string>> {
            return sendAndWait<ParsedRequest[]>('loadHistory', undefined, 'historyLoaded');
        },

        async saveRequestToHistory(request): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveRequestToHistory',
                data: { request }
            });
            return ok(undefined);
        },

        async clearHistory(): Promise<Result<void, string>> {
            vsCodeApi.postMessage({ type: 'clearHistory' });
            return ok(undefined);
        },

        // Cookies
        async loadCookies(): Promise<Result<Cookie[], string>> {
            return sendAndWait<Cookie[]>('loadCookies', undefined, 'cookiesLoaded');
        },

        async saveCookies(cookies): Promise<Result<void, string>> {
            // Note: Extension may not send a response for this, using fire-and-forget for now
            // TODO: Update extension to send cookiesSaved response
            vsCodeApi.postMessage({
                type: 'saveCookies',
                data: { cookies: JSON.stringify(cookies, null, 2) }
            });
            return ok(undefined);
        },

        // Auth Store
        async loadAuths(): Promise<Result<Auth[], string>> {
            return sendAndWait<Auth[]>('loadAuths', undefined, 'authsLoaded');
        },

        async saveAuths(auths): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveAuths',
                data: { auths: JSON.stringify(auths, null, 2) }
            });
            return ok(undefined);
        },

        // Proxy Store
        async loadProxies(): Promise<Result<Proxy[], string>> {
            return sendAndWait<Proxy[]>('loadProxies', undefined, 'proxiesLoaded');
        },

        async saveProxies(proxies): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveProxies',
                data: { proxies: JSON.stringify(proxies, null, 2) }
            });
            return ok(undefined);
        },

        // Certificate Store
        async loadCerts(): Promise<Result<Cert[], string>> {
            return sendAndWait<Cert[]>('loadCerts', undefined, 'certsLoaded');
        },

        async saveCerts(certs): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveCerts',
                data: { certs: JSON.stringify(certs, null, 2) }
            });
            return ok(undefined);
        },

        // Validation Rules Store
        async loadValidationRules(): Promise<Result<ValidationRule[], string>> {
            return sendAndWait<ValidationRule[]>('loadValidationRules', undefined, 'validationRulesLoaded');
        },

        async saveValidationRules(rules): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveValidationRules',
                data: { rules }
            });
            return ok(undefined);
        },

        // Settings
        async loadSettings(): Promise<Result<AppSettings, string>> {
            return sendAndWait<AppSettings>('loadSettings', undefined, 'settingsLoaded');
        },

        async saveSettings(settings): Promise<Result<void, string>> {
            return sendAndWait<void>(
                'saveSettings',
                { data: { settings: JSON.stringify(settings, null, 2) } },
                'settingsSaved'
            );
        },
    };
}

// ============================================================================
// VS Code HTTP Adapter
// ============================================================================

function createVSCodeHttpAdapter(
    vsCodeApi: VSCodeAPI,
    pendingHttpRequests: Map<string, PendingRequest<Result<HttpResponseResult, string>>>
): IHttpAdapter {
    return {
        async executeRequest(config): Promise<Result<HttpResponseResult, string>> {
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    pendingHttpRequests.delete(config.id);
                    resolve(err('Request timed out'));
                }, config.timeout ?? 30000);

                pendingHttpRequests.set(config.id, {
                    resolve,
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'httpRequest',
                    id: config.id,
                    request: {
                        method: config.method,
                        url: config.url,
                        headers: config.headers,
                        params: config.params,
                        body: config.body,
                        auth: config.auth,
                        envVars: config.envVars,
                    },
                    validation: config.validation,
                });
            });
        },

        cancelRequest(requestId) {
            const pending = pendingHttpRequests.get(requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(err('Request cancelled'));
                pendingHttpRequests.delete(requestId);
            }
            vsCodeApi.postMessage({
                type: 'cancelRequest',
                id: requestId,
            });
        },
    };
}

// ============================================================================
// VS Code File Adapter
// ============================================================================

function createVSCodeFileAdapter(vsCodeApi: VSCodeAPI): IFileAdapter {
    return {
        async showSaveDialog(options): Promise<string | null> {
            // VS Code handles this in the extension, returns via message
            // This is a simplified version - in practice we'd use request/response pattern
            return null;
        },

        async showOpenDialog(options): Promise<string[] | null> {
            return null;
        },

        async readFile(path): Promise<Result<string, string>> {
            return err('File reading not supported in webview - use extension');
        },

        async readFileAsBinary(path): Promise<Result<Uint8Array, string>> {
            return err('Binary file reading not supported in webview - use extension');
        },

        async writeFile(path, content): Promise<Result<void, string>> {
            return err('File writing not supported in webview - use extension');
        },

        async writeBinaryFile(path, data): Promise<Result<void, string>> {
            return err('Binary file writing not supported in webview - use extension');
        },

        async downloadResponse(data, filename, contentType): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'downloadResponse',
                data: Array.from(data).map(b => String.fromCharCode(b)).join(''),
            });
            return ok(undefined);
        },

        async importFile(options): Promise<Result<{ content: string; filename: string } | null, string>> {
            // Handled via message pattern in current implementation
            return ok(null);
        },
    };
}

// ============================================================================
// VS Code Secret Adapter
// ============================================================================

function createVSCodeSecretAdapter(vsCodeApi: VSCodeAPI): ISecretAdapter {
    // Secrets are handled by the extension via SecurityService
    // These are placeholder implementations
    return {
        async storeSecret(key, value): Promise<Result<void, string>> {
            return err('Secret storage handled by extension');
        },

        async getSecret(key): Promise<Result<string | undefined, string>> {
            return err('Secret retrieval handled by extension');
        },

        async deleteSecret(key): Promise<Result<void, string>> {
            return err('Secret deletion handled by extension');
        },

        async hasSecret(key): Promise<boolean> {
            return false;
        },
    };
}

// ============================================================================
// VS Code Security Adapter
// ============================================================================

function createVSCodeSecurityAdapter(vsCodeApi: VSCodeAPI): ISecurityAdapter {
    return {
        async getEncryptionStatus(): Promise<EncryptionStatus> {
            vsCodeApi.postMessage({ type: 'getEncryptionStatus' });
            // Response comes via encryptionStatus message
            return { enabled: false, hasKey: false, recoveryAvailable: false };
        },

        async enableEncryption(password): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'enableEncryption',
                data: { password }
            });
            return ok(undefined);
        },

        async disableEncryption(password): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'disableEncryption',
                data: { password }
            });
            return ok(undefined);
        },

        async changePassword(oldPassword, newPassword): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'changePassword',
                data: { oldPassword, newPassword }
            });
            return ok(undefined);
        },

        async exportRecoveryKey(): Promise<Result<void, string>> {
            vsCodeApi.postMessage({ type: 'exportRecoveryKey' });
            return ok(undefined);
        },

        async recoverWithKey(recoveryKeyPath): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'recoverWithKey',
                data: { recoveryKeyPath }
            });
            return ok(undefined);
        },
    };
}

// ============================================================================
// VS Code Notification Adapter
// ============================================================================

function createVSCodeNotificationAdapter(): INotificationAdapter {
    // Notifications are handled via the banner store in the webview
    // The extension sends banner messages that the App.tsx listens for
    return {
        showNotification(type, message, duration) {
            // This is handled internally via the banner store
            // No need to send to extension
            console.log(`[${type}] ${message}`);
        },

        async showConfirmation(message, confirmLabel, cancelLabel): Promise<boolean> {
            // Could be implemented via extension's vscode.window.showInformationMessage
            return window.confirm(message);
        },

        async showInput(message, defaultValue, placeholder): Promise<string | null> {
            // Could be implemented via extension's vscode.window.showInputBox
            return window.prompt(message, defaultValue) ?? null;
        },
    };
}

// ============================================================================
// Create VS Code Adapter Factory
// ============================================================================

export interface CreateVSCodeAdapterOptions {
    /**
     * Default timeout for requests in ms
     */
    defaultTimeout?: number;
    /**
     * Callback when HTTP response is received (for backwards compatibility)
     */
    onHttpResponse?: (response: HttpResponseResult) => void;
}

/**
 * Creates a VS Code platform adapter that bridges the new adapter interface
 * with the existing postMessage-based communication.
 */
export function createVSCodeAdapter(
    vsCodeApi: VSCodeAPI,
    options: CreateVSCodeAdapterOptions = {}
): {
    adapter: IPlatformAdapter;
    handleMessage: MessageListener;
    cleanup: () => void;
} {
    const defaultTimeout = options.defaultTimeout ?? 30000;
    const pendingRequests = new Map<string, PendingRequest<unknown>>();
    const pendingHttpRequests = new Map<string, PendingRequest<Result<HttpResponseResult, string>>>();

    // Create adapters
    const storage = createVSCodeStorageAdapter(vsCodeApi, pendingRequests, defaultTimeout);
    const http = createVSCodeHttpAdapter(vsCodeApi, pendingHttpRequests);
    const file = createVSCodeFileAdapter(vsCodeApi);
    const secret = createVSCodeSecretAdapter(vsCodeApi);
    const security = createVSCodeSecurityAdapter(vsCodeApi);
    const notification = createVSCodeNotificationAdapter();

    // Message handler for responses
    const handleMessage: MessageListener = (event) => {
        const message = event.data;

        // Handle HTTP responses
        if (message.type === 'httpResponse' && message.response?.id) {
            const pending = pendingHttpRequests.get(message.response.id);
            if (pending) {
                clearTimeout(pending.timeout);
                pendingHttpRequests.delete(message.response.id);
                pending.resolve(ok(message.response));
            }
            // Also call the legacy callback for backwards compatibility
            options.onHttpResponse?.(message.response);
        }

        // Handle request responses with requestId (new pattern)
        if (message.requestId) {
            const pending = pendingRequests.get(message.requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                pendingRequests.delete(message.requestId);
                
                if (message.error) {
                    pending.resolve(err(message.error));
                } else {
                    pending.resolve(ok(message.data));
                }
            }
        }

        // Handle legacy response messages (without requestId)
        // Map message type to data field
        const responseMap: Record<string, string> = {
            'collectionsLoaded': 'collections',
            'collectionsError': 'error',
            'collectionUpdated': 'collection',
            'environmentsLoaded': 'environments',
            'environmentsError': 'error',
            'environmentUpdated': 'environment',
            'historyLoaded': 'history',
            'historyError': 'error',
            'cookiesLoaded': 'cookies',
            'cookiesError': 'error',
            'cookiesSaved': 'cookies',  // If extension starts sending this
            'authsLoaded': 'auths',
            'authsError': 'error',
            'authsSaved': 'auths',  // If extension starts sending this
            'proxiesLoaded': 'proxies',
            'proxiesError': 'error',
            'proxiesSaved': 'proxies',  // If extension starts sending this
            'certsLoaded': 'certs',
            'certsError': 'error',
            'certsSaved': 'certs',  // If extension starts sending this
            'validationRulesLoaded': 'rules',
            'validationRulesSaved': 'rules',
            'validationRulesError': 'error',
            'settingsLoaded': 'settings',
            'settingsSaved': 'settings',
            'settingsError': 'error',
        };

        if (message.type && responseMap[message.type]) {
            // Find pending request by matching message type
            // Since we don't have requestId in legacy messages, we need to match all pending requests
            // and resolve the oldest one of the matching type
            const dataField = responseMap[message.type];
            const isError = message.type.endsWith('Error');
            
            // For error responses
            if (isError) {
                // Resolve the first pending request (FIFO)
                const firstPending = pendingRequests.values().next();
                if (!firstPending.done) {
                    const pending = firstPending.value;
                    clearTimeout(pending.timeout);
                    // Get the key to delete
                    for (const [key, value] of pendingRequests.entries()) {
                        if (value === pending) {
                            pendingRequests.delete(key);
                            pending.resolve(err(message[dataField] || 'Unknown error'));
                            break;
                        }
                    }
                }
            } else {
                // For success responses
                const firstPending = pendingRequests.values().next();
                if (!firstPending.done) {
                    const pending = firstPending.value;
                    clearTimeout(pending.timeout);
                    // Get the key to delete
                    for (const [key, value] of pendingRequests.entries()) {
                        if (value === pending) {
                            pendingRequests.delete(key);
                            pending.resolve(ok(message[dataField]));
                            break;
                        }
                    }
                }
            }
        }
    };

    // Cleanup function
    const cleanup = () => {
        pendingRequests.forEach((pending) => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Adapter disposed'));
        });
        pendingRequests.clear();

        pendingHttpRequests.forEach((pending) => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Adapter disposed'));
        });
        pendingHttpRequests.clear();
    };

    const adapter: IPlatformAdapter = {
        platform: 'vscode',
        storage,
        http,
        file,
        secret,
        security,
        notification,

        initialize: async () => {
            // NOTE: Initialization is handled by components calling adapter methods
            // (e.g., storage.loadCollections(), storage.loadEnvironments(), etc.)
            // This prevents duplicate initialization
            // Each component/hook loads the data it needs when it mounts
        },

        dispose: cleanup,
    };

    return { adapter, handleMessage, cleanup };
}

// ============================================================================
// Legacy Bridge Hook (for gradual migration)
// ============================================================================

/**
 * Creates a bridge that allows using the adapter pattern alongside the existing
 * vsCodeRef.current.postMessage pattern during the migration period.
 * 
 * Usage in App.tsx:
 * ```tsx
 * const vsCodeRef = useRef<any>(null);
 * const adapterBridge = useRef<ReturnType<typeof createVSCodeAdapter> | null>(null);
 * 
 * useEffect(() => {
 *   if (typeof acquireVsCodeApi !== 'undefined' && !vsCodeRef.current) {
 *     vsCodeRef.current = acquireVsCodeApi();
 *     adapterBridge.current = createVSCodeAdapter(vsCodeRef.current);
 *     window.addEventListener('message', adapterBridge.current.handleMessage);
 *   }
 *   return () => {
 *     adapterBridge.current?.cleanup();
 *   };
 * }, []);
 * ```
 */
export function useLegacyBridge(vsCodeApi: VSCodeAPI | null) {
    // This hook can be used during the transition period
    // It provides both the old vsCodeApi and the new adapter interface
    if (!vsCodeApi) {
        return null;
    }
    return createVSCodeAdapter(vsCodeApi);
}
