import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockWebviewPanel } from '../mocks/vscode.js';

// Mock vscode module
vi.mock('vscode', async () => {
  const { createMockExtensionContext, mockWindow, mockWorkspace } = await import(
    '../mocks/vscode.js'
  );
  return {
    window: mockWindow,
    workspace: mockWorkspace,
  };
});

// Mock all service modules
vi.mock('../../services', () => ({
  httpService: {
    execute: vi.fn(),
    send: vi.fn(),
  },
  collectionService: {
    loadAll: vi.fn(),
    saveRequestToCollection: vi.fn(),
    importCollections: vi.fn(),
    exportCollection: vi.fn(),
  },
  environmentService: {
    loadAll: vi.fn(),
    saveEnvironment: vi.fn(),
    importEnvironments: vi.fn(),
    exportEnvironments: vi.fn(),
  },
  historyService: {
    loadHistory: vi.fn(),
    saveRequestToHistory: vi.fn(),
    clearHistory: vi.fn(),
  },
  cookieService: {
    loadCookies: vi.fn(),
    saveCookies: vi.fn(),
  },
  storeService: {
    loadAuths: vi.fn(),
    saveAuths: vi.fn(),
    loadProxies: vi.fn(),
    saveProxies: vi.fn(),
    loadCerts: vi.fn(),
    saveCerts: vi.fn(),
    getProxyForUrl: vi.fn(),
    getHttpsAgentForUrl: vi.fn(),
  },
  settingsService: {
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
  },
  securityService: {
    getEncryptionStatus: vi.fn(),
    enableEncryption: vi.fn(),
    disableEncryption: vi.fn(),
    changePassword: vi.fn(),
    exportRecoveryKey: vi.fn(),
    recoverWithKey: vi.fn(),
  },
}));

describe('MessageHandler', () => {
  let handler: any;
  let mockPanel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPanel = createMockWebviewPanel();

    // Import after mocks are set up
    const { MessageHandler } = await import('../../handlers/MessageHandler.js');
    handler = new MessageHandler(mockPanel);
  });

  it('should create handler instance', () => {
    expect(handler).toBeDefined();
  });

  it('should handle httpRequest message', async () => {
    const { httpService } = await import('../../services/index.js');

    (httpService.execute as any).mockResolvedValue({
      response: {
        id: 'test-123',
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'response body',
        elapsedTime: 100,
        size: 13,
        isEncoded: false,
      },
      newCookies: [],
    });

    const message = {
      type: 'httpRequest',
      requestId: 'req-123',
      id: 'test-123',
      request: {
        id: 'test-123',
        method: 'GET',
        url: 'https://api.example.com',
        headers: {},
        params: '',
        body: { type: 'none' },
      },
    };

    await handler.handleMessage(message);

    expect(httpService.execute).toHaveBeenCalled();
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'httpResponse',
        requestId: 'req-123',
      })
    );
  });

  it('should handle loadCollections message', async () => {
    const { collectionService } = await import('../../services/index.js');

    const mockCollections = [
      {
        filename: 'test.json',
        name: 'Test Collection',
        requests: [],
      },
    ];

    (collectionService.loadAll as any).mockResolvedValue(
      mockCollections
    );

    const message = {
      type: 'loadCollections',
      requestId: 'req-456',
    };

    await handler.handleMessage(message);

    expect(collectionService.loadAll).toHaveBeenCalled();
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'collectionsLoaded',
        requestId: 'req-456',
        collections: mockCollections,
      })
    );
  });

  it('should handle loadEnvironments message', async () => {
    const { environmentService } = await import('../../services/index.js');

    const mockEnvironments = [
      {
        id: 'env-1',
        name: 'Test Environment',
        variables: [],
      },
    ];

    (environmentService.loadAll as any).mockResolvedValue(
      mockEnvironments
    );

    const message = {
      type: 'loadEnvironments',
      requestId: 'req-789',
    };

    await handler.handleMessage(message);

    expect(environmentService.loadAll).toHaveBeenCalled();
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'environmentsLoaded',
        requestId: 'req-789',
        environments: mockEnvironments,
      })
    );
  });

  it('should handle errors gracefully', async () => {
    const { collectionService } = await import('../../services/index.js');

    (collectionService.loadAll as any).mockRejectedValue(
      new Error('Failed to load')
    );

    const message = {
      type: 'loadCollections',
      requestId: 'req-error',
    };

    await handler.handleMessage(message);

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'collectionsLoaded',
        requestId: 'req-error',
        error: expect.stringContaining('Failed to load'),
      })
    );
  });
});
