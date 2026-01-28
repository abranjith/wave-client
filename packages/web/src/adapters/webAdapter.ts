/**
 * Web Platform Adapter
 *
 * Implements IPlatformAdapter for the standalone web version of Wave Client.
 * Communicates with the Wave Client Server for all I/O operations.
 */

import axios, { AxiosInstance } from 'axios';
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
  Flow,
  TestSuite,
} from '@wave-client/core';
import { ok, err, Result, createAdapterEventEmitter } from '@wave-client/core';

// Server configuration
const SERVER_URL = 'http://127.0.0.1:3456';
const WS_URL = 'ws://127.0.0.1:3456/ws';

/**
 * API client for server communication
 */
const api: AxiosInstance = axios.create({
  baseURL: SERVER_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * WebSocket connection state
 */
let wsConnection: WebSocket | null = null;
let wsReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

/**
 * Event emitter for adapter events
 */
const events = createAdapterEventEmitter();

/**
 * Initialize WebSocket connection
 */
function initWebSocket(): void {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    return;
  }

  try {
    wsConnection = new WebSocket(WS_URL);

    wsConnection.onopen = () => {
      console.log('WebSocket connected to Wave Client Server');
      wsReconnectAttempts = 0;
    };

    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch {
        // Ignore invalid messages
      }
    };

    wsConnection.onclose = () => {
      console.log('WebSocket disconnected');
      wsConnection = null;

      // Attempt reconnection
      if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        wsReconnectAttempts++;
        setTimeout(initWebSocket, RECONNECT_DELAY);
      }
    };

    wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
  }
}

/**
 * Handle WebSocket messages from server
 */
function handleWebSocketMessage(message: {
  type: string;
  data?: unknown;
  message?: string;
}): void {
  switch (message.type) {
    case 'connected':
      console.log('Server:', message.message);
      break;
    case 'pong':
      // Keep-alive response
      break;
    case 'banner': {
      const bannerData = message.data as {
        type: 'success' | 'error' | 'info' | 'warning';
        message: string;
      };
      events.emit('banner', bannerData);
      break;
    }
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
    case 'authsChanged':
      events.emit('authsChanged', undefined);
      break;
    case 'proxiesChanged':
      events.emit('proxiesChanged', undefined);
      break;
    case 'certsChanged':
      events.emit('certsChanged', undefined);
      break;
    case 'settingsChanged':
      events.emit('settingsChanged', undefined);
      break;
    case 'validationRulesChanged':
      events.emit('validationRulesChanged', undefined);
      break;
    case 'flowsChanged':
      events.emit('flowsChanged', undefined);
      break;
    case 'encryptionStatusChanged':
      events.emit('encryptionStatusChanged', message.data as EncryptionStatus);
      break;
  }
}

/**
 * Check server health
 */
export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await api.get('/health');
    return response.data?.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Storage adapter using server API
 */
class WebStorageAdapter implements IStorageAdapter {
  // Collections
  async loadCollections(): Promise<Result<Collection[], string>> {
    try {
      const response = await api.get('/api/collections');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load collections');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveCollection(collection: Collection): Promise<Result<Collection, string>> {
    try {
      const response = await api.post('/api/collections', {
        collection,
        filename:
          collection.filename ||
          `${collection.info.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`,
      });
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to save collection');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async deleteCollection(filename: string): Promise<Result<void, string>> {
    try {
      const response = await api.delete(
        `/api/collections/${encodeURIComponent(filename)}`
      );
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to delete collection');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveRequestToCollection(
    collectionFilename: string,
    itemPath: string[],
    item: CollectionItem
  ): Promise<Result<Collection, string>> {
    try {
      const response = await api.post(
        `/api/collections/${encodeURIComponent(collectionFilename)}/requests`,
        {
          requestContent: JSON.stringify(item.request),
          requestName: item.name,
          folderPath: itemPath,
        }
      );
      if (response.data.isOk) {
        // Reload collection to get updated version
        const collectionsResult = await this.loadCollections();
        if (collectionsResult.isOk) {
          const collection = collectionsResult.value.find(
            (c) => c.filename === collectionFilename
          );
          if (collection) {
            return ok(collection);
          }
        }
        return err('Collection not found after save');
      }
      return err(response.data.error || 'Failed to save request');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async deleteRequestFromCollection(
    collectionFilename: string,
    _itemPath: string[],
    _itemId: string
  ): Promise<Result<Collection, string>> {
    // TODO: Implement proper delete endpoint on server
    const collectionsResult = await this.loadCollections();
    if (collectionsResult.isOk) {
      const collection = collectionsResult.value.find(
        (c) => c.filename === collectionFilename
      );
      if (collection) {
        return ok(collection);
      }
    }
    return err('Collection not found');
  }

  async importCollection(
    fileName: string,
    fileContent: string
  ): Promise<Result<Collection[], string>> {
    try {
      const response = await api.post('/api/collections/import', {
        fileName,
        fileContent,
      });
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to import collection');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async exportCollection(
    collectionFileName: string
  ): Promise<Result<{ filePath: string; fileName: string }, string>> {
    try {
      const response = await api.get(
        `/api/collections/${encodeURIComponent(collectionFileName)}/export`
      );
      if (response.data.isOk) {
        const { content, suggestedFilename } = response.data.value;
        // Trigger browser download
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedFilename;
        a.click();
        URL.revokeObjectURL(url);
        return ok({ filePath: '', fileName: suggestedFilename });
      }
      return err(response.data.error || 'Failed to export collection');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Environments
  async loadEnvironments(): Promise<Result<Environment[], string>> {
    try {
      const response = await api.get('/api/environments');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load environments');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveEnvironment(environment: Environment): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/environments', environment);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save environment');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveEnvironments(environments: Environment[]): Promise<Result<void, string>> {
    try {
      const response = await api.put('/api/environments', environments);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save environments');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async deleteEnvironment(environmentId: string): Promise<Result<void, string>> {
    try {
      const response = await api.delete(
        `/api/environments/${encodeURIComponent(environmentId)}`
      );
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to delete environment');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async importEnvironments(
    fileContent: string
  ): Promise<Result<Environment[], string>> {
    try {
      const response = await api.post('/api/environments/import', { fileContent });
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to import environments');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async exportEnvironments(): Promise<
    Result<{ filePath: string; fileName: string }, string>
  > {
    try {
      const response = await api.get('/api/environments/export');
      if (response.data.isOk) {
        const { content, fileName } = response.data.value;
        // Trigger browser download
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return ok({ filePath: '', fileName });
      }
      return err(response.data.error || 'Failed to export environments');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // History
  async loadHistory(): Promise<Result<ParsedRequest[], string>> {
    try {
      const response = await api.get('/api/history');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load history');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveRequestToHistory(request: ParsedRequest): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/history', {
        requestContent: JSON.stringify(request),
      });
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save to history');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async clearHistory(): Promise<Result<void, string>> {
    try {
      const response = await api.delete('/api/history');
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to clear history');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Cookies
  async loadCookies(): Promise<Result<Cookie[], string>> {
    try {
      const response = await api.get('/api/cookies');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load cookies');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveCookies(cookies: Cookie[]): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/cookies', cookies);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save cookies');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Auth Store
  async loadAuths(): Promise<Result<Auth[], string>> {
    try {
      const response = await api.get('/api/auths');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load auths');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveAuths(auths: Auth[]): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/auths', auths);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save auths');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Proxy Store
  async loadProxies(): Promise<Result<Proxy[], string>> {
    try {
      const response = await api.get('/api/proxies');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load proxies');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveProxies(proxies: Proxy[]): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/proxies', proxies);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save proxies');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Cert Store
  async loadCerts(): Promise<Result<Cert[], string>> {
    try {
      const response = await api.get('/api/certs');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load certs');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveCerts(certs: Cert[]): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/certs', certs);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save certs');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Validation Rules
  async loadValidationRules(): Promise<Result<ValidationRule[], string>> {
    try {
      const response = await api.get('/api/validation-rules');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load validation rules');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveValidationRules(rules: ValidationRule[]): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/validation-rules', rules);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save validation rules');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Settings
  async loadSettings(): Promise<Result<AppSettings, string>> {
    try {
      const response = await api.get('/api/settings');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load settings');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveSettings(settings: AppSettings): Promise<Result<void, string>> {
    try {
      const response = await api.post('/api/settings', settings);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to save settings');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Flows
  async loadFlows(): Promise<Result<Flow[], string>> {
    try {
      const response = await api.get('/api/flows');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load flows');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveFlow(flow: Flow): Promise<Result<Flow, string>> {
    try {
      const response = await api.post('/api/flows', flow);
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to save flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async deleteFlow(flowId: string): Promise<Result<void, string>> {
    try {
      const response = await api.delete(`/api/flows/${encodeURIComponent(flowId)}`);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to delete flow');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  // Test Suites
  async loadTestSuites(): Promise<Result<TestSuite[], string>> {
    try {
      const response = await api.get('/api/test-suites');
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to load test suites');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async saveTestSuite(testSuite: TestSuite): Promise<Result<TestSuite, string>> {
    try {
      const response = await api.post('/api/test-suites', testSuite);
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to save test suite');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async deleteTestSuite(testSuiteId: string): Promise<Result<void, string>> {
    try {
      const response = await api.delete(`/api/test-suites/${encodeURIComponent(testSuiteId)}`);
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to delete test suite');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }
}

/**
 * HTTP adapter using server API
 */
class WebHttpAdapter implements IHttpAdapter {
  async executeRequest(
    config: HttpRequestConfig
  ): Promise<Result<HttpResponseResult, string>> {
    try {
      const response = await api.post('/api/http/execute', config);
      if (response.data.isOk) {
        return ok(response.data.value.response);
      }
      return err(response.data.error || 'Request failed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }
}

/**
 * File adapter for browser file operations
 * Uses server API for file system access
 */
class WebFileAdapter implements IFileAdapter {
  async showSaveDialog(options: SaveDialogOptions): Promise<string | null> {
    // Browser doesn't support native save dialogs, use download instead
    // Return a placeholder path that indicates browser download
    return `download://${options.defaultFileName || 'file'}`;
  }

  async showOpenDialog(options: OpenDialogOptions): Promise<string[] | null> {
    // Create a file input element and trigger it
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = (options as any).multiple || false;

      if (options.filters && options.filters.length > 0) {
        const extensions = options.filters.flatMap((f) =>
          f.extensions.map((e) => `.${e}`)
        );
        input.accept = extensions.join(',');
      }

      input.onchange = () => {
        if (input.files && input.files.length > 0) {
          resolve(Array.from(input.files).map((f) => f.name));
        } else {
          resolve(null);
        }
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async readFile(path: string): Promise<Result<string, string>> {
    try {
      const response = await api.post('/api/files/read', { path, pathType: 'absolute' });
      if (response.data.isOk) {
        return ok(response.data.value);
      }
      return err(response.data.error || 'Failed to read file');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async readFileAsBinary(path: string): Promise<Result<Uint8Array, string>> {
    try {
      const response = await api.post('/api/files/read-binary', { path, pathType: 'absolute' });
      if (response.data.isOk && response.data.value) {
        // Decode base64 to Uint8Array
        const binaryString = atob(response.data.value);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return ok(bytes);
      }
      return err(response.data.error || 'Failed to read file');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async writeFile(path: string, content: string): Promise<Result<void, string>> {
    // For browser paths starting with download://, trigger browser download
    if (path.startsWith('download://')) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.replace('download://', '') || 'file.txt';
      a.click();
      URL.revokeObjectURL(url);
      return ok(undefined);
    }
    
    // Otherwise write via server
    try {
      const response = await api.post('/api/files/write', { path, content, pathType: 'absolute' });
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to write file');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async writeBinaryFile(
    path: string,
    data: Uint8Array
  ): Promise<Result<void, string>> {
    // For browser paths starting with download://, trigger browser download
    if (path.startsWith('download://')) {
      const blob = new Blob([new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.replace('download://', '') || 'file';
      a.click();
      URL.revokeObjectURL(url);
      return ok(undefined);
    }

    // Otherwise write via server
    try {
      // Convert Uint8Array to base64 for transport
      const base64 = btoa(String.fromCharCode(...data));
      const response = await api.post('/api/files/write-binary', { 
        path, 
        data: base64, 
        encoding: 'base64',
        pathType: 'absolute' 
      });
      if (response.data.isOk) {
        return ok(undefined);
      }
      return err(response.data.error || 'Failed to write file');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(`Server error: ${message}`);
    }
  }

  async downloadResponse(
    data: Uint8Array,
    filename: string,
    contentType: string
  ): Promise<Result<void, string>> {
    const blob = new Blob([new Uint8Array(data)], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return ok(undefined);
  }

  async importFile(
    options: OpenDialogOptions
  ): Promise<Result<{ content: string; filename: string } | null, string>> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';

      if (options.filters && options.filters.length > 0) {
        const extensions = options.filters.flatMap((f) =>
          f.extensions.map((e) => `.${e}`)
        );
        input.accept = extensions.join(',');
      }

      input.onchange = async () => {
        if (input.files && input.files.length > 0) {
          const file = input.files[0];
          try {
            const content = await file.text();
            resolve(ok({ content, filename: file.name }));
          } catch {
            resolve(err('Failed to read file'));
          }
        } else {
          resolve(ok(null));
        }
      };

      input.oncancel = () => resolve(ok(null));
      input.click();
    });
  }
}

/**
 * Secret adapter - uses localStorage (NOT secure, for development only)
 */
class WebSecretAdapter implements ISecretAdapter {
  private readonly prefix = 'wave-client:secret:';

  async storeSecret(key: string, value: string): Promise<Result<void, string>> {
    try {
      localStorage.setItem(this.prefix + key, value);
      return ok(undefined);
    } catch {
      return err('Failed to store secret');
    }
  }

  async getSecret(key: string): Promise<Result<string | undefined, string>> {
    try {
      const value = localStorage.getItem(this.prefix + key);
      return ok(value ?? undefined);
    } catch {
      return err('Failed to get secret');
    }
  }

  async deleteSecret(key: string): Promise<Result<void, string>> {
    try {
      localStorage.removeItem(this.prefix + key);
      return ok(undefined);
    } catch {
      return err('Failed to delete secret');
    }
  }

  async hasSecret(key: string): Promise<boolean> {
    return localStorage.getItem(this.prefix + key) !== null;
  }
}

/**
 * Security adapter using server API
 */
class WebSecurityAdapter implements ISecurityAdapter {
  async getEncryptionStatus(): Promise<EncryptionStatus> {
    try {
      const response = await api.get('/api/security/status');
      if (response.data.isOk) {
        return response.data.value;
      }
    } catch {
      // Ignore errors
    }
    return {
      enabled: false,
      hasKey: false,
      recoveryAvailable: false,
    };
  }

  async enableEncryption(_password: string): Promise<Result<void, string>> {
    return err('Encryption is not yet supported in the web version');
  }

  async disableEncryption(_password: string): Promise<Result<void, string>> {
    return err('Encryption is not yet supported in the web version');
  }

  async changePassword(
    _oldPassword: string,
    _newPassword: string
  ): Promise<Result<void, string>> {
    return err('Encryption is not yet supported in the web version');
  }

  async exportRecoveryKey(): Promise<Result<void, string>> {
    return err('Encryption is not yet supported in the web version');
  }

  async recoverWithKey(_recoveryKeyPath: string): Promise<Result<void, string>> {
    return err('Encryption is not yet supported in the web version');
  }
}

/**
 * Notification adapter using browser notifications and console
 */
class WebNotificationAdapter implements INotificationAdapter {
  showNotification(
    type: NotificationType,
    message: string,
    _duration?: number
  ): void {
    // Emit banner event for UI to display
    events.emit('banner', { type, message });

    // Also log to console
    switch (type) {
      case 'success':
        console.log('✅', message);
        break;
      case 'error':
        console.error('❌', message);
        break;
      case 'warning':
        console.warn('⚠️', message);
        break;
      case 'info':
      default:
        console.info('ℹ️', message);
        break;
    }
  }

  async showConfirmation(
    message: string,
    _confirmLabel?: string,
    _cancelLabel?: string
  ): Promise<boolean> {
    return window.confirm(message);
  }

  async showInput(
    message: string,
    defaultValue?: string,
    _placeholder?: string
  ): Promise<string | null> {
    return window.prompt(message, defaultValue);
  }
}

/**
 * Create the web adapter with server communication
 */
export function createWebAdapter(): IPlatformAdapter {
  // Initialize WebSocket connection
  initWebSocket();

  return {
    storage: new WebStorageAdapter(),
    http: new WebHttpAdapter(),
    file: new WebFileAdapter(),
    secret: new WebSecretAdapter(),
    security: new WebSecurityAdapter(),
    notification: new WebNotificationAdapter(),
    events,
    platform: 'web',

    async initialize() {
      // Check server health
      const healthy = await checkServerHealth();
      if (!healthy) {
        console.warn(
          '⚠️ Wave Client Server is not running. Start it with: pnpm dev:server'
        );
      }
    },

    dispose() {
      if (wsConnection) {
        wsConnection.close();
        wsConnection = null;
      }
    },
  };
}

// Export default adapter instance
export const webAdapter = createWebAdapter();
