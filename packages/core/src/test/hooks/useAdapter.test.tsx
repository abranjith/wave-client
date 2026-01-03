import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AdapterProvider,
  useAdapter,
  useStorageAdapter,
  useHttpAdapter,
  useFileAdapter,
  useSecretAdapter,
  useSecurityAdapter,
  useNotificationAdapter,
  usePlatform,
  useAdapterOptional,
  useAdapterEvent,
} from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import type { IPlatformAdapter } from '../../types/adapters';
import { Ok } from '../../utils/result';

describe('useAdapter', () => {
  describe('useAdapter hook', () => {
    it('should throw error when used outside AdapterProvider', () => {
      function TestComponent() {
        useAdapter();
        return <div>Test</div>;
      }

      // Suppress console.error for this test (React will log errors for thrown errors in render)
      const originalError = console.error;
      console.error = vi.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAdapter must be used within an AdapterProvider');

      console.error = originalError;
    });

    it('should return adapter when used inside AdapterProvider', () => {
      const mockAdapter = createMockAdapter();
      let capturedAdapter: IPlatformAdapter | null = null;

      function TestComponent() {
        capturedAdapter = useAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(capturedAdapter).toBe(mockAdapter);
    });
  });

  describe('specific adapter hooks', () => {
    it('useStorageAdapter should return storage adapter', () => {
      const mockAdapter = createMockAdapter();
      let storageAdapter: any = null;

      function TestComponent() {
        storageAdapter = useStorageAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(storageAdapter).toBe(mockAdapter.storage);
    });

    it('useHttpAdapter should return http adapter', () => {
      const mockAdapter = createMockAdapter();
      let httpAdapter: any = null;

      function TestComponent() {
        httpAdapter = useHttpAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(httpAdapter).toBe(mockAdapter.http);
    });

    it('useFileAdapter should return file adapter', () => {
      const mockAdapter = createMockAdapter();
      let fileAdapter: any = null;

      function TestComponent() {
        fileAdapter = useFileAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(fileAdapter).toBe(mockAdapter.file);
    });

    it('useSecretAdapter should return secret adapter', () => {
      const mockAdapter = createMockAdapter();
      let secretAdapter: any = null;

      function TestComponent() {
        secretAdapter = useSecretAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(secretAdapter).toBe(mockAdapter.secret);
    });

    it('useSecurityAdapter should return security adapter', () => {
      const mockAdapter = createMockAdapter();
      let securityAdapter: any = null;

      function TestComponent() {
        securityAdapter = useSecurityAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(securityAdapter).toBe(mockAdapter.security);
    });

    it('useNotificationAdapter should return notification adapter', () => {
      const mockAdapter = createMockAdapter();
      let notificationAdapter: any = null;

      function TestComponent() {
        notificationAdapter = useNotificationAdapter();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(notificationAdapter).toBe(mockAdapter.notification);
    });
  });

  describe('usePlatform hook', () => {
    it('should return the platform type', () => {
      const mockAdapter = createMockAdapter({ platform: 'test' });
      let platform: any = null;

      function TestComponent() {
        platform = usePlatform();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(platform).toBe('test');
    });
  });

  describe('useAdapterOptional hook', () => {
    it('should return null when used outside AdapterProvider', () => {
      let adapter: any = undefined;

      function TestComponent() {
        adapter = useAdapterOptional();
        return <div>Test</div>;
      }

      render(<TestComponent />);

      expect(adapter).toBeNull();
    });

    it('should return adapter when used inside AdapterProvider', () => {
      const mockAdapter = createMockAdapter();
      let adapter: any = null;

      function TestComponent() {
        adapter = useAdapterOptional();
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      expect(adapter).toBe(mockAdapter);
    });
  });

  describe('AdapterProvider', () => {
    it('should render children when adapter does not need initialization', () => {
      const mockAdapter = createMockAdapter();

      render(
        <AdapterProvider adapter={mockAdapter}>
          <div data-testid="child">Child Component</div>
        </AdapterProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should show loading state while initializing', async () => {
      const mockAdapter = createMockAdapter();
      mockAdapter.initialize = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );

      render(
        <AdapterProvider adapter={mockAdapter}>
          <div data-testid="child">Child Component</div>
        </AdapterProvider>
      );

      expect(screen.getByText('Initializing...')).toBeInTheDocument();
    });

    it('should call onInitialized after successful initialization', async () => {
      const onInitialized = vi.fn();
      const mockAdapter = createMockAdapter();
      mockAdapter.initialize = vi.fn(() => Promise.resolve());

      render(
        <AdapterProvider adapter={mockAdapter} onInitialized={onInitialized}>
          <div>Child</div>
        </AdapterProvider>
      );

      await vi.waitFor(() => {
        expect(onInitialized).toHaveBeenCalled();
      });
    });

    it('should show error when initialization fails', async () => {
      const onError = vi.fn();
      const mockAdapter = createMockAdapter();
      mockAdapter.initialize = vi.fn(() =>
        Promise.reject(new Error('Init failed'))
      );

      render(
        <AdapterProvider adapter={mockAdapter} onError={onError}>
          <div>Child</div>
        </AdapterProvider>
      );

      await vi.waitFor(() => {
        expect(screen.getByText('Failed to Initialize')).toBeInTheDocument();
        expect(screen.getByText('Init failed')).toBeInTheDocument();
      });
    });

    it('should call dispose on unmount', () => {
      const dispose = vi.fn();
      const mockAdapter = createMockAdapter();
      mockAdapter.dispose = dispose;

      const { unmount } = render(
        <AdapterProvider adapter={mockAdapter}>
          <div>Child</div>
        </AdapterProvider>
      );

      unmount();

      expect(dispose).toHaveBeenCalled();
    });
  });

  describe('useAdapterEvent hook', () => {
    it('should subscribe to events and receive notifications', async () => {
      const mockAdapter = createMockAdapter();
      const handler = vi.fn();

      function TestComponent() {
        useAdapterEvent('banner', handler);
        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      // Emit event
      mockAdapter.events.emit('banner', {
        type: 'success',
        message: 'Test message',
      });

      expect(handler).toHaveBeenCalledWith({
        type: 'success',
        message: 'Test message',
      });
    });

    it('should unsubscribe from events on unmount', () => {
      const mockAdapter = createMockAdapter();
      const handler = vi.fn();

      function TestComponent() {
        useAdapterEvent('banner', handler);
        return <div>Test</div>;
      }

      const { unmount } = render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      unmount();

      // Emit event after unmount
      mockAdapter.events.emit('banner', {
        type: 'success',
        message: 'Should not be received',
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('adapter integration', () => {
    it('should allow components to call adapter methods', async () => {
      const mockCollections = [
        { 
          info: { waveId: 'test-id', name: 'Test Collection' },
          item: [],
          filename: 'test'
        },
      ];

      const mockAdapter = createMockAdapter({
        storage: {
          loadCollections: async () => Ok(mockCollections),
        },
      });

      let result: any = null;

      function TestComponent() {
        const storage = useStorageAdapter();

        const loadData = async () => {
          const res = await storage.loadCollections();
          if (res.isOk) {
            result = res.value;
          }
        };

        loadData();

        return <div>Test</div>;
      }

      render(
        <AdapterProvider adapter={mockAdapter}>
          <TestComponent />
        </AdapterProvider>
      );

      await vi.waitFor(() => {
        expect(result).toEqual(mockCollections);
      });
    });
  });
});
