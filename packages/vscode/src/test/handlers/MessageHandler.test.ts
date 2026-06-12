import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockWebviewPanel } from '../mocks/vscode.js';

// Mock vscode module
vi.mock('vscode', async () => {
  const { createMockExtensionContext, mockWindow, mockWorkspace, mockUri } = await import(
    '../mocks/vscode.js'
  );
  return {
    window: mockWindow,
    workspace: mockWorkspace,
    Uri: mockUri,
  };
});

// Mock @wave-client/shared — MessageHandler imports services directly from here
// (not via the services barrel). The barrel at ../../services/index.ts re-exports
// from @wave-client/shared, so test-side `await import('../../services/index.js')`
// also receives these mocks.
vi.mock('@wave-client/shared', () => ({
  httpService: {
    execute: vi.fn(),
    send: vi.fn(),
    cancel: vi.fn(),
  },
  collectionService: {
    loadAll: vi.fn(),
    loadOne: vi.fn(),
    save: vi.fn(),
    saveRequest: vi.fn(),
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
    deleteByRequestId: vi.fn(),
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
  arenaStorageService: {
    loadSessions: vi.fn(),
    saveSession: vi.fn(),
    deleteSession: vi.fn(),
    loadMessages: vi.fn(),
    saveMessages: vi.fn(),
    clearSessionMessages: vi.fn(),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    loadReferences: vi.fn(),
    saveReferences: vi.fn(),
    loadProviderSettings: vi.fn(),
    saveProviderSettings: vi.fn(),
  },
  flowService: {
    loadAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
  testSuiteService: {
    loadAll: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  },
  fileService: {
    readFile: vi.fn(),
    readFileAsBinary: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
  },
}));

// Mock @wave-client/arena — lazy-loaded by MessageHandler via await import()
vi.mock('@wave-client/arena', () => ({
  arenaService: {
    initMcpBridge: vi.fn().mockResolvedValue('connected'),
    validateApiKey: vi.fn(),
    getAvailableModels: vi.fn(),
    streamChat: vi.fn(),
  },
}));

// Mock SecurityService — imported by MessageHandler from ../services/SecurityService
vi.mock('../../services/SecurityService', () => ({
  securityService: {
    getEncryptionStatus: vi.fn(),
    encryptAllFiles: vi.fn(),
    decryptAllFiles: vi.fn(),
    reEncryptAllFiles: vi.fn(),
    exportRecoveryKey: vi.fn(),
    recoverWithKeyFile: vi.fn(),
  },
}));

describe('MessageHandler', () => {
  let handler: any;
  let mockPanel: any;
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('should handle cancelHttpRequest message — routes to httpService.cancel and replies cancelled', async () => {
    const { httpService } = await import('../../services/index.js');

    (httpService.cancel as any).mockReturnValue(true);

    const message = {
      type: 'cancelHttpRequest',
      requestId: 'corr-1',
      data: { requestId: 'tab-1' },
    };

    await handler.handleMessage(message);

    expect(httpService.cancel).toHaveBeenCalledWith('tab-1');
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cancelHttpRequestResponse',
        requestId: 'corr-1',
        data: { cancelled: true },
      })
    );
  });

  it('should reply ok with cancelled:false when cancelling an unknown request id', async () => {
    const { httpService } = await import('../../services/index.js');

    (httpService.cancel as any).mockReturnValue(false);

    const message = {
      type: 'cancelHttpRequest',
      requestId: 'corr-2',
      data: { requestId: 'unknown-tab' },
    };

    await handler.handleMessage(message);

    expect(httpService.cancel).toHaveBeenCalledWith('unknown-tab');
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cancelHttpRequestResponse',
        requestId: 'corr-2',
        data: { cancelled: false },
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

  describe('History handlers', () => {
    it('deleteHistoryItem — calls deleteByRequestId and posts success response', async () => {
      const { historyService } = await import('../../services/index.js');
      (historyService.deleteByRequestId as any).mockResolvedValue(undefined);

      const message = {
        type: 'deleteHistoryItem',
        requestId: 'rq-del-1',
        data: { requestId: 'item-abc' },
      };

      await handler.handleMessage(message);

      expect(historyService.deleteByRequestId).toHaveBeenCalledWith('item-abc');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'historyItemDeleted',
          requestId: 'rq-del-1',
        })
      );
    });

    it('deleteHistoryItem — service throws → posts error response', async () => {
      const { historyService } = await import('../../services/index.js');
      (historyService.deleteByRequestId as any).mockRejectedValue(new Error('disk error'));

      const message = {
        type: 'deleteHistoryItem',
        requestId: 'rq-del-2',
        data: { requestId: 'item-xyz' },
      };

      await handler.handleMessage(message);

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'historyItemDeleted',
          requestId: 'rq-del-2',
          error: 'disk error',
        })
      );
    });
  });

  describe('Arena handlers', () => {
    // ==================== Storage — Sessions ====================

    it('arena.loadSessions — calls loadSessions() and posts sessions', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const mockSessions = [{ id: 'sess-1', title: 'Session 1', agent: 'wave-client', createdAt: 0, updatedAt: 0, messageCount: 0 }];
      (arenaStorageService.loadSessions as any).mockResolvedValue(mockSessions);

      await handler.handleMessage({ type: 'arena.loadSessions', requestId: 'r1' });

      expect(arenaStorageService.loadSessions).toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadSessions', requestId: 'r1', sessions: mockSessions })
      );
    });

    it('arena.loadSessions — service throws → posts error', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.loadSessions as any).mockRejectedValue(new Error('disk error'));

      await handler.handleMessage({ type: 'arena.loadSessions', requestId: 'r1' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadSessions', requestId: 'r1', error: 'disk error' })
      );
    });

    it('arena.saveSession — calls saveSession() with session object', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.saveSession as any).mockResolvedValue(undefined);
      const session = { id: 's1', title: 'T', agent: 'wave-client', createdAt: 0, updatedAt: 0, messageCount: 0 };

      await handler.handleMessage({ type: 'arena.saveSession', requestId: 'r2', session });

      expect(arenaStorageService.saveSession).toHaveBeenCalledWith(session);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.saveSession', requestId: 'r2' })
      );
    });

    it('arena.deleteSession — calls deleteSession() with sessionId', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.deleteSession as any).mockResolvedValue(undefined);

      await handler.handleMessage({ type: 'arena.deleteSession', requestId: 'r3', sessionId: 'sess-1' });

      expect(arenaStorageService.deleteSession).toHaveBeenCalledWith('sess-1');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.deleteSession', requestId: 'r3' })
      );
    });

    // ==================== Storage — Messages ====================

    it('arena.loadMessages — calls loadMessages(sessionId) and posts messages', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const mockMessages = [{ id: 'm1', sessionId: 's1', role: 'user', content: 'hello', status: 'complete', timestamp: 0 }];
      (arenaStorageService.loadMessages as any).mockResolvedValue(mockMessages);

      await handler.handleMessage({ type: 'arena.loadMessages', requestId: 'r4', sessionId: 's1' });

      expect(arenaStorageService.loadMessages).toHaveBeenCalledWith('s1');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadMessages', requestId: 'r4', messages: mockMessages })
      );
    });

    it('arena.saveMessage — new message → appends to existing and calls saveMessages', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const existingMsg = { id: 'm1', sessionId: 's1', role: 'user', content: 'hi', status: 'complete', timestamp: 0 };
      const newMsg = { id: 'm2', sessionId: 's1', role: 'assistant', content: 'hello', status: 'complete', timestamp: 1 };
      (arenaStorageService.loadMessages as any).mockResolvedValue([existingMsg]);
      (arenaStorageService.saveMessages as any).mockResolvedValue(undefined);

      await handler.handleMessage({ type: 'arena.saveMessage', requestId: 'r5', message: newMsg });

      expect(arenaStorageService.saveMessages).toHaveBeenCalledWith('s1', [existingMsg, newMsg]);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.saveMessage', requestId: 'r5' })
      );
    });

    it('arena.saveMessage — existing message → replaces it in saveMessages call', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const original = { id: 'm1', sessionId: 's1', role: 'user', content: 'hi', status: 'complete', timestamp: 0 };
      const updated = { id: 'm1', sessionId: 's1', role: 'user', content: 'updated', status: 'complete', timestamp: 2 };
      (arenaStorageService.loadMessages as any).mockResolvedValue([original]);
      (arenaStorageService.saveMessages as any).mockResolvedValue(undefined);

      await handler.handleMessage({ type: 'arena.saveMessage', requestId: 'r6', message: updated });

      expect(arenaStorageService.saveMessages).toHaveBeenCalledWith('s1', [updated]);
    });

    it('arena.clearSessionMessages — calls clearSessionMessages(sessionId)', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.clearSessionMessages as any).mockResolvedValue(undefined);

      await handler.handleMessage({ type: 'arena.clearSessionMessages', requestId: 'r7', sessionId: 's1' });

      expect(arenaStorageService.clearSessionMessages).toHaveBeenCalledWith('s1');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.clearSessionMessages', requestId: 'r7' })
      );
    });

    // ==================== Storage — Settings & References ====================

    it('arena.loadSettings — posts settings field', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const mockSettings = { theme: 'dark' };
      (arenaStorageService.loadSettings as any).mockResolvedValue(mockSettings);

      await handler.handleMessage({ type: 'arena.loadSettings', requestId: 'r10' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadSettings', requestId: 'r10', settings: mockSettings })
      );
    });

    it('arena.saveSettings — calls saveSettings() with correct settings', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.saveSettings as any).mockResolvedValue(undefined);
      const settings = { autoSave: true };

      await handler.handleMessage({ type: 'arena.saveSettings', requestId: 'r11', settings });

      expect(arenaStorageService.saveSettings).toHaveBeenCalledWith(settings);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.saveSettings', requestId: 'r11' })
      );
    });

    it('arena.loadReferences — posts references array', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const refs = [{ id: 'ref-1', label: 'MDN', url: 'https://mdn.dev', description: '', tags: [], enabled: true, type: 'website' }];
      (arenaStorageService.loadReferences as any).mockResolvedValue(refs);

      await handler.handleMessage({ type: 'arena.loadReferences', requestId: 'r12' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadReferences', requestId: 'r12', references: refs })
      );
    });

    it('arena.saveReferences — calls saveReferences()', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.saveReferences as any).mockResolvedValue(undefined);
      const references = [{ id: 'ref-1', label: 'MDN', url: 'https://mdn.dev', description: '', tags: [], enabled: true, type: 'website' }];

      await handler.handleMessage({ type: 'arena.saveReferences', requestId: 'r13', references });

      expect(arenaStorageService.saveReferences).toHaveBeenCalledWith(references);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.saveReferences', requestId: 'r13' })
      );
    });

    it('arena.loadProviderSettings — posts settings (ArenaProviderSettingsMap)', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      const providerSettings = { gemini: { apiKey: 'key-1' }, ollama: {} };
      (arenaStorageService.loadProviderSettings as any).mockResolvedValue(providerSettings);

      await handler.handleMessage({ type: 'arena.loadProviderSettings', requestId: 'r14' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadProviderSettings', requestId: 'r14', settings: providerSettings })
      );
    });

    it('arena.saveProviderSettings — calls saveProviderSettings()', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.saveProviderSettings as any).mockResolvedValue(undefined);
      const settings = { gemini: { apiKey: 'key-2' }, ollama: {} };

      await handler.handleMessage({ type: 'arena.saveProviderSettings', requestId: 'r15', settings });

      expect(arenaStorageService.saveProviderSettings).toHaveBeenCalledWith(settings);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.saveProviderSettings', requestId: 'r15' })
      );
    });

    // ==================== Actions — validateApiKey ====================

    it('arena.validateApiKey — valid key → response valid: true', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.validateApiKey as any).mockResolvedValue({ valid: true });

      await handler.handleMessage({ type: 'arena.validateApiKey', requestId: 'r16', provider: 'gemini', apiKey: 'test-key' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.validateApiKey', requestId: 'r16', valid: true })
      );
    });

    it('arena.validateApiKey — invalid key → response valid: false with error', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.validateApiKey as any).mockResolvedValue({ valid: false, error: 'bad key' });

      await handler.handleMessage({ type: 'arena.validateApiKey', requestId: 'r17', provider: 'gemini', apiKey: 'bad-key' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.validateApiKey', requestId: 'r17', valid: false, error: 'bad key' })
      );
    });

    // ==================== Actions — getAvailableModels ====================

    it('arena.getAvailableModels — returns model list', async () => {
      const { arenaService, arenaStorageService } = await import('../../services/index.js');
      const models = [{ id: 'gemini-pro', label: 'Gemini Pro', provider: 'gemini', contextWindow: 32000 }];
      (arenaStorageService.loadProviderSettings as any).mockResolvedValue({ gemini: { apiKey: 'key' } });
      (arenaService.getAvailableModels as any).mockResolvedValue(models);

      await handler.handleMessage({ type: 'arena.getAvailableModels', requestId: 'r18', provider: 'gemini' });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.getAvailableModels', requestId: 'r18', models })
      );
    });

    // ==================== Streaming — sendMessage (non-streaming) ====================

    it('arena.sendMessage — resolves → posts arena.sendMessage with requestId and response', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-1', content: 'Hello!' };
      (arenaService.streamChat as any).mockResolvedValue(response);

      const request = { sessionId: 'sess-send', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.sendMessage', requestId: 'r-send-1', request });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.sendMessage', requestId: 'r-send-1', response })
      );
    });

    it('arena.sendMessage — rejects → posts error with requestId', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.streamChat as any).mockRejectedValue(new Error('provider offline'));

      const request = { sessionId: 'sess-send-err', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.sendMessage', requestId: 'r-send-2', request });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.sendMessage', requestId: 'r-send-2', error: 'provider offline' })
      );
    });

    // ==================== Streaming — streamMessage ====================

    it('arena.streamMessage — resolves → posts arena.streamComplete with streamId and response', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-1', content: 'Hello!' };
      (arenaService.streamChat as any).mockResolvedValue(response);

      const chatRequest = { sessionId: 'sess-stream', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-19', chatRequest });
      await flushAsync();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.streamComplete', streamId: 'stream-19', response })
      );
    });

    it('arena.streamMessage — rejects → posts arena.streamError with streamId and error', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.streamChat as any).mockRejectedValue(new Error('provider offline'));

      const chatRequest = { sessionId: 'sess-err', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-20', chatRequest });
      await flushAsync();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.streamError', streamId: 'stream-20', error: 'provider offline' })
      );
    });

    it('arena.streamMessage — onChunk callback posts arena.streamChunk with streamId', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-2', content: 'result' };
      (arenaService.streamChat as any).mockImplementation(async (_req: any, onChunk: any) => {
        onChunk({ messageId: 'msg-2', content: 'partial', done: false });
        return response;
      });

      const chatRequest = { sessionId: 'sess-chunk', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-21', chatRequest });
      await flushAsync();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.streamChunk', streamId: 'stream-21', chunk: { messageId: 'msg-2', content: 'partial', done: false } })
      );
    });

    it('arena.streamMessage — seq field is preserved verbatim in arena.streamChunk (FEAT-011)', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-seq', content: 'result' };
      (arenaService.streamChat as any).mockImplementation(async (_req: any, onChunk: any) => {
        onChunk({ messageId: 'msg-seq', content: 'token', done: false, seq: 5 });
        return response;
      });

      const chatRequest = { sessionId: 'sess-seq', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-seq', chatRequest });
      await flushAsync();

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'arena.streamChunk',
          streamId: 'stream-seq',
          chunk: expect.objectContaining({ seq: 5 }),
        })
      );
    });

    it('arena.streamMessage — AbortController is removed from map after completion', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.streamChat as any).mockResolvedValue({ messageId: 'msg-3', content: 'done' });

      const chatRequest = { sessionId: 'sess-done', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-22', chatRequest });
      await flushAsync();

      // After completion, cancelChat with the same streamId should be a no-op (no throw)
      expect(() => {
        handler.handleMessage({ type: 'arena.cancelChat', streamId: 'stream-22' });
      }).not.toThrow();
    });

    // ==================== Streaming — cancelChat ====================

    it('arena.cancelChat — while stream in progress → calls abort() on controller', async () => {
      const { arenaService } = await import('../../services/index.js');
      const abortSpy = vi.spyOn(AbortController.prototype, 'abort');

      let resolveStream!: (value: any) => void;
      const streamPromise = new Promise((resolve) => { resolveStream = resolve; });
      (arenaService.streamChat as any).mockReturnValue(streamPromise);

      const chatRequest = { sessionId: 'sess-cancel', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      // Start streaming (don't await — it won't resolve yet)
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-23', chatRequest });

      // Give the async stream handler time to register the controller
      await new Promise((r) => setTimeout(r, 0));

      // Cancel the stream
      await handler.handleMessage({ type: 'arena.cancelChat', streamId: 'stream-23' });

      expect(abortSpy).toHaveBeenCalled();

      // Clean up — resolve the stream so the test doesn't leak
      resolveStream({ messageId: 'msg-cancel', content: '' });
      await flushAsync();

      abortSpy.mockRestore();
    });

    it('arena.streamMessage — does not block arena.loadMessages while stream is in progress', async () => {
      const { arenaService, arenaStorageService } = await import('../../services/index.js');

      let resolveStream!: (value: any) => void;
      (arenaService.streamChat as any).mockImplementation(
        () => new Promise((resolve) => {
          resolveStream = resolve;
        })
      );
      (arenaStorageService.loadMessages as any).mockResolvedValue([]);

      const chatRequest = { sessionId: 'sess-concurrent', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-concurrent', chatRequest });
      await flushAsync();

      await handler.handleMessage({ type: 'arena.loadMessages', requestId: 'r-concurrent', sessionId: 'sess-concurrent' });

      expect(arenaStorageService.loadMessages).toHaveBeenCalledWith('sess-concurrent');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.loadMessages', requestId: 'r-concurrent', messages: [] })
      );

      // Clean up stream to avoid leaving pending async work behind.
      resolveStream({ messageId: 'msg-concurrent', content: 'done' });
      await flushAsync();
    });

    it('arena.cancelChat — unknown streamId → does NOT throw', async () => {
      await expect(
        handler.handleMessage({ type: 'arena.cancelChat', streamId: 'nonexistent-stream' })
      ).resolves.not.toThrow();
    });

    // ==================== TASK-005: Heartbeat and logging ====================

    it('arena.streamMessage — sends heartbeat chunk immediately before streaming response', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-hb', content: 'Hello!' };
      (arenaService.streamChat as any).mockResolvedValue(response);

      const chatRequest = { sessionId: 'sess-hb', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-hb', chatRequest });
      await flushAsync();

      // The very first postMessage call for this streamId should be the heartbeat
      const calls = (mockPanel.webview.postMessage as any).mock.calls;
      const heartbeatCall = calls.find((call: any[]) =>
        call[0]?.type === 'arena.streamChunk' &&
        call[0]?.streamId === 'stream-hb' &&
        call[0]?.chunk?.heartbeat === true,
      );
      expect(heartbeatCall).toBeDefined();
      expect(heartbeatCall[0].chunk).toMatchObject({ heartbeat: true, content: '', done: false });
    });

    it('arena.streamMessage — logs stream start and complete with sessionId', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.streamChat as any).mockResolvedValue({ messageId: 'msg-log', content: '' });

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const chatRequest = { sessionId: 'sess-log', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', streamId: 'stream-log', chatRequest });
      await flushAsync();

      const startCall = consoleSpy.mock.calls.find((c) => String(c[0]).includes('[Arena] stream start'));
      expect(startCall).toBeDefined();
      expect(startCall?.[1]).toMatchObject({ streamId: 'stream-log', sessionId: 'sess-log' });

      const completeCall = consoleSpy.mock.calls.find((c) => String(c[0]).includes('[Arena] streamComplete'));
      expect(completeCall).toBeDefined();
      expect(completeCall?.[1]).toMatchObject({ streamId: 'stream-log', sessionId: 'sess-log' });

      consoleSpy.mockRestore();
    });
  });

  describe('exportFile handler', () => {
    it('posts fileExported with filePath and fileName when user picks a save location', async () => {
      const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');

      const savedUri = { fsPath: '/home/user/Downloads/report.html' };
      (mockWindow.showSaveDialog as any).mockResolvedValue(savedUri);
      (mockWorkspace.fs.writeFile as any).mockResolvedValue(undefined);

      const message = {
        type: 'exportFile',
        requestId: 'req-ef-1',
        data: { fileName: 'report.html', content: '<html/>', mimeType: 'text/html' },
      };

      await handler.handleMessage(message);

      expect(mockWorkspace.fs.writeFile).toHaveBeenCalledWith(
        savedUri,
        expect.any(Uint8Array)
      );
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fileExported',
          requestId: 'req-ef-1',
          filePath: '/home/user/Downloads/report.html',
          fileName: 'report.html',
        })
      );
    });

    it('posts fileExported with error when user cancels the save dialog', async () => {
      const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');

      (mockWindow.showSaveDialog as any).mockResolvedValue(undefined);

      const message = {
        type: 'exportFile',
        requestId: 'req-ef-2',
        data: { fileName: 'report.html', content: '<html/>', mimeType: 'text/html' },
      };

      await handler.handleMessage(message);

      expect(mockWorkspace.fs.writeFile).not.toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fileExported',
          requestId: 'req-ef-2',
          error: 'Export cancelled by user',
        })
      );
    });

    it('posts fileExported with error when writeFile throws', async () => {
      const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');

      const savedUri = { fsPath: '/home/user/Downloads/data.json' };
      (mockWindow.showSaveDialog as any).mockResolvedValue(savedUri);
      (mockWorkspace.fs.writeFile as any).mockRejectedValue(new Error('Permission denied'));

      const message = {
        type: 'exportFile',
        requestId: 'req-ef-3',
        data: { fileName: 'data.json', content: '{}', mimeType: 'application/json' },
      };

      await handler.handleMessage(message);

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fileExported',
          requestId: 'req-ef-3',
          error: 'Permission denied',
        })
      );
    });

    it.each([
      ['text/html', 'HTML', 'html'],
      ['application/json', 'JSON', 'json'],
      ['text/plain', 'All Files', '*'],
    ])('uses correct file filter for mimeType %s', async (mimeType, filterLabel, filterExt) => {
      const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');

      (mockWindow.showSaveDialog as any).mockResolvedValue(undefined);

      await handler.handleMessage({
        type: 'exportFile',
        requestId: 'req-ef-mime',
        data: { fileName: 'file.bin', content: 'data', mimeType },
      });

      expect(mockWindow.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            [filterLabel]: [filterExt],
          }),
        })
      );
    });
  });

  describe('downloadResponse handler', () => {
    it('decodes base64 payload, writes file, and posts correlated success response', async () => {
      const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');

      const savedUri = { fsPath: '/home/user/Downloads/response_2026-01-02T03-04-05.json' };
      (mockWindow.showSaveDialog as any).mockResolvedValue(savedUri);
      (mockWorkspace.fs.writeFile as any).mockResolvedValue(undefined);

      await handler.handleMessage({
        type: 'downloadResponse',
        requestId: 'req-dr-1',
        data: {
          body: btoa('{"ok":true}'),
          fileName: 'response_2026-01-02T03-04-05.json',
          contentType: 'application/json',
        },
      });

      expect(mockWindow.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({ JSON: ['json'] }),
        })
      );
      expect(mockWorkspace.fs.writeFile).toHaveBeenCalledWith(savedUri, expect.any(Uint8Array));

      const writtenBytes = (mockWorkspace.fs.writeFile as any).mock.calls[0][1] as Uint8Array;
      expect(new TextDecoder().decode(writtenBytes)).toBe('{"ok":true}');

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'downloadResponseResult',
          requestId: 'req-dr-1',
        })
      );
    });

    it('posts correlated error when user cancels response download', async () => {
      const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');

      (mockWindow.showSaveDialog as any).mockResolvedValue(undefined);

      await handler.handleMessage({
        type: 'downloadResponse',
        requestId: 'req-dr-2',
        data: {
          body: btoa('binary'),
          fileName: 'response.bin',
          contentType: 'application/octet-stream',
        },
      });

      expect(mockWorkspace.fs.writeFile).not.toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'downloadResponseResult',
          requestId: 'req-dr-2',
          error: 'Download cancelled by user',
        })
      );
    });
  });

  // ==========================================================================
  // saveRequestToCollection (FEAT-003: payload carries the whole CollectionItem)
  // ==========================================================================
  describe('saveRequestToCollection', () => {
    it('passes the serialized item through to collectionService.saveRequest', async () => {
      const { collectionService } = await import('../../services/index.js');
      const item = JSON.stringify({
        id: 'item-1',
        name: 'My Request',
        request: { id: 'req-1', name: 'My Request', method: 'GET', url: 'https://x' },
      });
      (collectionService.saveRequest as any).mockResolvedValue('col.json');
      (collectionService.loadOne as any).mockResolvedValue({
        info: { waveId: 'w', name: 'Col', version: '0.0.1' },
        item: [],
      });

      await handler.handleMessage({
        type: 'saveRequestToCollection',
        requestId: 'req-srtc-1',
        data: { item, collectionFileName: 'col.json', folderPath: ['Folder'] },
      });

      expect(collectionService.saveRequest).toHaveBeenCalledWith(item, 'col.json', ['Folder'], undefined);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'collectionUpdated',
          requestId: 'req-srtc-1',
          collection: expect.objectContaining({ filename: 'col.json' }),
        })
      );
    });

    it('does NOT post a bannerSuccess on successful save — notification is owned by the webview app layer (FEAT-FP-COL-001 TASK-002)', async () => {
      const { collectionService } = await import('../../services/index.js');
      const item = JSON.stringify({ id: 'item-2', name: 'Login', request: { id: 'r2', name: 'Login', method: 'POST', url: 'https://x/login' } });
      (collectionService.saveRequest as any).mockResolvedValue('col2.json');
      (collectionService.loadOne as any).mockResolvedValue({
        info: { waveId: 'w', name: 'Auth', version: '0.0.1' },
        item: [],
      });

      (mockPanel.webview.postMessage as any).mockClear();

      await handler.handleMessage({
        type: 'saveRequestToCollection',
        requestId: 'req-srtc-2',
        data: { item, collectionFileName: 'col2.json', folderPath: [] },
      });

      const calls: any[] = (mockPanel.webview.postMessage as any).mock.calls.map((c: any[]) => c[0]);
      expect(calls.some((m: any) => m.type === 'bannerSuccess')).toBe(false);
      expect(calls.some((m: any) => m.type === 'collectionUpdated')).toBe(true);
    });
  });

  // ==========================================================================
  // saveCollection (FEAT-003 regression: this message used to be silently
  // dropped — no handler case existed, so renames never persisted)
  // ==========================================================================
  describe('saveCollection', () => {
    const makeCollection = () => ({
      info: { waveId: 'w-1', name: 'Renamed Collection', version: '0.0.1' },
      item: [],
      filename: 'col.json',
    });

    it('persists the collection via collectionService.save and replies with it', async () => {
      const { collectionService } = await import('../../services/index.js');
      const collection = makeCollection();
      (collectionService.save as any).mockResolvedValue(collection);

      await handler.handleMessage({
        type: 'saveCollection',
        requestId: 'req-save-1',
        data: { collection: JSON.stringify(collection) },
      });

      expect(collectionService.save).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'col.json' }),
        'col.json'
      );
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'collectionSaved',
          requestId: 'req-save-1',
          collection: expect.objectContaining({ filename: 'col.json' }),
        })
      );
    });

    it('replies with a descriptive error when filename is missing', async () => {
      const { collectionService } = await import('../../services/index.js');
      const collection = { ...makeCollection(), filename: undefined };

      await handler.handleMessage({
        type: 'saveCollection',
        requestId: 'req-save-2',
        data: { collection: JSON.stringify(collection) },
      });

      expect(collectionService.save).not.toHaveBeenCalled();
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'collectionSaved',
          requestId: 'req-save-2',
          error: expect.stringContaining('filename'),
        })
      );
    });

    it('replies with an error when the service throws', async () => {
      const { collectionService } = await import('../../services/index.js');
      (collectionService.save as any).mockRejectedValue(new Error('disk full'));

      await handler.handleMessage({
        type: 'saveCollection',
        requestId: 'req-save-3',
        data: { collection: JSON.stringify(makeCollection()) },
      });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'collectionSaved',
          requestId: 'req-save-3',
          error: 'disk full',
        })
      );
    });
  });
});
