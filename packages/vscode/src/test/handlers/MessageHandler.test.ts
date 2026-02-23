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
  arenaStorageService: {
    loadSessions: vi.fn(),
    saveSession: vi.fn(),
    deleteSession: vi.fn(),
    loadMessages: vi.fn(),
    saveMessages: vi.fn(),
    clearSessionMessages: vi.fn(),
    loadDocuments: vi.fn(),
    saveDocumentMetadata: vi.fn(),
    saveDocumentContent: vi.fn(),
    deleteDocument: vi.fn(),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    loadReferences: vi.fn(),
    saveReferences: vi.fn(),
    loadProviderSettings: vi.fn(),
    saveProviderSettings: vi.fn(),
  },
  arenaService: {
    validateApiKey: vi.fn(),
    getAvailableModels: vi.fn(),
    streamChat: vi.fn(),
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

    // ==================== Storage — Documents ====================

    it('arena.uploadDocument — decodes base64 and calls saveDocumentContent + saveDocumentMetadata', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.saveDocumentContent as any).mockResolvedValue(undefined);
      (arenaStorageService.saveDocumentMetadata as any).mockResolvedValue(undefined);
      const metadata = { id: 'doc-1', filename: 'test.pdf', mimeType: 'application/pdf', size: 4, uploadedAt: 0, processed: false };
      const content = Buffer.from('test');
      const contentBase64 = content.toString('base64');

      await handler.handleMessage({ type: 'arena.uploadDocument', requestId: 'r8', metadata, contentBase64 });

      expect(arenaStorageService.saveDocumentContent).toHaveBeenCalledWith('doc-1', Buffer.from(contentBase64, 'base64'));
      expect(arenaStorageService.saveDocumentMetadata).toHaveBeenCalledWith(metadata);
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.uploadDocument', requestId: 'r8', document: metadata })
      );
    });

    it('arena.deleteDocument — calls deleteDocument(documentId)', async () => {
      const { arenaStorageService } = await import('../../services/index.js');
      (arenaStorageService.deleteDocument as any).mockResolvedValue(undefined);

      await handler.handleMessage({ type: 'arena.deleteDocument', requestId: 'r9', documentId: 'doc-1' });

      expect(arenaStorageService.deleteDocument).toHaveBeenCalledWith('doc-1');
      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.deleteDocument', requestId: 'r9' })
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

    // ==================== Streaming — streamMessage ====================

    it('arena.streamMessage — resolves → posts arena.streamComplete with requestId and response', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-1', content: 'Hello!' };
      (arenaService.streamChat as any).mockResolvedValue(response);

      const chatRequest = { sessionId: 'sess-stream', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', requestId: 'r19', chatRequest });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.streamComplete', requestId: 'r19', response })
      );
    });

    it('arena.streamMessage — rejects → posts arena.streamError with requestId and error', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.streamChat as any).mockRejectedValue(new Error('provider offline'));

      const chatRequest = { sessionId: 'sess-err', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', requestId: 'r20', chatRequest });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.streamError', requestId: 'r20', error: 'provider offline' })
      );
    });

    it('arena.streamMessage — onChunk callback posts arena.streamChunk without requestId', async () => {
      const { arenaService } = await import('../../services/index.js');
      const response = { messageId: 'msg-2', content: 'result' };
      (arenaService.streamChat as any).mockImplementation(async (_req: any, onChunk: any) => {
        onChunk({ messageId: 'msg-2', content: 'partial', done: false });
        return response;
      });

      const chatRequest = { sessionId: 'sess-chunk', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', requestId: 'r21', chatRequest });

      expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'arena.streamChunk', sessionId: 'sess-chunk', chunk: { messageId: 'msg-2', content: 'partial', done: false } })
      );
      // No requestId on the chunk message
      const chunkCall = (mockPanel.webview.postMessage as any).mock.calls.find(
        (call: any[]) => call[0].type === 'arena.streamChunk'
      );
      expect(chunkCall[0]).not.toHaveProperty('requestId');
    });

    it('arena.streamMessage — AbortController is removed from map after completion', async () => {
      const { arenaService } = await import('../../services/index.js');
      (arenaService.streamChat as any).mockResolvedValue({ messageId: 'msg-3', content: 'done' });

      const chatRequest = { sessionId: 'sess-done', message: 'hi', agent: 'wave-client', history: [], settings: {} };
      await handler.handleMessage({ type: 'arena.streamMessage', requestId: 'r22', chatRequest });

      // After completion, cancelChat with the same sessionId should be a no-op (no throw)
      expect(() => {
        handler.handleMessage({ type: 'arena.cancelChat', sessionId: 'sess-done' });
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
      const streamingHandlerPromise = handler.handleMessage({ type: 'arena.streamMessage', requestId: 'r23', chatRequest });

      // Give the async stream handler time to register the controller
      await new Promise((r) => setTimeout(r, 0));

      // Cancel the stream
      await handler.handleMessage({ type: 'arena.cancelChat', sessionId: 'sess-cancel' });

      expect(abortSpy).toHaveBeenCalled();

      // Clean up — resolve the stream so the test doesn't leak
      resolveStream({ messageId: 'msg-cancel', content: '' });
      await streamingHandlerPromise;

      abortSpy.mockRestore();
    });

    it('arena.cancelChat — unknown sessionId → does NOT throw', async () => {
      await expect(
        handler.handleMessage({ type: 'arena.cancelChat', sessionId: 'nonexistent-session' })
      ).resolves.not.toThrow();
    });
  });
});
