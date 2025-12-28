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
    Environment,
    ParsedRequest,
    Cookie,
    Proxy,
    Cert,
    ResponseData,
    HeaderRow,
    ParamRow,
    CollectionBody,
} from './collection';
import type { RequestValidation, ValidationResult } from './validation';
import type { Auth } from './auth';
import type { ValidationRule } from './validation';

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
    is_encoded: boolean;
    cookies?: Cookie[];
    /** Validation results if validation was requested */
    validationResult?: ValidationResult;
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
        item: CollectionItem
    ): Promise<Result<Collection, string>>;
    deleteRequestFromCollection(
        collectionFilename: string,
        itemPath: string[],
        itemId: string
    ): Promise<Result<Collection, string>>;

    // Environments
    loadEnvironments(): Promise<Result<Environment[], string>>;
    saveEnvironment(environment: Environment): Promise<Result<void, string>>;
    saveEnvironments(environments: Environment[]): Promise<Result<void, string>>;
    deleteEnvironment(environmentId: string): Promise<Result<void, string>>;

    // History
    loadHistory(): Promise<Result<ParsedRequest[], string>>;
    saveRequestToHistory(request: ParsedRequest): Promise<Result<void, string>>;
    clearHistory(): Promise<Result<void, string>>;

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

    // Settings
    loadSettings(): Promise<Result<AppSettings, string>>;
    saveSettings(settings: AppSettings): Promise<Result<void, string>>;
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
     * Cancel an in-flight request
     */
    cancelRequest?(requestId: string): void;
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

    /**
     * Platform identifier
     */
    readonly platform: 'vscode' | 'web' | 'electron' | 'test';

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
// Adapter Events (for reactive updates)
// ============================================================================

/**
 * Events that adapters can emit to notify the UI of external changes
 * (e.g., another window modified collections)
 */
export type AdapterEventType =
    | 'collectionsChanged'
    | 'environmentsChanged'
    | 'historyChanged'
    | 'cookiesChanged'
    | 'authsChanged'
    | 'proxiesChanged'
    | 'certsChanged'
    | 'settingsChanged'
    | 'encryptionStatusChanged';

export interface AdapterEventHandler {
    on(event: AdapterEventType, callback: () => void): void;
    off(event: AdapterEventType, callback: () => void): void;
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
