import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockAxios } from '../mocks/axios';
import type { Collection, Environment, ParsedRequest } from '@wave-client/core';

// Mock axios before importing webAdapter
const mockAxios = createMockAxios();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxios),
  },
}));

// Import after mocking
const { createWebAdapter } = await import('../../adapters/webAdapter');

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
      const mockHistory: ParsedRequest[] = [
        {
          id: 'req1',
          name: 'Test Request',
          method: 'GET',
          url: 'https://api.example.com',
          headers: [],
          params: [],
          body: null,
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
      const request: ParsedRequest = {
        id: 'req1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com',
        headers: [],
        params: [],
        body: null,
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
      { isOk: true, value: { response: mockResponse } },
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
