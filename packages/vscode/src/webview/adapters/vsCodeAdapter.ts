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
 * 4. Push events (banners, state changes) are emitted via the events system
 * 
 * Message Types:
 * - Request/Response: Uses requestId correlation (e.g., loadCollections → collectionsLoaded)
 * - Push Events: No requestId, emitted via adapter.events (e.g., bannerSuccess, bannerError)
 */

import type {
    Result,
    IPlatformAdapter,
    IStorageAdapter,
    IHttpAdapter,
    IFileAdapter,
    ISecretAdapter,
    ISecurityAdapter,
    INotificationAdapter,
    IClipboardAdapter,
    IRealtimeAdapter,
    IAdapterEvents,
    AdapterEventType,
    AdapterEventMap,
    AdapterEventHandler,
    HttpRequestConfig,
    HttpResponseResult,
    EncryptionStatus,
    AppSettings,
    Collection,
    CollectionItem,
    Environment,
    Cookie,
    Proxy,
    Cert,
    Auth,
    ValidationRule,
    Flow,
    TestSuite,
    CollectionRequest,
    SaveDialogOptions,
    OpenDialogOptions,
    NotificationType,
    WsConnectionConfig,
    WsConnectionHandle,
    SseConnectionConfig,
    SseConnectionHandle,
    WsMessage,
    SseEvent,
    ConnectionStatus,
} from '@wave-client/core' with { "resolution-mode": "import" };

import { createVSCodeArenaAdapter } from './vsCodeArenaAdapter';

// ---------------------------------------------------------------------------
// Local Result/EventEmitter helpers — avoids runtime imports from the ESM
// @wave-client/core package in this CommonJS compilation context.
// ---------------------------------------------------------------------------
function ok<T>(value: T): Result<T, never> {
    return { isOk: true, isErr: false, value } as unknown as Result<T, never>;
}

function err<E>(error: E): Result<never, E> {
    return { isOk: false, isErr: true, error } as unknown as Result<never, E>;
}

function createAdapterEventEmitter(): IAdapterEvents {
    const listeners = new Map<AdapterEventType, Set<AdapterEventHandler<AdapterEventType>>>();

    return {
        on<T extends AdapterEventType>(event: T, handler: AdapterEventHandler<T>) {
            if (!listeners.has(event)) {
                listeners.set(event, new Set<AdapterEventHandler<AdapterEventType>>());
            }
            const eventListeners = listeners.get(event) as Set<AdapterEventHandler<T>> | undefined;
            eventListeners?.add(handler);
        },

        off<T extends AdapterEventType>(event: T, handler: AdapterEventHandler<T>) {
            const eventListeners = listeners.get(event) as Set<AdapterEventHandler<T>> | undefined;
            eventListeners?.delete(handler);
        },

        emit<T extends AdapterEventType>(event: T, payload: AdapterEventMap[T]) {
            const eventListeners = listeners.get(event) as Set<AdapterEventHandler<T>> | undefined;
            eventListeners?.forEach((listener) => {
                try {
                    listener(payload);
                } catch (error) {
                    console.error(`Error in event handler for '${event}':`, error);
                }
            });
        },
    };
}

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
// Realtime Handle Interfaces (internal — not exported)
// ============================================================================

/**
 * Internal extension of `WsConnectionHandle` that exposes dispatch methods
 * used by the push-event router in `handleMessage` to forward extension-host
 * events to registered webview listeners.
 */
interface WsVSCodeHandle extends WsConnectionHandle {
    readonly connectionId: string;
    onMessage(cb: (msg: WsMessage) => void): () => void;
    onStatusChange(cb: (status: ConnectionStatus) => void): () => void;
    onError(cb: (error: string) => void): () => void;
    onHeaders(cb: (headers: Record<string, string>) => void): () => void;
    dispatchMessage(msg: WsMessage): void;
    dispatchStatus(status: ConnectionStatus): void;
    dispatchError(error: string): void;
    dispatchHeaders(headers: Record<string, string>): void;
}

/**
 * Internal extension of `SseConnectionHandle` that exposes dispatch methods
 * used by the push-event router in `handleMessage`.
 */
interface SseVSCodeHandle extends SseConnectionHandle {
    readonly connectionId: string;
    onEvent(cb: (event: SseEvent) => void): () => void;
    onStatusChange(cb: (status: ConnectionStatus) => void): () => void;
    onError(cb: (error: string) => void): () => void;
    onHeaders(cb: (headers: Record<string, string>) => void): () => void;
    dispatchEvent(event: SseEvent): void;
    dispatchStatus(status: ConnectionStatus): void;
    dispatchError(error: string): void;
    dispatchHeaders(headers: Record<string, string>): void;
}

/**
 * Creates an in-memory WS handle for the webview side.
 *
 * Each `on*` registration stores the callback in a `Set` and returns an
 * `Unsubscribe` that removes it. Each `dispatch*` method invokes all
 * callbacks currently in the corresponding set.
 *
 * @param connectionId - Must match `WsConnectionConfig.id`.
 */
function createWsVSCodeHandle(connectionId: string): WsVSCodeHandle {
    const messageListeners = new Set<(msg: WsMessage) => void>();
    const statusListeners = new Set<(status: ConnectionStatus) => void>();
    const errorListeners = new Set<(error: string) => void>();
    const headerListeners = new Set<(headers: Record<string, string>) => void>();

    const handle: WsVSCodeHandle = {
        connectionId,
        onMessage(cb: (msg: WsMessage) => void) {
            messageListeners.add(cb);
            return () => messageListeners.delete(cb);
        },
        onStatusChange(cb: (status: ConnectionStatus) => void) {
            statusListeners.add(cb);
            return () => statusListeners.delete(cb);
        },
        onError(cb: (error: string) => void) {
            errorListeners.add(cb);
            return () => errorListeners.delete(cb);
        },
        onHeaders(cb: (headers: Record<string, string>) => void) {
            headerListeners.add(cb);
            return () => headerListeners.delete(cb);
        },
        dispatchMessage(msg) {
            messageListeners.forEach((cb) => cb(msg));
        },
        dispatchStatus(status) {
            statusListeners.forEach((cb) => cb(status));
        },
        dispatchError(error) {
            errorListeners.forEach((cb) => cb(error));
        },
        dispatchHeaders(headers) {
            headerListeners.forEach((cb) => cb(headers));
        },
    };

    return handle;
}

/**
 * Creates an in-memory SSE handle for the webview side.
 *
 * Mirrors the `createWsVSCodeHandle` pattern for SSE-specific event callbacks.
 *
 * @param connectionId - Must match `SseConnectionConfig.id`.
 */
function createSseVSCodeHandle(connectionId: string): SseVSCodeHandle {
    const eventListeners = new Set<(event: SseEvent) => void>();
    const statusListeners = new Set<(status: ConnectionStatus) => void>();
    const errorListeners = new Set<(error: string) => void>();
    const headerListeners = new Set<(headers: Record<string, string>) => void>();

    const handle: SseVSCodeHandle = {
        connectionId,
        onEvent(cb: (event: SseEvent) => void) {
            eventListeners.add(cb);
            return () => eventListeners.delete(cb);
        },
        onStatusChange(cb: (status: ConnectionStatus) => void) {
            statusListeners.add(cb);
            return () => statusListeners.delete(cb);
        },
        onError(cb: (error: string) => void) {
            errorListeners.add(cb);
            return () => errorListeners.delete(cb);
        },
        onHeaders(cb: (headers: Record<string, string>) => void) {
            headerListeners.add(cb);
            return () => headerListeners.delete(cb);
        },
        dispatchEvent(event) {
            eventListeners.forEach((cb) => cb(event));
        },
        dispatchStatus(status) {
            statusListeners.forEach((cb) => cb(status));
        },
        dispatchError(error) {
            errorListeners.forEach((cb) => cb(error));
        },
        dispatchHeaders(headers) {
            headerListeners.forEach((cb) => cb(headers));
        },
    };

    return handle;
}

// ============================================================================
// Request ID Generator
// ============================================================================

function generateRequestId(): string {
    // Use crypto.randomUUID() for guaranteed uniqueness even under concurrent calls.
    // Available in all modern browsers and VS Code webview contexts.
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `req-${crypto.randomUUID()}`;
    }
    // Fallback: manually construct a UUID v4
    return 'req-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ============================================================================
// VS Code Storage Adapter
// ============================================================================

function createVSCodeStorageAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    defaultTimeout: number
): IStorageAdapter {
    /**
     * Sends a request and waits for the response using requestId correlation.
     * Returns Result<T, string> where error comes from response.error field.
     */
    function sendAndWait<T>(
        type: string,
        data?: Record<string, unknown>
    ): Promise<Result<T, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();
            
            const timeout = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out: ${type}`));
            }, defaultTimeout);

            // Map request types to the field name in the response that contains the data.
            // The promise resolution uses `requestId` correlation (not message type matching).
            // Response message types differ from request types (e.g., 'loadCollections' → 'collectionsLoaded'),
            // but this doesn't matter since we match by requestId.
            // Empty string means the response doesn't have a data field (void operations).
            const responseDataMap: Record<string, string> = {
                'loadCollections': 'collections',
                'saveCollection': 'collection',
                'saveRequestToCollection': 'collection',
                'importCollection': 'collections',
                'exportCollection': 'filePath',
                'loadEnvironments': 'environments',
                'saveEnvironment': 'environment',
                'importEnvironments': 'environments',
                'exportEnvironments': 'filePath',
                'loadHistory': 'history',
                'deleteHistoryItem': '',         // void - no data field
                'loadCookies': 'cookies',
                'saveCookies': '',           // void - no data field
                'loadAuths': 'auths',
                'saveAuths': '',             // void - no data field
                'loadProxies': 'proxies',
                'saveProxies': '',           // void - no data field
                'loadCerts': 'certs',
                'saveCerts': '',             // void - no data field
                'loadValidationRules': 'rules',
                'saveValidationRules': '',   // void - no data field
                'loadSettings': 'settings',
                'saveSettings': '',          // void - no data field
                'loadFlows': 'flows',
                'saveFlow': 'flow',
                'deleteFlow': '',            // void - no data field
                'loadTestSuites': 'testSuites',
                'saveTestSuite': 'testSuite',
                'deleteTestSuite': '',       // void - no data field
                'deleteCollection': '',              // void - no data field
                'deleteRequestFromCollection': 'collection',
            };

            pendingRequests.set(requestId, {
                resolve: (value) => {
                    const response = value as any;
                    // Check if response contains error field
                    if (response && response.error) {
                        resolve(err(response.error));
                    } else {
                        // Extract data from the appropriate field
                        const dataField = responseDataMap[type];
                        const responseData = dataField ? response[dataField] : undefined;
                        resolve(ok(responseData as T));
                    }
                },
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

    const storageAdapter: IStorageAdapter = {
        // Collections
        async loadCollections(): Promise<Result<Collection[], string>> {
            return sendAndWait<Collection[]>('loadCollections');
        },

        async saveCollection(collection: Collection): Promise<Result<Collection, string>> {
            // Request/response (not fire-and-forget): the UI must see real
            // success/failure — see plan rule "request/response over
            // fire-and-forget for mutations".
            return sendAndWait<Collection>('saveCollection', {
                data: { collection: JSON.stringify(collection, null, 2) }
            });
        },

        async deleteCollection(collectionId: string): Promise<Result<void, string>> {
            return sendAndWait<void>('deleteCollection', { data: { collectionId } });
        },

        async saveRequestToCollection(
            collectionFilename: string,
            itemPath: string[],
            item: CollectionItem,
            newCollectionName?: string
        ): Promise<Result<Collection, string>> {
            // Send the whole CollectionItem (id, name, description, request)
            // so item identity survives moves/duplicates — see FEAT-003.
            return sendAndWait<Collection>('saveRequestToCollection', {
                data: {
                    item: JSON.stringify(item, null, 2),
                    collectionFileName: collectionFilename,
                    folderPath: itemPath,
                    ...(newCollectionName ? { newCollectionName } : {}),
                }
            });
        },

        async deleteRequestFromCollection(collectionFilename: string, itemPath: string[], itemId: string): Promise<Result<Collection, string>> {
            return sendAndWait<Collection>('deleteRequestFromCollection', {
                data: { collectionFilename, itemPath, itemId }
            });
        },

        async importCollection(fileName: string, fileContent: string): Promise<Result<Collection[], string>> {
            return new Promise((resolve) => {
                const requestId = generateRequestId();
                
                const timeout = setTimeout(() => {
                    pendingRequests.delete(requestId);
                    resolve(err(`Request timed out: importCollection`));
                }, defaultTimeout);

                pendingRequests.set(requestId, {
                    resolve: (value) => {
                        const response = value as any;
                        if (response && response.error) {
                            resolve(err(response.error));
                        } else {
                            resolve(ok(response.collections as Collection[]));
                        }
                    },
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'importCollection',
                    requestId,
                    data: { fileName, fileContent }
                });
            });
        },

        async exportCollection(collectionFileName: string): Promise<Result<{ filePath: string; fileName: string }, string>> {
            return new Promise((resolve) => {
                const requestId = generateRequestId();
                
                const timeout = setTimeout(() => {
                    pendingRequests.delete(requestId);
                    resolve(err(`Request timed out: exportCollection`));
                }, defaultTimeout);

                pendingRequests.set(requestId, {
                    resolve: (value) => {
                        const response = value as any;
                        if (response && response.error) {
                            resolve(err(response.error));
                        } else {
                            resolve(ok({ filePath: response.filePath, fileName: response.fileName }));
                        }
                    },
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'exportCollection',
                    requestId,
                    data: { fileName: collectionFileName }
                });
            });
        },

        // Environments
        async loadEnvironments(): Promise<Result<Environment[], string>> {
            return sendAndWait<Environment[]>('loadEnvironments');
        },

        async saveEnvironment(environment: Environment): Promise<Result<void, string>> {
            return sendAndWait<void>('saveEnvironment', {
                data: { environment: JSON.stringify(environment, null, 2) }
            });
        },

        async saveEnvironments(environments: Environment[]): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveEnvironments',
                data: { environments: JSON.stringify(environments, null, 2) }
            });
            return ok(undefined);
        },

        async deleteEnvironment(environmentId: string): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'deleteEnvironment',
                data: { environmentId }
            });
            return ok(undefined);
        },

        async importEnvironments(fileContent: string): Promise<Result<Environment[], string>> {
            return new Promise((resolve) => {
                const requestId = generateRequestId();
                
                const timeout = setTimeout(() => {
                    pendingRequests.delete(requestId);
                    resolve(err(`Request timed out: importEnvironments`));
                }, defaultTimeout);

                pendingRequests.set(requestId, {
                    resolve: (value) => {
                        const response = value as any;
                        if (response && response.error) {
                            resolve(err(response.error));
                        } else {
                            resolve(ok(response.environments as Environment[]));
                        }
                    },
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'importEnvironments',
                    requestId,
                    data: { fileContent }
                });
            });
        },

        async exportEnvironments(): Promise<Result<{ filePath: string; fileName: string }, string>> {
            return new Promise((resolve) => {
                const requestId = generateRequestId();
                
                const timeout = setTimeout(() => {
                    pendingRequests.delete(requestId);
                    resolve(err(`Request timed out: exportEnvironments`));
                }, defaultTimeout);

                pendingRequests.set(requestId, {
                    resolve: (value) => {
                        const response = value as any;
                        if (response && response.error) {
                            resolve(err(response.error));
                        } else {
                            resolve(ok({ filePath: response.filePath, fileName: response.fileName }));
                        }
                    },
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'exportEnvironments',
                    requestId
                });
            });
        },

        // History
        async loadHistory(): Promise<Result<CollectionRequest[], string>> {
            return sendAndWait<CollectionRequest[]>('loadHistory');
        },

        async saveRequestToHistory(request: CollectionRequest): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveRequestToHistory',
                data: { requestContent: JSON.stringify(request) }
            });
            return ok(undefined);
        },

        async clearHistory(): Promise<Result<void, string>> {
            vsCodeApi.postMessage({ type: 'clearHistory' });
            return ok(undefined);
        },

        async deleteHistoryItem(requestId: string): Promise<Result<void, string>> {
            return sendAndWait<void>('deleteHistoryItem', { data: { requestId } });
        },

        // Cookies
        async loadCookies(): Promise<Result<Cookie[], string>> {
            return sendAndWait<Cookie[]>('loadCookies');
        },

        async saveCookies(cookies: Cookie[]): Promise<Result<void, string>> {
            return sendAndWait<void>('saveCookies', {
                data: { cookies: JSON.stringify(cookies, null, 2) }
            });
        },

        // Auth Store
        async loadAuths(): Promise<Result<Auth[], string>> {
            return sendAndWait<Auth[]>('loadAuths');
        },

        async saveAuths(auths: Auth[]): Promise<Result<void, string>> {
            return sendAndWait<void>('saveAuths', {
                data: { auths: JSON.stringify(auths, null, 2) }
            });
        },

        // Proxy Store
        async loadProxies(): Promise<Result<Proxy[], string>> {
            return sendAndWait<Proxy[]>('loadProxies');
        },

        async saveProxies(proxies: Proxy[]): Promise<Result<void, string>> {
            return sendAndWait<void>('saveProxies', {
                data: { proxies: JSON.stringify(proxies, null, 2) }
            });
        },

        // Certificate Store
        async loadCerts(): Promise<Result<Cert[], string>> {
            return sendAndWait<Cert[]>('loadCerts');
        },

        async saveCerts(certs: Cert[]): Promise<Result<void, string>> {
            return sendAndWait<void>('saveCerts', {
                data: { certs: JSON.stringify(certs, null, 2) }
            });
        },

        // Validation Rules Store
        async loadValidationRules(): Promise<Result<ValidationRule[], string>> {
            return sendAndWait<ValidationRule[]>('loadValidationRules');
        },

        async saveValidationRules(rules: ValidationRule[]): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'saveValidationRules',
                data: { rules }
            });
            return ok(undefined);
        },

        // Settings
        async loadSettings(): Promise<Result<AppSettings, string>> {
            return sendAndWait<AppSettings>('loadSettings');
        },

        async saveSettings(settings: AppSettings): Promise<Result<void, string>> {
            return sendAndWait<void>('saveSettings', {
                data: { settings: JSON.stringify(settings, null, 2) }
            });
        },

        // Flows
        async loadFlows(): Promise<Result<Flow[], string>> {
            return sendAndWait<Flow[]>('loadFlows');
        },

        async saveFlow(flow: Flow): Promise<Result<Flow, string>> {
            return sendAndWait<Flow>('saveFlow', {
                data: { flow: JSON.stringify(flow, null, 2) }
            });
        },

        async deleteFlow(flowId: string): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'deleteFlow',
                data: { flowId }
            });
            return ok(undefined);
        },

        // Test Suites
        async loadTestSuites(): Promise<Result<TestSuite[], string>> {
            return sendAndWait<TestSuite[]>('loadTestSuites');
        },

        async saveTestSuite(testSuite: TestSuite): Promise<Result<TestSuite, string>> {
            return sendAndWait<TestSuite>('saveTestSuite', {
                data: { testSuite: JSON.stringify(testSuite, null, 2) }
            });
        },

        async deleteTestSuite(testSuiteId: string): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'deleteTestSuite',
                data: { testSuiteId }
            });
            return ok(undefined);
        },

        async exportFile(fileName: string, content: string, mimeType: string): Promise<Result<{ filePath: string; fileName: string }, string>> {
            return new Promise((resolve) => {
                const requestId = generateRequestId();

                const timeout = setTimeout(() => {
                    pendingRequests.delete(requestId);
                    resolve(err(`Request timed out: exportFile`));
                }, defaultTimeout);

                pendingRequests.set(requestId, {
                    resolve: (value) => {
                        const response = value as any;
                        if (response && response.error) {
                            resolve(err(response.error));
                        } else {
                            resolve(ok({ filePath: response.filePath, fileName: response.fileName }));
                        }
                    },
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'exportFile',
                    requestId,
                    data: { fileName, content, mimeType }
                });
            });
        },
    };

    return storageAdapter;
}

// ============================================================================
// VS Code HTTP Adapter
// ============================================================================

function createVSCodeHttpAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    defaultTimeout: number
): IHttpAdapter {
    /**
     * Sends an HTTP request and waits for the response using requestId correlation.
     * Returns Result<HttpResponseResult, string> where error comes from response.error field.
     */
    function executeAndWait(config: HttpRequestConfig): Promise<Result<HttpResponseResult, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();
            
            const timeout = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out for ${config.url}`));
            }, config.timeout || defaultTimeout);

            pendingRequests.set(requestId, {
                resolve: (value) => {
                    const message = value as any;
                    if (message && message.error) {
                        resolve(err(message.error));
                    } else {
                        resolve(ok(message.response as HttpResponseResult));
                    }
                },
                reject: (error) => resolve(err(error.message)),
                timeout,
            });

            vsCodeApi.postMessage({
                type: 'httpRequest',
                requestId,  // For promise correlation
                request: config,  // Pass entire config (includes id, validation, etc.)
            });
        });
    }

    const httpAdapter: IHttpAdapter = {
        async executeRequest(config: HttpRequestConfig): Promise<Result<HttpResponseResult, string>> {
            return executeAndWait(config);
        },

        /**
         * Asks the extension host to abort the in-flight request with `requestId`.
         * Uses the standard request/response correlation so the UI sees real
         * success/failure instead of an optimistic fire-and-forget. Resolves `ok`
         * even when the request had already finished (the cancel is a no-op).
         */
        cancelRequest(requestId: string): Promise<Result<void, string>> {
            return new Promise((resolve) => {
                const correlationId = generateRequestId();

                const timeout = setTimeout(() => {
                    pendingRequests.delete(correlationId);
                    resolve(err(`Cancel request timed out for ${requestId}`));
                }, defaultTimeout);

                pendingRequests.set(correlationId, {
                    resolve: (value) => {
                        const message = value as { error?: string } | undefined;
                        if (message && message.error) {
                            resolve(err(message.error));
                        } else {
                            resolve(ok(undefined));
                        }
                    },
                    reject: (error) => resolve(err(error.message)),
                    timeout,
                });

                vsCodeApi.postMessage({
                    type: 'cancelHttpRequest',
                    requestId: correlationId,
                    data: { requestId },
                });
            });
        },
    };

    return httpAdapter;
}

// ============================================================================
// VS Code File Adapter
// ============================================================================

function createVSCodeFileAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    defaultTimeout: number
): IFileAdapter {
    /**
     * Sends a file request and waits for the response using requestId correlation.
     * Returns Result<T, string> where error comes from response.error field.
     */
    function sendAndWait<T>(
        type: string,
        data?: Record<string, unknown>,
        timeout: number = defaultTimeout
    ): Promise<Result<T, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();
            
            const timeoutHandle = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out: ${type}`));
            }, timeout);

            pendingRequests.set(requestId, {
                resolve: (value) => {
                    const response = value as any;
                    if (response && response.error) {
                        resolve(err(response.error));
                    } else if (response && response.isOk !== undefined) {
                        // Response is already in Result format
                        if (response.isOk) {
                            resolve(ok(response.value as T));
                        } else {
                            resolve(err(response.error || 'Unknown error'));
                        }
                    } else {
                        resolve(ok(response as T));
                    }
                },
                reject: (error) => resolve(err(error.message)),
                timeout: timeoutHandle,
            });

            vsCodeApi.postMessage({
                type,
                requestId,
                ...data,
            });
        });
    }

    const fileAdapter: IFileAdapter = {
        async showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
            const result = await sendAndWait<string | null>('showSaveDialog', { options });
            return result.isOk ? result.value : null;
        },

        async showOpenDialog(options: OpenDialogOptions): Promise<string[] | null> {
            const result = await sendAndWait<string[] | null>('showOpenDialog', { options });
            return result.isOk ? result.value : null;
        },

        async readFile(path: string): Promise<Result<string, string>> {
            return sendAndWait<string>('readFile', { path });
        },

        async readFileAsBinary(path: string): Promise<Result<Uint8Array, string>> {
            const result = await sendAndWait<{ data: string; encoding: string }>('readFileAsBinary', { path });
            if (result.isOk && result.value) {
                // Decode base64 to Uint8Array
                const binaryString = atob(result.value.data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return ok(bytes);
            }
            return err(result.isOk ? 'No data received' : result.error);
        },

        async writeFile(path: string, content: string): Promise<Result<void, string>> {
            return sendAndWait<void>('writeFile', { path, content });
        },

        async writeBinaryFile(path: string, data: Uint8Array): Promise<Result<void, string>> {
            // Convert Uint8Array to base64 for transport
            const base64 = btoa(String.fromCharCode(...data));
            return sendAndWait<void>('writeBinaryFile', { path, data: base64, encoding: 'base64' });
        },

        /**
         * Request extension-host file download using correlated request/response.
         * Wire shape: { type: 'downloadResponse', requestId, data: { body, fileName, contentType } }.
         */
        async downloadResponse(data: Uint8Array, filename: string, contentType: string): Promise<Result<void, string>> {
            // Convert Uint8Array to base64 for transport
            const base64 = btoa(String.fromCharCode(...data));
            return sendAndWait<void>('downloadResponse', {
                data: {
                    body: base64,
                    fileName: filename,
                    contentType,
                },
            });
        },

        async importFile(options: OpenDialogOptions): Promise<Result<{ content: string; filename: string } | null, string>> {
            return sendAndWait<{ content: string; filename: string } | null>('importFile', { options });
        },
    };

    return fileAdapter;
}

// ============================================================================
// VS Code Secret Adapter
// ============================================================================

function createVSCodeSecretAdapter(vsCodeApi: VSCodeAPI): ISecretAdapter {
    // Secrets are handled by the extension via SecurityService
    // These are placeholder implementations
    const secretAdapter: ISecretAdapter = {
        async storeSecret(key: string, value: string): Promise<Result<void, string>> {
            return err('Secret storage handled by extension');
        },

        async getSecret(key: string): Promise<Result<string | undefined, string>> {
            return err('Secret retrieval handled by extension');
        },

        async deleteSecret(key: string): Promise<Result<void, string>> {
            return err('Secret deletion handled by extension');
        },

        async hasSecret(key: string): Promise<boolean> {
            return false;
        },
    };

    return secretAdapter;
}

// ============================================================================
// VS Code Security Adapter
// ============================================================================

function createVSCodeSecurityAdapter(vsCodeApi: VSCodeAPI): ISecurityAdapter {
    const securityAdapter: ISecurityAdapter = {
        async getEncryptionStatus(): Promise<EncryptionStatus> {
            vsCodeApi.postMessage({ type: 'getEncryptionStatus' });
            // Response comes via encryptionStatus message
            return { enabled: false, hasKey: false, recoveryAvailable: false };
        },

        async enableEncryption(password: string): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'enableEncryption',
                data: { password }
            });
            return ok(undefined);
        },

        async disableEncryption(password: string): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'disableEncryption',
                data: { password }
            });
            return ok(undefined);
        },

        async changePassword(oldPassword: string, newPassword: string): Promise<Result<void, string>> {
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

        async recoverWithKey(recoveryKeyPath: string): Promise<Result<void, string>> {
            vsCodeApi.postMessage({
                type: 'recoverWithKey',
                data: { recoveryKeyPath }
            });
            return ok(undefined);
        },
    };

    return securityAdapter;
}

// ============================================================================
// VS Code Notification Adapter
// ============================================================================

function createVSCodeNotificationAdapter(events: IAdapterEvents): INotificationAdapter {
    const notificationAdapter: INotificationAdapter = {
        showNotification(type: NotificationType, message: string, _duration?: number) {
            // Route notifications through the banner event system so they surface
            // as visible banners in the webview UI.
            const bannerType = type === 'success' ? 'success'
                : type === 'error' ? 'error'
                : type === 'warning' ? 'warning'
                : 'info';
            events.emit('banner', { type: bannerType, message });
        },

        async showConfirmation(message: string, confirmLabel?: string, cancelLabel?: string): Promise<boolean> {
            // Could be implemented via extension's vscode.window.showInformationMessage
            return window.confirm(message);
        },

        async showInput(message: string, defaultValue?: string, placeholder?: string): Promise<string | null> {
            // Could be implemented via extension's vscode.window.showInputBox
            return window.prompt(message, defaultValue) ?? null;
        },
    };

    return notificationAdapter;
}

// ============================================================================
// VS Code Clipboard Adapter
// ============================================================================

/**
 * Routes clipboard operations through the extension host using the existing
 * sendAndWait pattern. The extension host uses `vscode.env.clipboard` which
 * works reliably regardless of webview focus or browser permission state.
 */
function createVSCodeClipboardAdapter(
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    defaultTimeout: number
): IClipboardAdapter {
    function sendAndWait<T>(type: string, data?: Record<string, unknown>): Promise<Result<T, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();

            const timeout = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out: ${type}`));
            }, defaultTimeout);

            pendingRequests.set(requestId, {
                resolve: (value) => {
                    const response = value as any;
                    if (response && response.error) {
                        resolve(err(response.error as string));
                    } else {
                        resolve(ok(response.data as T));
                    }
                },
                reject: (error) => resolve(err(error.message)),
                timeout,
            });

            vsCodeApi.postMessage({ type, requestId, ...data });
        });
    }

    const clipboardAdapter: IClipboardAdapter = {
        async readText() {
            return sendAndWait<string>('clipboard.readText');
        },
        async writeText(value: string) {
            return sendAndWait<void>('clipboard.writeText', { data: { value } });
        },
    };

    return clipboardAdapter;
}

// ============================================================================
// VS Code Realtime Adapter
// ============================================================================

/**
 * Creates the VS Code realtime adapter that implements `IRealtimeAdapter`.
 *
 * The adapter is purely a postMessage bridge: it creates in-memory handles
 * (via `createWsVSCodeHandle` / `createSseVSCodeHandle`), stores them in the
 * shared `wsHandles` / `sseHandles` registries, and sends `ws.*` / `sse.*`
 * commands to the extension host via `vsCodeApi.postMessage`.
 *
 * Push events arriving from the extension host (delivered by `handleMessage`
 * in the `createVSCodeAdapter` closure) are routed back to the correct handle
 * via the `dispatch*` methods — see TASK-005 routing code.
 *
 * @param wsHandles - Shared registry of active WS handles (keyed by connectionId).
 * @param sseHandles - Shared registry of active SSE handles (keyed by connectionId).
 * @param vsCodeApi - The VS Code webview API for sending postMessages.
 * @param pendingRequests - Shared map for request/response correlation.
 * @param defaultTimeout - Timeout in ms for `sendAndWait` operations.
 */
function createVSCodeRealtimeAdapter(
    wsHandles: Map<string, WsVSCodeHandle>,
    sseHandles: Map<string, SseVSCodeHandle>,
    vsCodeApi: VSCodeAPI,
    pendingRequests: Map<string, PendingRequest<unknown>>,
    defaultTimeout: number
): IRealtimeAdapter {
    /**
     * Sends a realtime command and waits for the extension host's response
     * using requestId correlation. Returns `Result<T, string>`.
     *
     * `responseDataMap` is empty for all realtime operations because they are
     * void (the host replies with an error field or nothing at all).
     */
    function sendAndWait<T>(
        type: string,
        data?: Record<string, unknown>
    ): Promise<Result<T, string>> {
        return new Promise((resolve) => {
            const requestId = generateRequestId();

            const timeout = setTimeout(() => {
                pendingRequests.delete(requestId);
                resolve(err(`Request timed out: ${type}`));
            }, defaultTimeout);

            const responseDataMap: Record<string, string> = {
                'ws.disconnect': '',    // void — no data field
                'ws.send': '',          // void — no data field
                'sse.disconnect': '',   // void — no data field
            };

            pendingRequests.set(requestId, {
                resolve: (value) => {
                    const response = value as any;
                    if (response && response.error) {
                        resolve(err(response.error as string));
                    } else {
                        const dataField = responseDataMap[type];
                        const responseData = dataField ? response[dataField] : undefined;
                        resolve(ok(responseData as T));
                    }
                },
                reject: (error) => resolve(err(error.message)),
                timeout,
            });

            vsCodeApi.postMessage({ type, requestId, ...data });
        });
    }

    const realtimeAdapter: IRealtimeAdapter = {
        /**
         * Opens a WebSocket connection.
         *
         * Creates a local `WsVSCodeHandle`, registers it in `wsHandles`, and
         * sends `ws.connect` to the extension host. The handle is returned
         * immediately; callers register callbacks on it to receive push events
         * that the extension host will forward once the real socket is open.
         */
        connectWebSocket(config: WsConnectionConfig): WsConnectionHandle {
            const handle = createWsVSCodeHandle(config.id);
            wsHandles.set(config.id, handle);
            vsCodeApi.postMessage({ type: 'ws.connect', config });
            return handle;
        },

        /**
         * Closes the WebSocket connection identified by `connectionId`.
         *
         * Sends `ws.disconnect` and awaits `ws.disconnectResponse`. The handle
         * is removed from the registry after the host responds.
         */
        async disconnectWebSocket(connectionId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('ws.disconnect', { connectionId });
            wsHandles.delete(connectionId);
            return result;
        },

        /**
         * Sends a text message over an active WebSocket connection.
         *
         * Sends `ws.send` and awaits `ws.sendResponse` from the extension host.
         */
        async sendWebSocketMessage(connectionId: string, message: string): Promise<Result<void, string>> {
            return sendAndWait<void>('ws.send', { connectionId, message });
        },

        /**
         * Opens a Server-Sent Events connection.
         *
         * Creates a local `SseVSCodeHandle`, registers it in `sseHandles`, and
         * sends `sse.connect` to the extension host. The handle is returned
         * immediately; callers register callbacks on it to receive push events.
         */
        connectSse(config: SseConnectionConfig): SseConnectionHandle {
            const handle = createSseVSCodeHandle(config.id);
            sseHandles.set(config.id, handle);
            vsCodeApi.postMessage({ type: 'sse.connect', config });
            return handle;
        },

        /**
         * Closes the SSE stream identified by `connectionId`.
         *
         * Sends `sse.disconnect` and awaits `sse.disconnectResponse`. The handle
         * is removed from the registry after the host responds.
         */
        async disconnectSse(connectionId: string): Promise<Result<void, string>> {
            const result = await sendAndWait<void>('sse.disconnect', { connectionId });
            sseHandles.delete(connectionId);
            return result;
        },
    };

    return realtimeAdapter;
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
 * 
 * The adapter handles two types of messages:
 * 1. Request/Response: Matched by requestId correlation
 * 2. Push Events: Emitted via adapter.events (banner, state changes, etc.)
 */
export function createVSCodeAdapter(
    vsCodeApi: VSCodeAPI,
    options: CreateVSCodeAdapterOptions = {}
): {
    adapter: IPlatformAdapter;
    handleMessage: MessageListener;
    cleanup: () => void;
} {
    const defaultTimeout = options.defaultTimeout ?? 120000;
    const pendingRequests = new Map<string, PendingRequest<unknown>>();

    // Create event emitter for push notifications
    const events: IAdapterEvents = createAdapterEventEmitter();

    // Realtime handle registries — shared between the realtime adapter and the push-event router.
    // These maps live in the createVSCodeAdapter closure so both can access them by reference.
    const wsHandles = new Map<string, WsVSCodeHandle>();
    const sseHandles = new Map<string, SseVSCodeHandle>();

    // Create adapters
    const storage = createVSCodeStorageAdapter(vsCodeApi, pendingRequests, defaultTimeout);
    const http = createVSCodeHttpAdapter(vsCodeApi, pendingRequests, defaultTimeout);
    const file = createVSCodeFileAdapter(vsCodeApi, pendingRequests, defaultTimeout);
    const secret = createVSCodeSecretAdapter(vsCodeApi);
    const security = createVSCodeSecurityAdapter(vsCodeApi);
    const notification = createVSCodeNotificationAdapter(events);
    const clipboard = createVSCodeClipboardAdapter(vsCodeApi, pendingRequests, defaultTimeout);
    const { adapter: arena, handleStreamMessage: arenaHandleStreamMessage } =
        createVSCodeArenaAdapter(vsCodeApi, pendingRequests, events, defaultTimeout);
    const realtime = createVSCodeRealtimeAdapter(wsHandles, sseHandles, vsCodeApi, pendingRequests, defaultTimeout);

    /**
     * Message handler for both request/response and push events.
     * 
     * Request/Response messages have a requestId and are matched to pending promises.
     * Push events (no requestId) are emitted via the events system.
     */
    const handleMessage: MessageListener = (event) => {
        const message = event.data;

        // 1. Route stream-correlated messages (keyed by streamId, no requestId).
        //    Must be checked BEFORE the generic requestId path so that
        //    arena.streamComplete / arena.streamError are not swallowed.
        if (message.streamId && arenaHandleStreamMessage(message)) {
            return;
        }
        if (message.streamId) {
            console.warn('[vsCodeAdapter] stream message NOT routed', { streamId: message.streamId, type: message.type });
        }

        // 2. Handle request/response messages (with requestId)
        if (message.requestId) {
            const pending = pendingRequests.get(message.requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                pendingRequests.delete(message.requestId);
                
                // Response includes error field if operation failed
                // Pass the entire message object so resolve handlers can check for error field
                pending.resolve(message);
            }
            return; // Don't process as push event
        }

        // 3. Handle push events (no requestId, no streamId)
        switch (message.type) {
            // ── WebSocket push events ────────────────────────────────────────
            // These are routed by connectionId to the correct WsVSCodeHandle.
            // A missing handle (e.g., stale event after disconnect) is silently
            // ignored via optional chaining — no error is thrown.
            case 'ws.message': {
                const handle = wsHandles.get(message.connectionId);
                handle?.dispatchMessage(message.message as WsMessage);
                break;
            }
            case 'ws.status': {
                const handle = wsHandles.get(message.connectionId);
                handle?.dispatchStatus(message.status as ConnectionStatus);
                break;
            }
            case 'ws.headers': {
                const handle = wsHandles.get(message.connectionId);
                handle?.dispatchHeaders(message.headers as Record<string, string>);
                break;
            }
            case 'ws.error': {
                const handle = wsHandles.get(message.connectionId);
                handle?.dispatchError(message.error as string);
                break;
            }
            // ── SSE push events ──────────────────────────────────────────────
            // Same routing strategy as WS: lookup by connectionId, no-op on miss.
            case 'sse.event': {
                const handle = sseHandles.get(message.connectionId);
                handle?.dispatchEvent(message.event as SseEvent);
                break;
            }
            case 'sse.status': {
                const handle = sseHandles.get(message.connectionId);
                handle?.dispatchStatus(message.status as ConnectionStatus);
                break;
            }
            case 'sse.headers': {
                const handle = sseHandles.get(message.connectionId);
                handle?.dispatchHeaders(message.headers as Record<string, string>);
                break;
            }
            case 'sse.error': {
                const handle = sseHandles.get(message.connectionId);
                handle?.dispatchError(message.error as string);
                break;
            }

            // Banner/notification events
            case 'bannerSuccess':
                events.emit('banner', { type: 'success', message: message.message, link: message.link, timeoutSeconds: message.timeoutSeconds });
                break;
            case 'bannerError':
                events.emit('banner', { type: 'error', message: message.message, link: message.link, timeoutSeconds: message.timeoutSeconds });
                break;
            case 'bannerInfo':
                events.emit('banner', { type: 'info', message: message.message, link: message.link, timeoutSeconds: message.timeoutSeconds });
                break;
            case 'bannerWarning':
                events.emit('banner', { type: 'warning', message: message.message, link: message.link, timeoutSeconds: message.timeoutSeconds });
                break;

            // Encryption/security events
            case 'encryptionStatus':
                events.emit('encryptionStatusChanged', message.status);
                break;
            case 'encryptionComplete':
                events.emit('encryptionComplete', undefined);
                break;
            case 'decryptionComplete':
                events.emit('decryptionComplete', undefined);
                break;
            case 'recoveryKeyExported':
                events.emit('recoveryKeyExported', { path: message.path });
                break;
            case 'recoveryComplete':
                events.emit('recoveryComplete', undefined);
                break;

            // Data change events (for external modifications)
            case 'collectionsChanged':
                events.emit('collectionsChanged', undefined);
                break;
            case 'environmentsChanged':
                events.emit('environmentsChanged', undefined);
                break;
            case 'historyChanged':
                events.emit('historyChanged', undefined);
                break;
            case 'cookiesChanged':
                events.emit('cookiesChanged', undefined);
                break;
            case 'settingsChanged':
                events.emit('settingsChanged', undefined);
                break;

            // Note: Other message types without requestId are ignored
            // They may be legacy messages handled elsewhere
        }
    };

    // Cleanup function
    const cleanup = () => {
        pendingRequests.forEach((pending) => {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Adapter disposed'));
        });
        pendingRequests.clear();

        // Fire-and-forget disconnect for all active realtime connections.
        // Handles are cleared so no stale push events are routed after disposal.
        wsHandles.forEach((_, id) => { void realtime.disconnectWebSocket(id); });
        sseHandles.forEach((_, id) => { void realtime.disconnectSse(id); });
        wsHandles.clear();
        sseHandles.clear();
    };

    const adapter: IPlatformAdapter = {
        platform: 'vscode',
        storage,
        http,
        file,
        secret,
        security,
        notification,
        arena,
        clipboard,
        realtime,
        events,

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
