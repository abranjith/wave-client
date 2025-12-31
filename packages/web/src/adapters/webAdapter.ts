/**
 * Web Platform Adapter
 * 
 * Implements IPlatformAdapter for the standalone web version of Wave Client.
 * Uses localStorage for persistence and fetch API for HTTP requests.
 */

import type {
  IPlatformAdapter,
  IStorageAdapter,
  IHttpAdapter,
  IFileAdapter,
  ISecretAdapter,
  ISecurityAdapter,
  INotificationAdapter,
  HttpRequestConfig,
  HttpResponseResult,
  AppSettings,
  Collection,
  CollectionItem,
  Environment,
  ParsedRequest,
  Cookie,
  Proxy,
  Cert,
  ValidationRule,
  Auth,
  EncryptionStatus,
  SaveDialogOptions,
  OpenDialogOptions,
  NotificationType,
  ParamRow,
  CollectionBody,
} from '@wave-client/core';
import { ok, err, Result, createAdapterEventEmitter } from '@wave-client/core';

// Storage keys for localStorage
const STORAGE_KEYS = {
  COLLECTIONS: 'wave-client:collections',
  ENVIRONMENTS: 'wave-client:environments',
  HISTORY: 'wave-client:history',
  COOKIES: 'wave-client:cookies',
  AUTHS: 'wave-client:auths',
  PROXIES: 'wave-client:proxies',
  CERTS: 'wave-client:certs',
  SETTINGS: 'wave-client:settings',
  VALIDATION_RULES: 'wave-client:validation-rules',
} as const;

/**
 * Helper to safely parse JSON from localStorage
 */
function safeJSONParse<T>(value: string | null, defaultValue: T): T {
  if (!value) {
    return defaultValue;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Storage adapter using localStorage
 */
class WebStorageAdapter implements IStorageAdapter {
  // Collections
  async loadCollections() {
    const data = safeJSONParse<Collection[]>(
      localStorage.getItem(STORAGE_KEYS.COLLECTIONS),
      []
    );
    return ok(data);
  }

  async saveCollection(collection: Collection) {
    const result = await this.loadCollections();
    if (!result.isOk) {
      return err('Failed to load collections');
    }
    
    const collections = result.value;
    const index = collections.findIndex(c => c.filename === collection.filename);
    
    if (index >= 0) {
      collections[index] = collection;
    } else {
      collections.push(collection);
    }
    
    localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(collections));
    return ok(collection);
  }

  async deleteCollection(filename: string) {
    const result = await this.loadCollections();
    if (!result.isOk) {
      return err('Failed to load collections');
    }
    
    const collections = result.value.filter(c => c.filename !== filename);
    localStorage.setItem(STORAGE_KEYS.COLLECTIONS, JSON.stringify(collections));
    return ok(undefined);
  }

  async saveRequestToCollection(
    collectionFilename: string,
    _itemPath: string[],
    _item: CollectionItem
  ) {
    // Find and update the collection
    const result = await this.loadCollections();
    if (!result.isOk) {
      return err('Failed to load collections');
    }
    
    const collection = result.value.find(c => c.filename === collectionFilename);
    if (!collection) {
      return err(`Collection not found: ${collectionFilename}`);
    }
    
    // TODO: Implement proper path-based item insertion
    return ok(collection);
  }

  async deleteRequestFromCollection(
    collectionFilename: string,
    _itemPath: string[],
    _itemId: string
  ) {
    const result = await this.loadCollections();
    if (!result.isOk) {
      return err('Failed to load collections');
    }
    
    const collection = result.value.find(c => c.filename === collectionFilename);
    if (!collection) {
      return err(`Collection not found: ${collectionFilename}`);
    }
    
    // TODO: Implement proper path-based item deletion
    return ok(collection);
  }

  // Environments
  async loadEnvironments() {
    const data = safeJSONParse<Environment[]>(
      localStorage.getItem(STORAGE_KEYS.ENVIRONMENTS),
      []
    );
    return ok(data);
  }

  async saveEnvironment(environment: Environment) {
    const result = await this.loadEnvironments();
    if (!result.isOk) {
      return err('Failed to load environments');
    }
    
    const environments = result.value;
    const index = environments.findIndex(e => e.name === environment.name);
    
    if (index >= 0) {
      environments[index] = environment;
    } else {
      environments.push(environment);
    }
    
    localStorage.setItem(STORAGE_KEYS.ENVIRONMENTS, JSON.stringify(environments));
    return ok(undefined);
  }

  async saveEnvironments(environments: Environment[]) {
    localStorage.setItem(STORAGE_KEYS.ENVIRONMENTS, JSON.stringify(environments));
    return ok(undefined);
  }

  async deleteEnvironment(name: string) {
    const result = await this.loadEnvironments();
    if (!result.isOk) {
      return err('Failed to load environments');
    }
    
    const environments = result.value.filter(e => e.name !== name);
    localStorage.setItem(STORAGE_KEYS.ENVIRONMENTS, JSON.stringify(environments));
    return ok(undefined);
  }

  // History
  async loadHistory() {
    const data = safeJSONParse<ParsedRequest[]>(
      localStorage.getItem(STORAGE_KEYS.HISTORY),
      []
    );
    return ok(data);
  }

  async saveRequestToHistory(request: ParsedRequest) {
    const result = await this.loadHistory();
    if (!result.isOk) {
      return err('Failed to load history');
    }
    
    const history = [request, ...result.value].slice(0, 100); // Keep last 100
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    return ok(undefined);
  }

  async clearHistory() {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([]));
    return ok(undefined);
  }

  // Cookies
  async loadCookies() {
    const data = safeJSONParse<Cookie[]>(
      localStorage.getItem(STORAGE_KEYS.COOKIES),
      []
    );
    return ok(data);
  }

  async saveCookies(cookies: Cookie[]) {
    localStorage.setItem(STORAGE_KEYS.COOKIES, JSON.stringify(cookies));
    return ok(undefined);
  }

  // Auths
  async loadAuths() {
    const data = safeJSONParse<Auth[]>(
      localStorage.getItem(STORAGE_KEYS.AUTHS),
      []
    );
    return ok(data);
  }

  async saveAuths(auths: Auth[]) {
    localStorage.setItem(STORAGE_KEYS.AUTHS, JSON.stringify(auths));
    return ok(undefined);
  }

  // Proxies
  async loadProxies() {
    const data = safeJSONParse<Proxy[]>(
      localStorage.getItem(STORAGE_KEYS.PROXIES),
      []
    );
    return ok(data);
  }

  async saveProxies(proxies: Proxy[]) {
    localStorage.setItem(STORAGE_KEYS.PROXIES, JSON.stringify(proxies));
    return ok(undefined);
  }

  // Certs
  async loadCerts() {
    const data = safeJSONParse<Cert[]>(
      localStorage.getItem(STORAGE_KEYS.CERTS),
      []
    );
    return ok(data);
  }

  async saveCerts(certs: Cert[]) {
    localStorage.setItem(STORAGE_KEYS.CERTS, JSON.stringify(certs));
    return ok(undefined);
  }

  // Settings
  async loadSettings() {
    const data = safeJSONParse<AppSettings>(
      localStorage.getItem(STORAGE_KEYS.SETTINGS),
      { encryptionEnabled: false }
    );
    return ok(data);
  }

  async saveSettings(settings: AppSettings) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    return ok(undefined);
  }

  // Validation Rules
  async loadValidationRules() {
    const data = safeJSONParse<ValidationRule[]>(
      localStorage.getItem(STORAGE_KEYS.VALIDATION_RULES),
      []
    );
    return ok(data);
  }

  async saveValidationRules(rules: ValidationRule[]) {
    localStorage.setItem(STORAGE_KEYS.VALIDATION_RULES, JSON.stringify(rules));
    return ok(undefined);
  }
}

/**
 * HTTP adapter using fetch API
 */
class WebHttpAdapter implements IHttpAdapter {
  private abortControllers: Map<string, AbortController> = new Map();

  async executeRequest(config: HttpRequestConfig) {
    const startTime = performance.now();
    const abortController = new AbortController();
    
    if (config.id) {
      this.abortControllers.set(config.id, abortController);
    }
    
    try {
      // Build headers from config
      const headers: Record<string, string> = {};
      if (Array.isArray(config.headers)) {
        // HeaderRow[] format
        for (const header of config.headers) {
          if (!header.disabled && header.key) {
            headers[header.key] = header.value;
          }
        }
      } else {
        // Record<string, string | string[]> format
        for (const [key, value] of Object.entries(config.headers)) {
          headers[key] = Array.isArray(value) ? value.join(', ') : value;
        }
      }

      // Build URL with params
      let url = config.url;
      if (typeof config.params === 'string') {
        // Already a query string
        if (config.params) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}${config.params}`;
        }
      } else if (Array.isArray(config.params)) {
        // ParamRow[] format
        const enabledParams = config.params.filter((p: ParamRow) => !p.disabled && p.key);
        if (enabledParams.length > 0) {
          const searchParams = new URLSearchParams();
          for (const param of enabledParams) {
            searchParams.append(param.key, param.value);
          }
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}${searchParams.toString()}`;
        }
      }

      const fetchOptions: RequestInit = {
        method: config.method,
        headers,
        signal: abortController.signal,
      };

      // Add body for non-GET requests
      if (config.method !== 'GET' && config.body) {
        const body = config.body as CollectionBody;
        if (body.mode === 'raw' && body.raw) {
          fetchOptions.body = body.raw;
        } else if (body.mode === 'formdata' && body.formdata) {
          const formData = new FormData();
          for (const field of body.formdata) {
            if (field.fieldType === 'text' && typeof field.value === 'string') {
              formData.append(field.key, field.value || '');
            }
          }
          fetchOptions.body = formData;
        } else if (body.mode === 'urlencoded' && body.urlencoded) {
          const urlencoded = new URLSearchParams();
          for (const field of body.urlencoded) {
            urlencoded.append(field.key, field.value ?? '');
          }
          fetchOptions.body = urlencoded.toString();
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }

      const fetchResponse = await fetch(url, fetchOptions);
      const elapsedTime = Math.round(performance.now() - startTime);

      // Get response body as text
      const bodyText = await fetchResponse.text();
      const bodyBase64 = btoa(unescape(encodeURIComponent(bodyText)));

      // Extract headers
      const responseHeaders: Record<string, string> = {};
      fetchResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const response: HttpResponseResult = {
        id: config.id,
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: responseHeaders,
        body: bodyBase64,
        elapsedTime,
        size: bodyText.length,
        is_encoded: true,
      };

      return ok(response);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        return err('Request was cancelled');
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return err(errorMessage);
    } finally {
      if (config.id) {
        this.abortControllers.delete(config.id);
      }
    }
  }

  cancelRequest(requestId: string) {
    const controller = this.abortControllers.get(requestId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(requestId);
    }
  }
}

/**
 * File adapter using browser File API
 */
class WebFileAdapter implements IFileAdapter {
  async showSaveDialog(_options: SaveDialogOptions): Promise<string | null> {
    // In web, we don't have a native save dialog - return null
    // The actual saving happens via browser download
    return null;
  }

  async showOpenDialog(_options: OpenDialogOptions): Promise<string[] | null> {
    // In web, we trigger the file input which returns file contents, not paths
    return null;
  }

  async readFile(_path: string) {
    // Web doesn't have direct file system access
    return err('File system access not available in web browser');
  }

  async readFileAsBinary(_path: string) {
    return err('Binary file reading not available in web browser');
  }

  async writeFile(path: string, content: string) {
    // Create a blob and trigger download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return ok(undefined);
  }

  async writeBinaryFile(path: string, data: Uint8Array) {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return ok(undefined);
  }

  async downloadResponse(data: Uint8Array, filename: string, contentType: string) {
    const blob = new Blob([data.buffer as ArrayBuffer], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return ok(undefined);
  }

  async importFile(options: OpenDialogOptions) {
    return new Promise<Result<{ content: string; filename: string; } | null, string>>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      
      if (options?.filters && options.filters.length > 0) {
        input.accept = options.filters
          .flatMap(f => f.extensions.map(ext => `.${ext}`))
          .join(',');
      }

      input.onchange = async () => {
        const file = input.files?.[0];
        if (file) {
          const content = await file.text();
          resolve(ok({ content, filename: file.name }));
        } else {
          resolve(ok(null));
        }
      };

      input.oncancel = () => {
        resolve(ok(null));
      };

      input.click();
    });
  }
}

/**
 * Secret adapter using localStorage (NOT secure for production!)
 * In production, this should use a proper backend with encrypted storage
 */
class WebSecretAdapter implements ISecretAdapter {
  private readonly PREFIX = 'wave-client:secret:';

  async storeSecret(key: string, value: string) {
    localStorage.setItem(this.PREFIX + key, value);
    return ok(undefined);
  }

  async getSecret(key: string) {
    const value = localStorage.getItem(this.PREFIX + key);
    return ok(value ?? undefined);
  }

  async deleteSecret(key: string) {
    localStorage.removeItem(this.PREFIX + key);
    return ok(undefined);
  }

  async hasSecret(key: string): Promise<boolean> {
    return localStorage.getItem(this.PREFIX + key) !== null;
  }
}

/**
 * Security adapter - stub for web (encryption handled differently)
 */
class WebSecurityAdapter implements ISecurityAdapter {
  async getEncryptionStatus(): Promise<EncryptionStatus> {
    return {
      enabled: false,
      hasKey: false,
      recoveryAvailable: false,
    };
  }

  async enableEncryption(_password: string) {
    return err('Encryption not supported in web version');
  }

  async disableEncryption(_password: string) {
    return ok(undefined);
  }

  async changePassword(_oldPassword: string, _newPassword: string) {
    return err('Password change not supported in web version');
  }

  async exportRecoveryKey() {
    return err('Recovery key not supported in web version');
  }

  async recoverWithKey(_recoveryKeyPath: string) {
    return err('Recovery not supported in web version');
  }
}

/**
 * Notification adapter using browser console (could use toast library)
 */
class WebNotificationAdapter implements INotificationAdapter {
  showNotification(type: NotificationType, message: string, _duration?: number): void {
    switch (type) {
      case 'success':
      case 'info':
        console.info(`[Wave Client] ${type}:`, message);
        break;
      case 'warning':
        console.warn('[Wave Client]', message);
        break;
      case 'error':
        console.error('[Wave Client]', message);
        break;
    }
  }

  async showConfirmation(message: string, _confirmLabel?: string, _cancelLabel?: string): Promise<boolean> {
    return window.confirm(message);
  }

  async showInput(message: string, defaultValue?: string, _placeholder?: string): Promise<string | null> {
    return window.prompt(message, defaultValue);
  }
}

/**
 * Creates the web platform adapter
 */
export function createWebAdapter(): IPlatformAdapter {
  return {
    platform: 'web',
    storage: new WebStorageAdapter(),
    http: new WebHttpAdapter(),
    file: new WebFileAdapter(),
    secret: new WebSecretAdapter(),
    security: new WebSecurityAdapter(),
    notification: new WebNotificationAdapter(),
    events: createAdapterEventEmitter(),
  };
}

export default createWebAdapter;
