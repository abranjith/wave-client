import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockWebviewPanel } from '../mocks/vscode.js';

// ── VS Code mock ──────────────────────────────────────────────────────────────
vi.mock('vscode', async () => {
  const { mockWindow, mockWorkspace } = await import('../mocks/vscode.js');
  return {
    window: mockWindow,
    workspace: mockWorkspace,
  };
});

// ── Shared services mock ──────────────────────────────────────────────────────
// We need the WS/SSE mock handles to be captured per-call so individual tests
// can control what each connect() returns.

/** Factory that creates a fresh mock WsConnectionHandle for each connect() call. */
function createMockWsHandle(connectionId: string) {

  const statusListeners: Array<(s: string) => void> = [];
  const messageListeners: Array<(m: unknown) => void> = [];
  const headerListeners: Array<(h: Record<string, string>) => void> = [];
  const errorListeners: Array<(e: string) => void> = [];

  return {
    connectionId,
    onStatusChange: vi.fn().mockImplementation((cb: (s: string) => void) => {
      statusListeners.push(cb);
      return () => {};
    }),
    onMessage: vi.fn().mockImplementation((cb: (m: unknown) => void) => {
      messageListeners.push(cb);
      return () => {};
    }),
    onHeaders: vi.fn().mockImplementation((cb: (h: Record<string, string>) => void) => {
      headerListeners.push(cb);
      return () => {};
    }),
    onError: vi.fn().mockImplementation((cb: (e: string) => void) => {
      errorListeners.push(cb);
      return () => {};
    }),
    // Test helpers to simulate events
    _emitStatus: (s: string) => statusListeners.forEach((cb) => cb(s)),
    _emitMessage: (m: unknown) => messageListeners.forEach((cb) => cb(m)),
    _emitHeaders: (h: Record<string, string>) => headerListeners.forEach((cb) => cb(h)),
    _emitError: (e: string) => errorListeners.forEach((cb) => cb(e)),
  };
}

/** Factory that creates a fresh mock SseConnectionHandle for each connect() call. */
function createMockSseHandle(connectionId: string) {

  const statusListeners: Array<(s: string) => void> = [];
  const eventListeners: Array<(e: unknown) => void> = [];
  const headerListeners: Array<(h: Record<string, string>) => void> = [];
  const errorListeners: Array<(e: string) => void> = [];

  return {
    connectionId,
    onStatusChange: vi.fn().mockImplementation((cb: (s: string) => void) => {
      statusListeners.push(cb);
      return () => {};
    }),
    onEvent: vi.fn().mockImplementation((cb: (e: unknown) => void) => {
      eventListeners.push(cb);
      return () => {};
    }),
    onHeaders: vi.fn().mockImplementation((cb: (h: Record<string, string>) => void) => {
      headerListeners.push(cb);
      return () => {};
    }),
    onError: vi.fn().mockImplementation((cb: (e: string) => void) => {
      errorListeners.push(cb);
      return () => {};
    }),
    _emitStatus: (s: string) => statusListeners.forEach((cb) => cb(s)),
    _emitEvent: (e: unknown) => eventListeners.forEach((cb) => cb(e)),
    _emitHeaders: (h: Record<string, string>) => headerListeners.forEach((cb) => cb(h)),
    _emitError: (e: string) => errorListeners.forEach((cb) => cb(e)),
  };
}

const mockWsConnect = vi.fn();
const mockWsDisconnect = vi.fn();
const mockWsSendMessage = vi.fn();
const mockSseConnect = vi.fn();
const mockSseDisconnect = vi.fn();

vi.mock('@wave-client/shared', () => ({
  httpService: { execute: vi.fn() },
  collectionService: { loadAll: vi.fn() },
  environmentService: { loadAll: vi.fn() },
  historyService: { loadHistory: vi.fn() },
  cookieService: { loadCookies: vi.fn() },
  storeService: {
    loadAuths: vi.fn(),
    loadProxies: vi.fn(),
    loadCerts: vi.fn(),
    getProxyForUrl: vi.fn(),
    getHttpsAgentForUrl: vi.fn(),
  },
  settingsService: { loadSettings: vi.fn() },
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
  flowService: { loadAll: vi.fn(), save: vi.fn(), delete: vi.fn() },
  testSuiteService: { loadAll: vi.fn(), save: vi.fn(), delete: vi.fn() },
  fileService: {
    readFile: vi.fn(),
    readFileAsBinary: vi.fn(),
    writeFile: vi.fn(),
    writeBinaryFile: vi.fn(),
  },
  webSocketService: {
    connect: mockWsConnect,
    disconnect: mockWsDisconnect,
    sendMessage: mockWsSendMessage,
  },
  sseService: {
    connect: mockSseConnect,
    disconnect: mockSseDisconnect,
  },
}));

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

vi.mock('@wave-client/arena', () => ({
  arenaService: {
    initMcpBridge: vi.fn().mockResolvedValue('connected'),
    validateApiKey: vi.fn(),
    getAvailableModels: vi.fn(),
    streamChat: vi.fn(),
  },
}));

describe('MessageHandler — WebSocket Handlers', () => {
  let handler: any;
  let mockPanel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPanel = createMockWebviewPanel();
    const { MessageHandler } = await import('../../handlers/MessageHandler.js');
    handler = new MessageHandler(mockPanel);
  });

  it('ws.connect — calls webSocketService.connect with config', async () => {
    const config = { id: 'conn-1', url: 'wss://example.com/ws' };
    const mockHandle = createMockWsHandle('conn-1');
    mockWsConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'ws.connect', config });

    expect(mockWsConnect).toHaveBeenCalledWith(config);
  });

  it('ws.connect — registers all four event listeners', async () => {
    const config = { id: 'conn-2', url: 'wss://example.com/ws' };
    const mockHandle = createMockWsHandle('conn-2');
    mockWsConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'ws.connect', config });

    expect(mockHandle.onStatusChange).toHaveBeenCalled();
    expect(mockHandle.onMessage).toHaveBeenCalled();
    expect(mockHandle.onHeaders).toHaveBeenCalled();
    expect(mockHandle.onError).toHaveBeenCalled();
  });

  it('ws.connect — push ws.status to webview when status changes', async () => {
    const config = { id: 'conn-3', url: 'wss://example.com/ws' };
    const mockHandle = createMockWsHandle('conn-3');
    mockWsConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'ws.connect', config });
    mockHandle._emitStatus('connected');

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.status', connectionId: 'conn-3', status: 'connected' })
    );
  });

  it('ws.connect — push ws.message to webview on incoming message', async () => {
    const config = { id: 'conn-4', url: 'wss://example.com/ws' };
    const mockHandle = createMockWsHandle('conn-4');
    mockWsConnect.mockResolvedValue(mockHandle);
    const wsMsg = { id: 'msg-1', direction: 'received', content: 'hello', timestamp: 1000, size: 5 };

    await handler.handleMessage({ type: 'ws.connect', config });
    mockHandle._emitMessage(wsMsg);

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.message', connectionId: 'conn-4', message: wsMsg })
    );
  });

  it('ws.connect — push ws.headers to webview on upgrade headers', async () => {
    const config = { id: 'conn-5', url: 'wss://example.com/ws' };
    const mockHandle = createMockWsHandle('conn-5');
    mockWsConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'ws.connect', config });
    mockHandle._emitHeaders({ 'x-custom': 'value' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.headers', connectionId: 'conn-5', headers: { 'x-custom': 'value' } })
    );
  });

  it('ws.connect — push ws.error to webview on connection error', async () => {
    const config = { id: 'conn-6', url: 'wss://example.com/ws' };
    const mockHandle = createMockWsHandle('conn-6');
    mockWsConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'ws.connect', config });
    mockHandle._emitError('connection refused');

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.error', connectionId: 'conn-6', error: 'connection refused' })
    );
  });

  it('ws.connect — push ws.error when service returns null (invalid URL)', async () => {
    const config = { id: 'conn-null', url: 'http://invalid' };
    mockWsConnect.mockResolvedValue(null);

    await handler.handleMessage({ type: 'ws.connect', config });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.error', connectionId: 'conn-null' })
    );
  });

  it('ws.connect — ignores message with missing config.id', async () => {
    mockWsConnect.mockResolvedValue(null);

    await handler.handleMessage({ type: 'ws.connect', config: {} });

    expect(mockWsConnect).not.toHaveBeenCalled();
  });

  it('ws.disconnect — calls webSocketService.disconnect and sends ws.disconnectResponse', async () => {
    mockWsDisconnect.mockResolvedValue({ isOk: true });

    await handler.handleMessage({ type: 'ws.disconnect', connectionId: 'conn-x', requestId: 'req-1' });

    expect(mockWsDisconnect).toHaveBeenCalledWith('conn-x');
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.disconnectResponse', requestId: 'req-1' })
    );
  });

  it('ws.disconnect — includes error in response on failure', async () => {
    mockWsDisconnect.mockResolvedValue({ isOk: false, error: 'not connected' });

    await handler.handleMessage({ type: 'ws.disconnect', connectionId: 'conn-y', requestId: 'req-2' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.disconnectResponse', requestId: 'req-2', error: 'not connected' })
    );
  });

  it('ws.send — calls webSocketService.sendMessage and sends ws.sendResponse', async () => {
    mockWsSendMessage.mockResolvedValue({ isOk: true });

    await handler.handleMessage({ type: 'ws.send', connectionId: 'conn-z', message: 'ping', requestId: 'req-3' });

    expect(mockWsSendMessage).toHaveBeenCalledWith('conn-z', 'ping');
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.sendResponse', requestId: 'req-3' })
    );
  });

  it('ws.send — includes error in response on failure', async () => {
    mockWsSendMessage.mockResolvedValue({ isOk: false, error: 'send failed' });

    await handler.handleMessage({ type: 'ws.send', connectionId: 'conn-w', message: 'data', requestId: 'req-4' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ws.sendResponse', requestId: 'req-4', error: 'send failed' })
    );
  });
});

describe('MessageHandler — SSE Handlers', () => {
  let handler: any;
  let mockPanel: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPanel = createMockWebviewPanel();
    const { MessageHandler } = await import('../../handlers/MessageHandler.js');
    handler = new MessageHandler(mockPanel);
  });

  it('sse.connect — calls sseService.connect with config', async () => {
    const config = { id: 'sse-1', url: 'https://example.com/events', method: 'GET' };
    const mockHandle = createMockSseHandle('sse-1');
    mockSseConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'sse.connect', config });

    expect(mockSseConnect).toHaveBeenCalledWith(config);
  });

  it('sse.connect — all four event listeners are registered', async () => {
    const config = { id: 'sse-2', url: 'https://example.com/events', method: 'GET' };
    const mockHandle = createMockSseHandle('sse-2');
    mockSseConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'sse.connect', config });

    expect(mockHandle.onStatusChange).toHaveBeenCalled();
    expect(mockHandle.onEvent).toHaveBeenCalled();
    expect(mockHandle.onHeaders).toHaveBeenCalled();
    expect(mockHandle.onError).toHaveBeenCalled();
  });

  it('sse.connect — push sse.status when status changes', async () => {
    const config = { id: 'sse-3', url: 'https://example.com/events', method: 'GET' };
    const mockHandle = createMockSseHandle('sse-3');
    mockSseConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'sse.connect', config });
    mockHandle._emitStatus('connected');

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.status', connectionId: 'sse-3', status: 'connected' })
    );
  });

  it('sse.connect — push sse.event when event is received', async () => {
    const config = { id: 'sse-4', url: 'https://example.com/events', method: 'GET' };
    const mockHandle = createMockSseHandle('sse-4');
    mockSseConnect.mockResolvedValue(mockHandle);
    const sseEvt = { id: 'ev-1', eventName: 'message', data: 'hello world', timestamp: 2000 };

    await handler.handleMessage({ type: 'sse.connect', config });
    mockHandle._emitEvent(sseEvt);

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.event', connectionId: 'sse-4', event: sseEvt })
    );
  });

  it('sse.connect — push sse.headers when response headers arrive', async () => {
    const config = { id: 'sse-5', url: 'https://example.com/events', method: 'GET' };
    const mockHandle = createMockSseHandle('sse-5');
    mockSseConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'sse.connect', config });
    mockHandle._emitHeaders({ 'content-type': 'text/event-stream' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.headers', connectionId: 'sse-5' })
    );
  });

  it('sse.connect — push sse.error when stream error occurs', async () => {
    const config = { id: 'sse-6', url: 'https://example.com/events', method: 'GET' };
    const mockHandle = createMockSseHandle('sse-6');
    mockSseConnect.mockResolvedValue(mockHandle);

    await handler.handleMessage({ type: 'sse.connect', config });
    mockHandle._emitError('stream error');

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.error', connectionId: 'sse-6', error: 'stream error' })
    );
  });

  it('sse.connect — push sse.error when service returns null (invalid URL)', async () => {
    const config = { id: 'sse-null', url: 'ws://invalid', method: 'GET' };
    mockSseConnect.mockResolvedValue(null);

    await handler.handleMessage({ type: 'sse.connect', config });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.error', connectionId: 'sse-null' })
    );
  });

  it('sse.connect — ignores message with missing config.id', async () => {
    mockSseConnect.mockResolvedValue(null);

    await handler.handleMessage({ type: 'sse.connect', config: {} });

    expect(mockSseConnect).not.toHaveBeenCalled();
  });

  it('sse.disconnect — calls sseService.disconnect and sends sse.disconnectResponse', async () => {
    mockSseDisconnect.mockResolvedValue({ isOk: true });

    await handler.handleMessage({ type: 'sse.disconnect', connectionId: 'sse-x', requestId: 'req-s1' });

    expect(mockSseDisconnect).toHaveBeenCalledWith('sse-x');
    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.disconnectResponse', requestId: 'req-s1' })
    );
  });

  it('sse.disconnect — includes error in response on failure', async () => {
    mockSseDisconnect.mockResolvedValue({ isOk: false, error: 'stream gone' });

    await handler.handleMessage({ type: 'sse.disconnect', connectionId: 'sse-y', requestId: 'req-s2' });

    expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sse.disconnectResponse', requestId: 'req-s2', error: 'stream gone' })
    );
  });
});

describe('MessageHandler — dispose()', () => {
  it('dispose — calls disconnect for all active WS and SSE handles', async () => {
    vi.clearAllMocks();
    const mockPanel: any = createMockWebviewPanel();
    const { MessageHandler } = await import('../../handlers/MessageHandler.js');
    const handler = new MessageHandler(mockPanel);

    const wsHandle = createMockWsHandle('ws-dispose');
    mockWsConnect.mockResolvedValue(wsHandle);
    const sseHandle = createMockSseHandle('sse-dispose');
    mockSseConnect.mockResolvedValue(sseHandle);
    mockWsDisconnect.mockResolvedValue({ isOk: true });
    mockSseDisconnect.mockResolvedValue({ isOk: true });

    await handler.handleMessage({ type: 'ws.connect', config: { id: 'ws-dispose', url: 'wss://x.com/ws' } });
    await handler.handleMessage({ type: 'sse.connect', config: { id: 'sse-dispose', url: 'https://x.com/sse', method: 'GET' } });

    handler.dispose();

    expect(mockWsDisconnect).toHaveBeenCalledWith('ws-dispose');
    expect(mockSseDisconnect).toHaveBeenCalledWith('sse-dispose');
  });
});
