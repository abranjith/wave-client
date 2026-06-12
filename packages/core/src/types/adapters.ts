/**
 * Platform Adapter Interfaces for Wave Client
 * 
 * These interfaces define the contract between the platform-agnostic UI (wave-client-core)
 * and platform-specific implementations (wave-client-vscode, wave-client-web).
 * 
 * The current codebase uses 40+ message types for webview <-> extension communication.
 * These interfaces formalize that boundary, allowing the same React UI to run on:
 * - VS Code (using SecretStorage, Node.js fs, axios)
 * - Web browsers (using IndexedDB, fetch, Web Crypto API)
 */

import { Result, Ok, Err } from '../utils/result';
import type {
    Collection,
    CollectionItem,
    CollectionRequest,
    Environment,
    Cookie,
    Proxy,
    Cert,
    ResponseData,
    HeaderRow,
    ParamRow,
    CollectionBody,
    SentRequestData,
    MoveCollectionItemResult,
} from './collection';
import type { Flow } from './flow';
import type { TestSuite } from './testSuite';
import type { RequestValidation, ValidationResult } from './validation';
import type { Auth } from './auth';
import type { ValidationRule } from './validation';
import type {
    ArenaSession,
    ArenaMessage,
    ArenaSettings,
    ArenaChatRequest,
    ArenaChatResponse,
    ArenaChatStreamChunk,
    StreamHandle,
} from './arena';
import type { ArenaReference } from '../config/arenaConfig';
import type { ArenaProviderSettingsMap } from '../config/arenaConfig';
import type { DynamicModelInfo } from '../config/arenaConfig';
import type {
    WsConnectionConfig,
    WsConnectionHandle,
    SseConnectionConfig,
    SseConnectionHandle,
} from './realtime';

// ============================================================================
// Common Types
// ============================================================================

/**
 * App settings stored by the platform
 */
export interface AppSettings {
    encryptionEnabled: boolean;
    theme?: 'light' | 'dark' | 'system';
    defaultTimeout?: number;
    autoSaveHistory?: boolean;
    maxHistoryItems?: number;
    [key: string]: unknown;
}

/**
 * HTTP request configuration for adapter
 * 
 * Headers and params can be in either:
 * - Raw form: HeaderRow[] / ParamRow[] (before processing)
 * - Processed form: Record<string, string | string[]> / string (after buildHttpRequest)
 * 
 * This flexibility allows the adapter to work with both raw inputs and
 * pre-processed requests from buildHttpRequest.
 */
export interface HttpRequestConfig {
    id: string;
    method: string;
    url: string;
    headers: HeaderRow[] | Record<string, string | string[]>;
    params: ParamRow[] | string;
    body: CollectionBody | unknown;
    auth?: Auth;
    envVars: Record<string, string>;
    proxy?: Proxy;
    cert?: Cert;
    timeout?: number;
    /** Validation rules to run against the response */
    validation?: RequestValidation;
}

/**
 * HTTP response from adapter
 */
export interface HttpResponseResult {
    id: string;
    status: number;
    statusText: string;
    elapsedTime: number;
    size: number;
    body: string;
    headers: Record<string, string>;
    isEncoded: boolean;
    cookies?: Cookie[];
    /** Validation results if validation was requested */
    validationResult?: ValidationResult;
    /** Ephemeral snapshot of the request that was sent on the wire. */
    sentRequest?: SentRequestData;
}

/**
 * File save dialog options
 */
export interface SaveDialogOptions {
    defaultFileName?: string;
    filters?: { name: string; extensions: string[] }[];
    title?: string;
}

/**
 * File open dialog options
 */
export interface OpenDialogOptions {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    canSelectMany?: boolean;
    canSelectFolders?: boolean;
}

/**
 * Notification types
 */
export type NotificationType = 'success' | 'error' | 'info' | 'warning';

/**
 * Encryption status returned by security adapter
 */
export interface EncryptionStatus {
    enabled: boolean;
    hasKey: boolean;
    recoveryAvailable: boolean;
}

// ============================================================================
// Storage Adapter Interface
// ============================================================================

/**
 * Handles all persistent storage operations for collections, environments,
 * history, cookies, auth configs, proxies, certs, and settings.
 * 
 * VS Code implementation: File system storage with BaseStorageService
 * Web implementation: IndexedDB or server-side storage with user auth
 */
export interface IStorageAdapter {
    // Collections
    loadCollections(): Promise<Result<Collection[], string>>;
    saveCollection(collection: Collection): Promise<Result<Collection, string>>;
    deleteCollection(collectionId: string): Promise<Result<void, string>>;
    saveRequestToCollection(
        collectionFilename: string,
        itemPath: string[],
        item: CollectionItem,
        /** Optional collection name to create when destination collection does not exist. */
        newCollectionName?: string
    ): Promise<Result<Collection, string>>;
    deleteRequestFromCollection(
        collectionFilename: string,
        itemPath: string[],
        itemId: string
    ): Promise<Result<Collection, string>>;
    importCollection(fileName: string, fileContent: string, newCollectionName?: string): Promise<Result<Collection[], string>>;
    exportCollection(collectionFileName: string): Promise<Result<{ filePath: string; fileName: string }, string>>;
    moveCollectionItem(
        sourceFileName: string,
        sourceItemPath: string[],
        itemId: string,
        destinationFileName: string,
        destinationItemPath: string[],
        newCollectionName?: string
    ): Promise<Result<MoveCollectionItemResult, string>>;

    // Environments
    loadEnvironments(): Promise<Result<Environment[], string>>;
    saveEnvironment(environment: Environment): Promise<Result<void, string>>;
    saveEnvironments(environments: Environment[]): Promise<Result<void, string>>;
    deleteEnvironment(environmentId: string): Promise<Result<void, string>>;
    /** Imports environments and resolves with the full environment list after import (not just the imported entries). */
    importEnvironments(fileContent: string): Promise<Result<Environment[], string>>;
    exportEnvironments(): Promise<Result<{ filePath: string; fileName: string }, string>>;

    // History
    loadHistory(): Promise<Result<CollectionRequest[], string>>;
    saveRequestToHistory(request: CollectionRequest): Promise<Result<void, string>>;
    clearHistory(): Promise<Result<void, string>>;
    deleteHistoryItem(requestId: string): Promise<Result<void, string>>;

    // Cookies
    loadCookies(): Promise<Result<Cookie[], string>>;
    saveCookies(cookies: Cookie[]): Promise<Result<void, string>>;

    // Auth Store
    loadAuths(): Promise<Result<Auth[], string>>;
    saveAuths(auths: Auth[]): Promise<Result<void, string>>;

    // Proxy Store
    loadProxies(): Promise<Result<Proxy[], string>>;
    saveProxies(proxies: Proxy[]): Promise<Result<void, string>>;

    // Certificate Store
    loadCerts(): Promise<Result<Cert[], string>>;
    saveCerts(certs: Cert[]): Promise<Result<void, string>>;

    // Validation Rules Store
    loadValidationRules(): Promise<Result<ValidationRule[], string>>;
    saveValidationRules(rules: ValidationRule[]): Promise<Result<void, string>>;

    // Flows
    loadFlows(): Promise<Result<Flow[], string>>;
    saveFlow(flow: Flow): Promise<Result<Flow, string>>;
    deleteFlow(flowId: string): Promise<Result<void, string>>;

    // Test Suites
    loadTestSuites(): Promise<Result<TestSuite[], string>>;
    saveTestSuite(suite: TestSuite): Promise<Result<TestSuite, string>>;
    deleteTestSuite(suiteId: string): Promise<Result<void, string>>;

    // Settings
    loadSettings(): Promise<Result<AppSettings, string>>;
    saveSettings(settings: AppSettings): Promise<Result<void, string>>;

    /**
     * Saves an in-memory string to disk as a file chosen by the user.
     *
     * @param fileName - Suggested file name shown in the save dialog (VS Code) or used as
     *   the `download` attribute (Web). The caller is responsible for sanitization and
     *   correct extension; this method does not modify the name.
     * @param content - UTF-8 text content to write. Must not contain sensitive data that
     *   should not be logged.
     * @param mimeType - Content type (e.g. `"text/html"`, `"application/json"`). Used to
     *   build the save-dialog filter on VS Code and the `Blob` type on Web.
     *
     * @returns On success: `{ filePath, fileName }` where `filePath` is the absolute path
     *   chosen by the user (VS Code) or `''` (Web, which has no path concept) and
     *   `fileName` is the actual file name used (may differ from `fileName` param on VS
     *   Code if the user changed it in the dialog).
     *
     * **VS Code**: Opens a native save dialog. If the user cancels, resolves with
     * `err('Export cancelled by user')`. File-system errors resolve with `err(<reason>)`.
     *
     * **Web**: Triggers a browser download via a hidden `<a download>` element. Browser
     * download dialogs cannot report cancellation, so the method always resolves
     * `ok({ filePath: '', fileName })` after triggering the click. Only throws when
     * `Blob` construction or URL handling fails.
     */
    exportFile(
        fileName: string,
        content: string,
        mimeType: string
    ): Promise<Result<{ filePath: string; fileName: string }, string>>;
}

// ============================================================================
// HTTP Adapter Interface
// ============================================================================

/**
 * Handles HTTP request execution.
 * 
 * VS Code implementation: Axios with Node.js https agent
 * Web implementation: Fetch API with CORS handling
 */
export interface IHttpAdapter {
    /**
     * Execute an HTTP request
     */
    executeRequest(config: HttpRequestConfig): Promise<Result<HttpResponseResult, string>>;

    /**
     * Cancel an in-flight request by its id (the request/tab id used to issue it).
     *
     * The cancellation is routed to the platform's `HttpService`, which aborts the
     * **server-side** request. The aborted request resolves through the normal
     * response path as a UI-friendly Cancelled `HttpResponseResult`
     * (`status: 0`, `statusText: 'Cancelled'`) rather than rejecting.
     *
     * This method resolves with `ok(undefined)` whether or not a matching in-flight
     * request was found (cancelling an already-finished request is a no-op).
     * It resolves with `err(message)` only when the cancellation request itself
     * fails to reach the platform (e.g. a network/channel error).
     *
     * @param requestId The request/tab id to cancel.
     */
    cancelRequest(requestId: string): Promise<Result<void, string>>;
}

// ============================================================================
// File Dialog Adapter Interface
// ============================================================================

/**
 * Handles file system dialogs and file operations.
 * 
 * VS Code implementation: vscode.window.showSaveDialog, showOpenDialog
 * Web implementation: Browser File API, download via blob URLs
 */
export interface IFileAdapter {
    /**
     * Show save file dialog
     * Returns the selected file path or null if cancelled
     */
    showSaveDialog(options: SaveDialogOptions): Promise<string | null>;

    /**
     * Show open file dialog
     * Returns array of selected file paths or null if cancelled
     */
    showOpenDialog(options: OpenDialogOptions): Promise<string[] | null>;

    /**
     * Read file contents as text
     */
    readFile(path: string): Promise<Result<string, string>>;

    /**
     * Read file contents as binary
     */
    readFileAsBinary(path: string): Promise<Result<Uint8Array, string>>;

    /**
     * Write text content to file
     */
    writeFile(path: string, content: string): Promise<Result<void, string>>;

    /**
     * Write binary content to file
     */
    writeBinaryFile(path: string, data: Uint8Array): Promise<Result<void, string>>;

    /**
     * Download response body (may trigger save dialog or direct download)
     */
    downloadResponse(data: Uint8Array, filename: string, contentType: string): Promise<Result<void, string>>;

    /**
     * Import file and return its contents
     */
    importFile(options: OpenDialogOptions): Promise<Result<{ content: string; filename: string } | null, string>>;
}

// ============================================================================
// Secret Storage Adapter Interface
// ============================================================================

/**
 * Handles secure storage of sensitive data (encryption keys, recovery keys).
 * 
 * VS Code implementation: vscode.SecretStorage
 * Web implementation: Server-side encrypted storage with user auth (option B)
 *                     or localStorage for local-only mode (option A)
 */
export interface ISecretAdapter {
    /**
     * Store a secret value
     */
    storeSecret(key: string, value: string): Promise<Result<void, string>>;

    /**
     * Retrieve a secret value
     */
    getSecret(key: string): Promise<Result<string | undefined, string>>;

    /**
     * Delete a secret
     */
    deleteSecret(key: string): Promise<Result<void, string>>;

    /**
     * Check if a secret exists
     */
    hasSecret(key: string): Promise<boolean>;
}

// ============================================================================
// Security Adapter Interface
// ============================================================================

/**
 * Handles encryption/decryption operations.
 * 
 * VS Code implementation: Node.js crypto module
 * Web implementation: Web Crypto API
 * 
 * NOTE: Encryption logic moved entirely to adapter layer (option C).
 * Core package remains pure with no crypto dependencies.
 */
export interface ISecurityAdapter {
    /**
     * Get current encryption status
     */
    getEncryptionStatus(): Promise<EncryptionStatus>;

    /**
     * Enable encryption with a password
     */
    enableEncryption(password: string): Promise<Result<void, string>>;

    /**
     * Disable encryption (decrypts all data)
     */
    disableEncryption(password: string): Promise<Result<void, string>>;

    /**
     * Re-encrypt data with a new password
     */
    changePassword(oldPassword: string, newPassword: string): Promise<Result<void, string>>;

    /**
     * Export recovery key to file
     */
    exportRecoveryKey(): Promise<Result<void, string>>;

    /**
     * Recover encryption using recovery key file
     */
    recoverWithKey(recoveryKeyPath: string): Promise<Result<void, string>>;
}

// ============================================================================
// Notification Adapter Interface
// ============================================================================

/**
 * Handles user notifications and banners.
 * 
 * VS Code implementation: Banner messages via webview postMessage
 * Web implementation: Toast notifications or browser notifications
 */
export interface INotificationAdapter {
    /**
     * Show a notification/banner message
     */
    showNotification(type: NotificationType, message: string, duration?: number): void;

    /**
     * Show a confirmation dialog
     * Returns true if user confirms, false otherwise
     */
    showConfirmation?(message: string, confirmLabel?: string, cancelLabel?: string): Promise<boolean>;

    /**
     * Show an input dialog
     * Returns the input value or null if cancelled
     */
    showInput?(message: string, defaultValue?: string, placeholder?: string): Promise<string | null>;
}

// ============================================================================
// Arena Adapter Interface
// ============================================================================

/**
 * Handles Arena AI chat operations including sessions, messages, and documents.
 * 
 * VS Code implementation: Uses LangGraph agents via extension backend
 * Web implementation: Direct API calls to LLM providers or relay server
 */
export interface IArenaAdapter {
    // Session Management
    /**
     * Load all chat sessions
     */
    loadSessions(): Promise<Result<ArenaSession[], string>>;
    
    /**
     * Save a chat session
     */
    saveSession(session: ArenaSession): Promise<Result<void, string>>;
    
    /**
     * Delete a chat session and its messages
     */
    deleteSession(sessionId: string): Promise<Result<void, string>>;

    // Message Management
    /**
     * Load messages for a session
     */
    loadMessages(sessionId: string): Promise<Result<ArenaMessage[], string>>;
    
    /**
     * Save a message to a session
     */
    saveMessage(message: ArenaMessage): Promise<Result<void, string>>;
    
    /**
     * Delete all messages for a session
     */
    clearSessionMessages(sessionId: string): Promise<Result<void, string>>;

    // Chat Operations
    /**
     * Send a chat message and get a response
     * For non-streaming responses
     */
    sendMessage(request: ArenaChatRequest): Promise<Result<ArenaChatResponse, string>>;
    
    /**
     * Start a streaming chat and return a {@link StreamHandle} immediately.
     *
     * The handle exposes `onChunk`, `onDone`, `onError` subscriptions and a
     * `cancel()` method so the caller controls the full stream lifecycle
     * without juggling Promises or global events.
     */
    streamMessage(request: ArenaChatRequest): StreamHandle;

    // Settings
    /**
     * Load Arena settings
     */
    loadSettings(): Promise<Result<ArenaSettings, string>>;
    
    /**
     * Save Arena settings
     */
    saveSettings(settings: ArenaSettings): Promise<Result<void, string>>;
    
    /**
     * Validate API key for a provider
     */
    validateApiKey(provider: string, apiKey: string): Promise<Result<boolean, string>>;

    /**
     * Get available models for a provider, dynamically fetched from the provider API.
     * Returns an empty array if the provider is not supported or the fetch fails.
     */
    getAvailableModels(provider: string): Promise<Result<DynamicModelInfo[], string>>;

    // References (stored in .waveclient/arena/)
    /**
     * Load user-added references.
     * The UI merges these with the built-in defaults from `getDefaultReferences()`.
     */
    loadReferences(): Promise<Result<ArenaReference[], string>>;

    /**
     * Save user-added references.
     * Only non-default (user-added) references need to be persisted.
     */
    saveReferences(references: ArenaReference[]): Promise<Result<void, string>>;

    // Provider Settings (stored in .waveclient/arena/)
    /**
     * Load per-provider settings (API keys, URLs, disabled models).
     */
    loadProviderSettings(): Promise<Result<ArenaProviderSettingsMap, string>>;

    /**
     * Save per-provider settings.
     */
    saveProviderSettings(settings: ArenaProviderSettingsMap): Promise<Result<void, string>>;

    // MCP Server Lifecycle
    /**
     * Check the current MCP server status.
     * Returns the current connection state.
     */
    checkMcpStatus?(): Promise<Result<import('./arena').McpStatus, string>>;

    /**
     * Start or restart the MCP server.
     * Returns the new status after attempting to start.
     */
    startMcpServer?(): Promise<Result<import('./arena').McpStatus, string>>;
}

// ============================================================================
// Clipboard Adapter
// ============================================================================

/**
 * Platform clipboard adapter for reading and writing clipboard text.
 *
 * Implementations use platform-appropriate APIs:
 * - Web: browser `navigator.clipboard`
 * - VS Code: `vscode.env.clipboard` via the extension host bridge
 *
 * All methods return `Result` so callers can handle failures without try/catch.
 */
export interface IClipboardAdapter {
    /**
     * Read plain text from the platform clipboard.
     * Returns an error result if the clipboard cannot be read (e.g., permission
     * denied or focus requirements not met in the current environment).
     */
    readText(): Promise<Result<string, string>>;

    /**
     * Write plain text to the platform clipboard.
     * Returns an error result if the write fails.
     */
    writeText(value: string): Promise<Result<void, string>>;
}

// ============================================================================
// Realtime Adapter Interface
// ============================================================================

/**
 * Adapter interface for managing long-lived WebSocket and SSE connections.
 *
 * This interface is optional on `IPlatformAdapter` — platforms that have not yet
 * implemented realtime connectivity (e.g., before FEAT-008/009 land) may omit
 * it without breaking TypeScript. Components and hooks that require realtime
 * must guard against `adapter.realtime` being `undefined`.
 *
 * **WebSocket** connections are established synchronously — `connectWebSocket`
 * returns a `WsConnectionHandle` immediately. Auth resolution and the actual
 * network handshake happen inside the adapter; callers learn about status
 * changes, messages, headers, and errors via the handle's event callbacks.
 *
 * **SSE** connections follow the same callback-based handle model.
 *
 * @example
 * ```ts
 * const handle = adapter.realtime.connectWebSocket(config);
 * const unsubStatus = handle.onStatusChange(status => updateStore(status));
 * const unsubMsg    = handle.onMessage(msg => appendMessage(msg));
 * // ... later:
 * unsubStatus();
 * unsubMsg();
 * await adapter.realtime.disconnectWebSocket(handle.connectionId);
 * ```
 */
export interface IRealtimeAdapter {
    // ── WebSocket ────────────────────────────────────────────────────────────

    /**
     * Opens a WebSocket connection described by `config` and returns an
     * event-driven handle immediately. The connection is established
     * asynchronously; callers register callbacks on the handle to receive
     * status changes, messages, headers, and errors.
     *
     * The URL in `config` must use the `ws:` or `wss:` scheme — the
     * implementation must reject other schemes before any network I/O.
     *
     * @param config - Connection parameters (URL, headers, auth, query params).
     * @returns A `WsConnectionHandle` whose `connectionId` matches `config.id`.
     *
     * @example
     * ```ts
     * const handle = adapter.realtime.connectWebSocket({
     *   id: crypto.randomUUID(),
     *   url: 'wss://api.example.com/ws',
     *   headers: { 'x-client': 'wave' },
     * });
     * const unsub = handle.onMessage(msg => console.log(msg.content));
     * // later: unsub(); await adapter.realtime.disconnectWebSocket(handle.connectionId);
     * ```
     */
    connectWebSocket(config: WsConnectionConfig): WsConnectionHandle;

    /**
     * Gracefully closes the active WebSocket connection identified by
     * `connectionId`. Resolves when the close handshake completes or the
     * connection is already gone.
     *
     * @param connectionId - The `connectionId` from the originating `WsConnectionHandle`.
     * @returns `ok(undefined)` on success; `err(message)` if the disconnect fails.
     */
    disconnectWebSocket(connectionId: string): Promise<Result<void, string>>;

    /**
     * Sends a text message over the active WebSocket connection identified by
     * `connectionId`. The sent message also appears in the message timeline
     * (echoed by the service with `direction: 'sent'`).
     *
     * @param connectionId - The `connectionId` from the originating `WsConnectionHandle`.
     * @param message - The UTF-8 text payload to send.
     * @returns `ok(undefined)` on success; `err(message)` if the send fails.
     */
    sendWebSocketMessage(connectionId: string, message: string): Promise<Result<void, string>>;

    // ── SSE ──────────────────────────────────────────────────────────────────

    /**
     * Opens a Server-Sent Events connection described by `config` and returns
     * an event-driven handle immediately. Supports GET and POST-based SSE
     * endpoints (controlled by `config.method`). Status changes, events,
     * headers, and errors are delivered via the handle's callbacks.
     *
     * @param config - Connection parameters (method, URL, headers, auth, body).
     * @returns A `SseConnectionHandle` whose `connectionId` matches `config.id`.
     */
    connectSse(config: SseConnectionConfig): SseConnectionHandle;

    /**
     * Closes the active SSE stream identified by `connectionId`.
     *
     * @param connectionId - The `connectionId` from the originating `SseConnectionHandle`.
     * @returns `ok(undefined)` on success; `err(message)` if the disconnect fails.
     */
    disconnectSse(connectionId: string): Promise<Result<void, string>>;
}

// ============================================================================
// Combined Platform Adapter Interface
// ============================================================================

/**
 * Combined interface for all platform adapters.
 * Platform implementations (VS Code, Web) provide a single object implementing this interface.
 */
export interface IPlatformAdapter {
    storage: IStorageAdapter;
    http: IHttpAdapter;
    file: IFileAdapter;
    secret: ISecretAdapter;
    security: ISecurityAdapter;
    notification: INotificationAdapter;
    arena: IArenaAdapter;

    /** Platform clipboard adapter — routes read/write through the active platform. */
    clipboard: IClipboardAdapter;

    /**
     * Optional realtime adapter for WebSocket and SSE connections.
     * Absent until FEAT-008 (VS Code) and FEAT-009 (Web) implement it.
     * Components and hooks must guard against this being `undefined`.
     */
    realtime?: IRealtimeAdapter;

    /**
     * Event emitter for push notifications from the platform.
     * Components can subscribe to events like 'banner', 'collectionsChanged', etc.
     * 
     * @example
     * ```tsx
     * useEffect(() => {
     *   const handleBanner = (event: BannerEvent) => {
     *     setBanner({ type: event.type, message: event.message });
     *   };
     *   adapter.events.on('banner', handleBanner);
     *   return () => adapter.events.off('banner', handleBanner);
     * }, [adapter]);
     * ```
     */
    events: IAdapterEvents;

    /**
     * Platform identifier
     */
    readonly platform: 'vscode' | 'web' | 'test';

    /**
     * Initialize the adapter (called once on app start)
     */
    initialize?(): Promise<void>;

    /**
     * Cleanup resources (called on app unmount)
     */
    dispose?(): void;
}

// ============================================================================
// Adapter Events (for push notifications from platform)
// ============================================================================

/**
 * Push events that the platform can emit to notify the UI.
 * These are NOT request/response pairs - they're one-way notifications.
 * 
 * There are two categories of events:
 * 
 * 1. **Notification Events** - User-facing messages (banners, toasts)
 *    - `banner`: Success/error/info/warning messages to display to the user
 * 
 * 2. **State Change Events** - External changes that UI should react to
 *    - `collectionsChanged`: Collections modified externally (e.g., file system watcher)
 *    - `environmentsChanged`: Environments modified externally
 *    - `encryptionStatusChanged`: Encryption state changed
 *    - etc.
 * 
 * VS Code: These come from MessageHandler.ts via postMessage
 * Web: These could come from WebSocket, server-sent events, or localStorage events
 */

/**
 * Banner/notification event payload
 */
export interface BannerEvent {
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    link?: { text: string; href: string };
    timeoutSeconds?: number;
}

/**
 * Encryption status change event payload
 */
export interface EncryptionStatusEvent {
    enabled: boolean;
    hasKey: boolean;
    recoveryAvailable: boolean;
}

/**
 * Map of event types to their payload types
 */
export interface AdapterEventMap {
    // Notification events
    banner: BannerEvent;
    
    // State change events (payload is void - just signals that data changed)
    collectionsChanged: void;
    environmentsChanged: void;
    historyChanged: void;
    cookiesChanged: void;
    authsChanged: void;
    proxiesChanged: void;
    certsChanged: void;
    settingsChanged: void;
    validationRulesChanged: void;
    flowsChanged: void;
    testSuitesChanged: void;
    
    // Security events
    encryptionStatusChanged: EncryptionStatusEvent;
    encryptionComplete: void;
    decryptionComplete: void;
    recoveryKeyExported: { path: string };
    recoveryComplete: void;
    
    // Arena events
    arenaSessionsChanged: void;
    arenaMessagesChanged: { sessionId: string };
    arenaSettingsChanged: void;
    arenaStreamChunk: ArenaChatStreamChunk;
}

/**
 * Union type of all event names
 */
export type AdapterEventType = keyof AdapterEventMap;

/**
 * Event handler function type
 */
export type AdapterEventHandler<T extends AdapterEventType> = (
    payload: AdapterEventMap[T]
) => void;

/**
 * Interface for subscribing to adapter events.
 * Implemented by platform adapters to allow UI components to react to push events.
 * 
 * Usage:
 * ```tsx
 * const adapter = useAdapter();
 * 
 * useEffect(() => {
 *   const handleBanner = (event: BannerEvent) => {
 *     showBanner(event.type, event.message);
 *   };
 *   
 *   adapter.events.on('banner', handleBanner);
 *   return () => adapter.events.off('banner', handleBanner);
 * }, [adapter]);
 * ```
 */
export interface IAdapterEvents {
    /**
     * Subscribe to an event
     */
    on<T extends AdapterEventType>(
        event: T,
        handler: AdapterEventHandler<T>
    ): void;

    /**
     * Unsubscribe from an event
     */
    off<T extends AdapterEventType>(
        event: T,
        handler: AdapterEventHandler<T>
    ): void;

    /**
     * Emit an event (used internally by adapter implementations)
     */
    emit<T extends AdapterEventType>(
        event: T,
        payload: AdapterEventMap[T]
    ): void;
}

/**
 * Simple event emitter implementation for adapters
 */
export function createAdapterEventEmitter(): IAdapterEvents {
    const listeners = new Map<AdapterEventType, Set<AdapterEventHandler<any>>>();

    return {
        on<T extends AdapterEventType>(event: T, handler: AdapterEventHandler<T>) {
            if (!listeners.has(event)) {
                listeners.set(event, new Set());
            }
            listeners.get(event)!.add(handler);
        },

        off<T extends AdapterEventType>(event: T, handler: AdapterEventHandler<T>) {
            listeners.get(event)?.delete(handler);
        },

        emit<T extends AdapterEventType>(event: T, payload: AdapterEventMap[T]) {
            listeners.get(event)?.forEach(handler => {
                try {
                    handler(payload);
                } catch (error) {
                    console.error(`Error in event handler for '${event}':`, error);
                }
            });
        },
    };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a result is successful
 */
export function isAdapterSuccess<T>(result: Result<T, string>): result is Ok<T, string> {
    return result.isOk;
}

/**
 * Check if a result is an error
 */
export function isAdapterError<T>(result: Result<T, string>): result is Err<T, string> {
    return result.isErr;
}
