import { vi } from 'vitest';

/**
 * Mock vscode API for testing.
 * Provides minimal implementation of VS Code extension API needed for tests.
 */

// Mock types
export interface MockWebviewPanel {
  webview: {
    postMessage: ReturnType<typeof vi.fn>;
    html: string;
    options: any;
    cspSource: string;
  };
  dispose: ReturnType<typeof vi.fn>;
  onDidDispose: ReturnType<typeof vi.fn>;
  onDidChangeViewState: ReturnType<typeof vi.fn>;
}

export interface MockSecretStorage {
  get: ReturnType<typeof vi.fn>;
  store: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export interface MockExtensionContext {
  subscriptions: any[];
  workspaceState: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  globalState: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  secrets: MockSecretStorage;
  extensionUri: any;
  extensionPath: string;
  storagePath?: string;
  globalStoragePath?: string;
  logPath: string;
}

export function createMockWebviewPanel(): MockWebviewPanel {
  return {
    webview: {
      postMessage: vi.fn(),
      html: '',
      options: {},
      cspSource: 'mock-csp-source',
    },
    dispose: vi.fn(),
    onDidDispose: vi.fn(),
    onDidChangeViewState: vi.fn(),
  };
}

export function createMockSecretStorage(): MockSecretStorage {
  const storage = new Map<string, string>();
  
  return {
    get: vi.fn(async (key: string) => storage.get(key)),
    store: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  };
}

export function createMockExtensionContext(): MockExtensionContext {
  const workspaceState = new Map();
  const globalState = new Map();
  
  return {
    subscriptions: [],
    workspaceState: {
      get: vi.fn((key: string) => workspaceState.get(key)),
      update: vi.fn((key: string, value: any) => {
        workspaceState.set(key, value);
      }),
    },
    globalState: {
      get: vi.fn((key: string) => globalState.get(key)),
      update: vi.fn((key: string, value: any) => {
        globalState.set(key, value);
      }),
    },
    secrets: createMockSecretStorage(),
    extensionUri: { fsPath: '/mock/extension/path' },
    extensionPath: '/mock/extension/path',
    storagePath: '/mock/storage/path',
    globalStoragePath: '/mock/global/storage/path',
    logPath: '/mock/log/path',
  };
}

// Mock vscode.window methods
export const mockWindow = {
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showWarningMessage: vi.fn(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  createWebviewPanel: vi.fn(() => createMockWebviewPanel()),
};

// Mock vscode.workspace methods
export const mockWorkspace = {
  getConfiguration: vi.fn(() => ({
    get: vi.fn(),
    has: vi.fn(),
    inspect: vi.fn(),
    update: vi.fn(),
  })),
  workspaceFolders: undefined,
  onDidChangeConfiguration: vi.fn(),
};

// Mock vscode.Uri
export const mockUri = {
  file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file', path })),
  parse: vi.fn((uri: string) => ({ fsPath: uri, scheme: 'file', path: uri })),
};

// Mock vscode.ViewColumn
export const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
  Active: -1,
  Beside: -2,
};

/**
 * Creates a mock vscode module for vi.mock
 */
export function createMockVSCode() {
  return {
    window: mockWindow,
    workspace: mockWorkspace,
    Uri: mockUri,
    ViewColumn,
  };
}
