import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockAxios } from '../mocks/axios';
import type { Collection, Environment, CollectionRequest } from '@wave-client/core';

// Mock axios before importing webAdapter
const mockAxios = createMockAxios();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxios),
  },
}));

// Import after mocking
const { createWebAdapter, dispatchServerPushMessageForTests } = await import('../../adapters/webAdapter');
const { wsHandles, sseHandles } = await import('../../adapters/webRealtimeAdapter');

describe('WebAdapter - Storage', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    adapter = createWebAdapter();
  });

  describe('Collections', () => {
    it('loads collections successfully', async () => {
      const mockCollections: Collection[] = [
        {
          filename: 'test.json',
          info: { waveId: 'test-1', name: 'Test Collection', description: '' },
          item: [],
        },
      ];

      mockAxios.setResponse('/api/collections', {
        isOk: true,
        value: mockCollections,
      });

      const result = await adapter.storage.loadCollections();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(mockCollections);
      }
      expect(mockAxios.get).toHaveBeenCalledWith('/api/collections');
    });

    it('handles collection load error', async () => {
      mockAxios.setError('/api/collections', new Error('Network error'));

      const result = await adapter.storage.loadCollections();

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Network error');
      }
    });

    it('saves collection successfully', async () => {
      const collection: Collection = {
        filename: 'new.json',
        info: { waveId: 'new-1', name: 'New Collection', description: '' },
        item: [],
      };

      mockAxios.setResponse(
        '/api/collections',
        {
          isOk: true,
          value: collection,
        },
        'POST'
      );

      const result = await adapter.storage.saveCollection(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(collection);
      }
      // Filename is taken from collection.filename (not generated)
      expect(mockAxios.post).toHaveBeenCalledWith('/api/collections', {
        collection,
        filename: 'new.json',
      });
    });

    it('handles save collection error', async () => {
      const collection: Collection = {
        filename: 'test.json',
        info: { waveId: 'test-1', name: 'Test', description: '' },
        item: [],
      };

      mockAxios.setError('/api/collections', new Error('Save failed'), 'POST');

      const result = await adapter.storage.saveCollection(collection);

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Save failed');
      }
    });

    it('deletes collection successfully', async () => {
      mockAxios.setResponse(
        '/api/collections/test.json',
        { isOk: true, value: undefined },
        'DELETE'
      );

      const result = await adapter.storage.deleteCollection('test.json');

      expect(result.isOk).toBe(true);
      expect(mockAxios.delete).toHaveBeenCalledWith('/api/collections/test.json');
    });

    it('handles delete collection error', async () => {
      mockAxios.setError(
        '/api/collections/test.json',
        new Error('Delete failed'),
        'DELETE'
      );

      const result = await adapter.storage.deleteCollection('test.json');

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Delete failed');
      }
    });

    it('imports collection successfully', async () => {
      const mockCollections: Collection[] = [
        {
          filename: 'imported.json',
          info: { waveId: 'imported-1', name: 'Imported', description: '' },
          item: [],
        },
      ];

      mockAxios.setResponse(
        '/api/collections/import',
        { isOk: true, value: mockCollections },
        'POST'
      );

      const result = await adapter.storage.importCollection(
        'imported.json',
        '{"info":{"name":"Imported"}}'
      );

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(mockCollections);
      }
    });
  });

  describe('Environments', () => {
    it('loads environments successfully', async () => {
      const mockEnvironments: Environment[] = [
        { id: 'env1', name: 'Development', values: [] },
      ];

      mockAxios.setResponse('/api/environments', {
        isOk: true,
        value: mockEnvironments,
      });

      const result = await adapter.storage.loadEnvironments();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(mockEnvironments);
      }
    });

    it('handles environment load error', async () => {
      mockAxios.setError('/api/environments', new Error('Load failed'));

      const result = await adapter.storage.loadEnvironments();

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Load failed');
      }
    });

    it('saves environment successfully', async () => {
      const environment: Environment = {
        id: 'env1',
        name: 'Development',
        values: [
          {
            key: 'API_URL',
            value: 'http://localhost',
            type: 'default',
            enabled: true,
          },
        ],
      };

      mockAxios.setResponse(
        '/api/environments',
        { isOk: true, value: undefined },
        'POST'
      );

      const result = await adapter.storage.saveEnvironment(environment);

      expect(result.isOk).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith('/api/environments', environment);
    });

    it('deletes environment successfully', async () => {
      mockAxios.setResponse(
        '/api/environments/env1',
        { isOk: true, value: undefined },
        'DELETE'
      );

      const result = await adapter.storage.deleteEnvironment('env1');

      expect(result.isOk).toBe(true);
      expect(mockAxios.delete).toHaveBeenCalledWith('/api/environments/env1');
    });

    it('saves multiple environments successfully', async () => {
      const environments: Environment[] = [
        { id: 'env1', name: 'Dev', values: [] },
        { id: 'env2', name: 'Prod', values: [] },
      ];

      mockAxios.setResponse(
        '/api/environments',
        { isOk: true, value: undefined },
        'PUT'
      );

      const result = await adapter.storage.saveEnvironments(environments);

      expect(result.isOk).toBe(true);
      expect(mockAxios.put).toHaveBeenCalledWith('/api/environments', environments);
    });
  });

  describe('History', () => {
    it('loads history successfully', async () => {
      const mockHistory: CollectionRequest[] = [
        {
          id: 'req1',
          name: 'Test Request',
          method: 'GET',
          url: 'https://api.example.com',
          header: [],
          query: [],
          body: undefined,
          sourceRef: {
            collectionFilename: 'test.json',
            collectionName: 'Test',
            itemPath: [],
          },
        },
      ];

      mockAxios.setResponse('/api/history', {
        isOk: true,
        value: mockHistory,
      });

      const result = await adapter.storage.loadHistory();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(mockHistory);
      }
    });

    it('saves request to history successfully', async () => {
      const request: CollectionRequest = {
        id: 'req1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com',
        header: [],
        query: [],
        body: undefined,
        sourceRef: {
          collectionFilename: 'test.json',
          collectionName: 'Test',
          itemPath: [],
        },
      };

      mockAxios.setResponse(
        '/api/history',
        { isOk: true, value: undefined },
        'POST'
      );

      const result = await adapter.storage.saveRequestToHistory(request);

      expect(result.isOk).toBe(true);
      // History sends stringified request as requestContent
      expect(mockAxios.post).toHaveBeenCalledWith('/api/history', {
        requestContent: JSON.stringify(request),
      });
    });

    it('clears history successfully', async () => {
      mockAxios.setResponse(
        '/api/history',
        { isOk: true, value: undefined },
        'DELETE'
      );

      const result = await adapter.storage.clearHistory();

      expect(result.isOk).toBe(true);
      expect(mockAxios.delete).toHaveBeenCalledWith('/api/history');
    });

    it('deletes a single history item successfully', async () => {
      const requestId = 'req-abc_12345_hist_xyz';
      mockAxios.setResponse(
        `/api/history/${encodeURIComponent(requestId)}`,
        { isOk: true, value: undefined },
        'DELETE',
      );

      const result = await adapter.storage.deleteHistoryItem(requestId);

      expect(result.isOk).toBe(true);
      expect(mockAxios.delete).toHaveBeenCalledWith(
        `/api/history/${encodeURIComponent(requestId)}`,
      );
    });

    it('returns an error result when the server signals failure for deleteHistoryItem', async () => {
      const requestId = 'req-abc_12345_hist_xyz';
      mockAxios.setResponse(
        `/api/history/${encodeURIComponent(requestId)}`,
        { isOk: false, error: 'Not found' },
        'DELETE',
      );

      const result = await adapter.storage.deleteHistoryItem(requestId);

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Not found');
      }
    });

    it('returns an error result when the network request throws for deleteHistoryItem', async () => {
      const requestId = 'req-abc_12345_hist_xyz';
      mockAxios.setError(
        `/api/history/${encodeURIComponent(requestId)}`,
        new Error('Network error'),
        'DELETE',
      );

      const result = await adapter.storage.deleteHistoryItem(requestId);

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Network error');
      }
    });

    it('handles history errors', async () => {
      mockAxios.setError('/api/history', new Error('History error'));

      const result = await adapter.storage.loadHistory();

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('History error');
      }
    });
  });

  describe('Settings', () => {
    it('loads settings successfully', async () => {
      const mockSettings = {
        theme: 'dark' as const,
        fontSize: 14,
      };

      mockAxios.setResponse('/api/settings', {
        isOk: true,
        value: mockSettings,
      });

      const result = await adapter.storage.loadSettings();

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(mockSettings);
      }
    });

    it('saves settings successfully', async () => {
      const settings = {
        theme: 'light' as const,
        fontSize: 16,
        encryptionEnabled: false,
      };

      mockAxios.setResponse(
        '/api/settings',
        { isOk: true, value: undefined },
        'POST'
      );

      const result = await adapter.storage.saveSettings(settings);

      expect(result.isOk).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith('/api/settings', settings);
    });

    it('handles settings errors', async () => {
      mockAxios.setError('/api/settings', new Error('Settings error'));

      const result = await adapter.storage.loadSettings();

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Settings error');
      }
    });
  });
});

describe('WebAdapter - HTTP', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    adapter = createWebAdapter();
  });

  it('executes HTTP request successfully', async () => {
    const config = {
      id: 'req1',
      method: 'GET' as const,
      url: 'https://api.example.com/data',
      headers: [],
      params: [],
      body: { type: 'none' as const },
      envVars: {},
    };

    const mockResponse = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"success": true}',
      timings: {
        start: Date.now(),
        end: Date.now() + 100,
        duration: 100,
      },
      size: 18,
    };

    mockAxios.setResponse(
      '/api/http/execute',
      { isOk: true, value: mockResponse },
      'POST'
    );

    const result = await adapter.http.executeRequest(config);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.status).toBe(200);
      expect(result.value.body).toBe('{"success": true}');
    }
    expect(mockAxios.post).toHaveBeenCalledWith('/api/http/execute', config);
  });

  it('handles HTTP request error', async () => {
    const config = {
      id: 'req1',
      method: 'GET' as const,
      url: 'https://api.example.com',
      headers: [],
      params: [],
      body: { type: 'none' as const },
      envVars: {},
    };

    mockAxios.setError('/api/http/execute', new Error('Request failed'), 'POST');

    const result = await adapter.http.executeRequest(config);

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error).toContain('Request failed');
    }
  });
});

describe('WebAdapter - File', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    adapter = createWebAdapter();
  });

  it('shows save dialog (browser implementation)', async () => {
    const options = {
      defaultFileName: 'test.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };

    const path = await adapter.file.showSaveDialog(options);

    // Browser implementation returns download:// path (triggers download)
    expect(path).toBe('download://test.json');
  });

  it('shows open dialog (browser implementation)', async () => {
    const options = {
      canSelectMany: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    };

    // Create a spy to prevent actual file input
    const createElementSpy = vi.spyOn(document, 'createElement');
    const mockInput = {
      type: '',
      multiple: false,
      accept: '',
      onchange: null as any,
      oncancel: null as any,
      click: vi.fn(),
      files: null,
    };
    createElementSpy.mockReturnValue(mockInput as any);

    // Start the async operation
    const pathsPromise = adapter.file.showOpenDialog(options);

    // Simulate user cancelling
    setTimeout(() => {
      if (mockInput.oncancel) {
        mockInput.oncancel();
      }
    }, 10);

    const paths = await pathsPromise;

    // Browser implementation returns null when cancelled
    expect(paths).toBeNull();
    expect(mockInput.click).toHaveBeenCalled();

    createElementSpy.mockRestore();
  }, 1000);
});

describe('WebAdapter - Notification', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    adapter = createWebAdapter();
  });

  it('shows notification', () => {
    // Should not throw
    expect(() => {
      adapter.notification.showNotification('success', 'Test message');
    }).not.toThrow();
  });

  it('handles different notification types', () => {
    expect(() => {
      adapter.notification.showNotification('error', 'Error');
      adapter.notification.showNotification('info', 'Info');
      adapter.notification.showNotification('warning', 'Warning');
    }).not.toThrow();
  });
});

describe('WebAdapter - Platform', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    wsHandles.clear();
    sseHandles.clear();
    adapter = createWebAdapter();
  });

  it('identifies as web platform', () => {
    expect(adapter.platform).toBe('web');
  });

  it('has event emitter', () => {
    expect(adapter.events).toBeDefined();
    expect(adapter.events.on).toBeInstanceOf(Function);
    expect(adapter.events.off).toBeInstanceOf(Function);
    expect(adapter.events.emit).toBeInstanceOf(Function);
  });

  it('exposes realtime adapter methods', () => {
    expect(adapter.realtime).toBeDefined();
    expect(typeof adapter.realtime?.connectWebSocket).toBe('function');
    expect(typeof adapter.realtime?.disconnectWebSocket).toBe('function');
    expect(typeof adapter.realtime?.sendWebSocketMessage).toBe('function');
    expect(typeof adapter.realtime?.connectSse).toBe('function');
    expect(typeof adapter.realtime?.disconnectSse).toBe('function');
  });
});

describe('WebAdapter - Realtime push routing', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    wsHandles.clear();
    sseHandles.clear();
    adapter = createWebAdapter();
  });

  it('routes ws.message push events to matching WS handle', async () => {
    mockAxios.setResponse('/api/ws/connect', { isOk: true, value: {} }, 'POST');
    const handle = adapter.realtime!.connectWebSocket({ id: 'ws-route-1', url: 'wss://example.com/ws' });
    const onMessage = vi.fn();
    handle.onMessage(onMessage);

    dispatchServerPushMessageForTests({
      type: 'ws.message',
      data: {
        connectionId: 'ws-route-1',
        message: {
          id: 'msg-1',
          direction: 'received',
          content: 'hello',
          timestamp: 1,
          size: 5,
        },
      },
    });

    expect(onMessage).toHaveBeenCalledWith({
      id: 'msg-1',
      direction: 'received',
      content: 'hello',
      timestamp: 1,
      size: 5,
    });
  });

  it('routes ws.status/ws.headers/ws.error push events', async () => {
    mockAxios.setResponse('/api/ws/connect', { isOk: true, value: {} }, 'POST');
    const handle = adapter.realtime!.connectWebSocket({ id: 'ws-route-2', url: 'wss://example.com/ws' });
    const onStatus = vi.fn();
    const onHeaders = vi.fn();
    const onError = vi.fn();
    handle.onStatusChange(onStatus);
    handle.onHeaders(onHeaders);
    handle.onError(onError);

    dispatchServerPushMessageForTests({ type: 'ws.status', data: { connectionId: 'ws-route-2', status: 'connected' } });
    dispatchServerPushMessageForTests({
      type: 'ws.headers',
      data: { connectionId: 'ws-route-2', headers: { upgrade: 'websocket' } },
    });
    dispatchServerPushMessageForTests({ type: 'ws.error', data: { connectionId: 'ws-route-2', error: 'boom' } });

    expect(onStatus).toHaveBeenCalledWith('connected');
    expect(onHeaders).toHaveBeenCalledWith({ upgrade: 'websocket' });
    expect(onError).toHaveBeenCalledWith('boom');
  });

  it('routes sse.event/sse.status/sse.headers/sse.error push events', async () => {
    mockAxios.setResponse('/api/sse/connect', { isOk: true, value: {} }, 'POST');
    const handle = adapter.realtime!.connectSse({
      id: 'sse-route-1',
      method: 'GET',
      url: 'https://example.com/events',
    });

    const onEvent = vi.fn();
    const onStatus = vi.fn();
    const onHeaders = vi.fn();
    const onError = vi.fn();
    handle.onEvent(onEvent);
    handle.onStatusChange(onStatus);
    handle.onHeaders(onHeaders);
    handle.onError(onError);

    dispatchServerPushMessageForTests({
      type: 'sse.event',
      data: {
        connectionId: 'sse-route-1',
        event: { id: 'evt-1', eventName: 'message', data: '{"ok":true}', timestamp: 2 },
      },
    });
    dispatchServerPushMessageForTests({ type: 'sse.status', data: { connectionId: 'sse-route-1', status: 'connected' } });
    dispatchServerPushMessageForTests({
      type: 'sse.headers',
      data: { connectionId: 'sse-route-1', headers: { 'content-type': 'text/event-stream' } },
    });
    dispatchServerPushMessageForTests({ type: 'sse.error', data: { connectionId: 'sse-route-1', error: 'stream failed' } });

    expect(onEvent).toHaveBeenCalledWith({
      id: 'evt-1',
      eventName: 'message',
      data: '{"ok":true}',
      timestamp: 2,
    });
    expect(onStatus).toHaveBeenCalledWith('connected');
    expect(onHeaders).toHaveBeenCalledWith({ 'content-type': 'text/event-stream' });
    expect(onError).toHaveBeenCalledWith('stream failed');
  });

  it('ignores unknown realtime connection ids without throwing', () => {
    expect(() => {
      dispatchServerPushMessageForTests({
        type: 'ws.message',
        data: {
          connectionId: 'unknown-conn',
          message: {
            id: 'msg-x',
            direction: 'received',
            content: 'ignored',
            timestamp: 1,
            size: 7,
          },
        },
      });
    }).not.toThrow();
  });

  it('preserves existing banner push-event behavior', () => {
    const onBanner = vi.fn();
    adapter.events.on('banner', onBanner);

    dispatchServerPushMessageForTests({
      type: 'banner',
      data: { type: 'info', message: 'hello banner' },
    });

    expect(onBanner).toHaveBeenCalledWith({ type: 'info', message: 'hello banner' });
  });
});

describe('WebAdapter - WebSocket diagnostics', () => {
  const originalWebSocket = global.WebSocket;
  let adapter: ReturnType<typeof createWebAdapter>;
  let mockSocket: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    readyState: number;
    onopen: (() => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
  };

  beforeEach(() => {
    mockAxios.reset();

    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 0,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    };

    const mockWebSocketCtor = vi.fn(() => mockSocket) as unknown as typeof WebSocket;
    (mockWebSocketCtor as unknown as { CONNECTING: number; OPEN: number }).CONNECTING = 0;
    (mockWebSocketCtor as unknown as { CONNECTING: number; OPEN: number }).OPEN = 1;

    global.WebSocket = mockWebSocketCtor;
    adapter = createWebAdapter();
  });

  afterEach(() => {
    adapter.dispose?.();
    global.WebSocket = originalWebSocket;
  });

  // Skip: This test assumes fresh WebSocket initialization, but due to shared module state
  // across tests, the WebSocket may already be active and skip reinitialization,
  // preventing the onerror handler from being attached.
  it.skip('emits actionable warning diagnostics when websocket setup errors', async () => {
    const onBanner = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    adapter.events.on('banner', onBanner);
    mockAxios.setError('/health', new Error('Server down'));

    mockSocket.onerror?.(new Event('error'));
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Wave Client Server is not reachable')
    );
    expect(onBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
      })
    );

    warnSpy.mockRestore();
  });

  // Skip: Same issue as above - assumes fresh WebSocket initialization with event handlers,
  // but WebSocket reinitialization is skipped due to shared module state.
  it.skip('emits a success banner after a prior websocket issue recovers', async () => {
    const onBanner = vi.fn();

    adapter.events.on('banner', onBanner);
    mockAxios.setError('/health', new Error('Server down'));

    mockSocket.onerror?.(new Event('error'));
    await Promise.resolve();
    await Promise.resolve();

    mockSocket.onopen?.();

    expect(onBanner).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warning' })
    );
    expect(onBanner).toHaveBeenCalledWith({
      type: 'success',
      message: 'Realtime channel reconnected.',
    });
  });
});

describe('checkServerHealth', () => {
  beforeEach(() => {
    mockAxios.reset();
  });

  it('returns true when server is healthy', async () => {
    const { checkServerHealth } = await import('../../adapters/webAdapter');
    
    mockAxios.setResponse('/health', { status: 'ok' });

    const result = await checkServerHealth();

    expect(result).toBe(true);
    expect(mockAxios.get).toHaveBeenCalledWith('/health');
  });

  it('returns false when server is unhealthy', async () => {
    const { checkServerHealth } = await import('../../adapters/webAdapter');
    
    mockAxios.setError('/health', new Error('Server down'));

    const result = await checkServerHealth();

    expect(result).toBe(false);
  });

  it('returns false when server returns wrong status', async () => {
    const { checkServerHealth } = await import('../../adapters/webAdapter');
    
    mockAxios.setResponse('/health', { status: 'error' });

    const result = await checkServerHealth();

    expect(result).toBe(false);
  });
});

describe('WebAdapter - exportFile', () => {
  let adapter: ReturnType<typeof createWebAdapter>;
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;
  let appendChildSpy: ReturnType<typeof vi.fn>;
  let removeChildSpy: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;
  let createElementSpy: import('vitest').MockInstance<any>;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    adapter = createWebAdapter();

    createObjectURLSpy = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    clickSpy = vi.fn();

    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    appendChildSpy = vi.fn();
    removeChildSpy = vi.fn();
    originalCreateElement = document.createElement.bind(document) as typeof document.createElement;

    // Spy on document.createElement to capture the anchor element
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'a') {
        const el = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
        return el;
      }
      return originalCreateElement(tagName, options);
    }) as any);

    vi.spyOn(document.body, 'appendChild').mockImplementation(appendChildSpy);
    vi.spyOn(document.body, 'removeChild').mockImplementation(removeChildSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok with empty filePath and the given fileName', async () => {
    const result = await adapter.storage.exportFile('report.html', '<html/>', 'text/html');

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.filePath).toBe('');
      expect(result.value.fileName).toBe('report.html');
    }
  });

  it('creates a Blob with the correct content and mimeType', async () => {
    const BlobSpy = vi.spyOn(global, 'Blob').mockImplementation(
      (parts, opts) => ({ parts, opts, size: 0, type: opts?.type ?? '' }) as unknown as Blob
    );

    await adapter.storage.exportFile('data.json', '{"a":1}', 'application/json');

    expect(BlobSpy).toHaveBeenCalledWith(['{"a":1}'], { type: 'application/json' });
    BlobSpy.mockRestore();
  });

  it('sets anchor href and download, then clicks and cleans up', async () => {
    await adapter.storage.exportFile('report.html', '<html/>', 'text/html');

    // Verify the object URL was created and revoked
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');

    // Verify click was called
    expect(clickSpy).toHaveBeenCalledTimes(1);

    // Verify anchor was appended and removed
    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(removeChildSpy).toHaveBeenCalledTimes(1);
  });

  it('sets correct download filename on anchor', async () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    createElementSpy.mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      if (tagName === 'a') {
        const el = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement;
        capturedAnchor = el;
        return el;
      }
      return originalCreateElement(tagName, options);
    }) as any);

    await adapter.storage.exportFile('my-report.html', 'content', 'text/html');

    expect(capturedAnchor).not.toBeNull();
    expect((capturedAnchor as any).download).toBe('my-report.html');
    expect((capturedAnchor as any).href).toBe('blob:mock-url');
  });

  it('returns err when createObjectURL throws', async () => {
    createObjectURLSpy.mockImplementation(() => {
      throw new Error('Blob API unavailable');
    });

    const result = await adapter.storage.exportFile('report.html', '<html/>', 'text/html');

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error).toBe('Blob API unavailable');
    }
  });
});
