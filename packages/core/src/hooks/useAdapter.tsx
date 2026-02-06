/**
 * Platform Adapter Context
 * 
 * Provides platform-specific adapter implementations to the React component tree.
 * This is the key abstraction that allows the same UI to run on VS Code, Web etc.
 * 
 * Usage:
 * ```tsx
 * // In the platform-specific entry point (e.g., vscode webview)
 * const adapter = createVSCodeAdapter(vsCodeApi);
 * 
 * <AdapterProvider adapter={adapter}>
 *   <App />
 * </AdapterProvider>
 * ```
 * 
 * ```tsx
 * // In components/hooks
 * const adapter = useAdapter();
 * const collections = await adapter.storage.loadCollections();
 * ```
 */

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { 
    IPlatformAdapter, 
    AdapterEventType,
    AdapterEventHandler 
} from '../types/adapters';

// ============================================================================
// Context Definition
// ============================================================================

const AdapterContext = createContext<IPlatformAdapter | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

export interface AdapterProviderProps {
    adapter: IPlatformAdapter;
    children: ReactNode;
    /**
     * Called when the adapter is initialized
     */
    onInitialized?: () => void;
    /**
     * Called if adapter initialization fails
     */
    onError?: (error: Error) => void;
}

/**
 * Provides the platform adapter to all child components.
 * Handles adapter initialization and cleanup.
 */
export function AdapterProvider({
    adapter,
    children,
    onInitialized,
    onError,
}: AdapterProviderProps): React.ReactElement {
    const [isInitialized, setIsInitialized] = useState(!adapter.initialize);
    const [initError, setInitError] = useState<Error | null>(null);

    useEffect(() => {
        let mounted = true;

        async function init() {
            if (adapter.initialize) {
                try {
                    await adapter.initialize();
                    if (mounted) {
                        setIsInitialized(true);
                        onInitialized?.();
                    }
                } catch (error) {
                    if (mounted) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        setInitError(err);
                        onError?.(err);
                    }
                }
            }
        }

        init();

        return () => {
            mounted = false;
            adapter.dispose?.();
        };
    }, [adapter, onInitialized, onError]);

    if (initError) {
        return (
            <div className="flex items-center justify-center h-screen p-4">
                <div className="text-center">
                    <h2 className="text-lg font-semibold text-red-600 mb-2">
                        Failed to Initialize
                    </h2>
                    <p className="text-sm text-gray-600">
                        {initError.message}
                    </p>
                </div>
            </div>
        );
    }

    if (!isInitialized) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Initializing...</p>
                </div>
            </div>
        );
    }

    return (
        <AdapterContext.Provider value={adapter}>
            {children}
        </AdapterContext.Provider>
    );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the platform adapter.
 * Must be used within an AdapterProvider.
 * 
 * @throws Error if used outside of AdapterProvider
 */
export function useAdapter(): IPlatformAdapter {
    const adapter = useContext(AdapterContext);

    if (!adapter) {
        throw new Error(
            'useAdapter must be used within an AdapterProvider. ' +
            'Make sure to wrap your app with <AdapterProvider adapter={...}>.'
        );
    }

    return adapter;
}

/**
 * Hook to access a specific adapter.
 * Convenience wrapper around useAdapter().
 */
export function useStorageAdapter() {
    return useAdapter().storage;
}

export function useHttpAdapter() {
    return useAdapter().http;
}

export function useFileAdapter() {
    return useAdapter().file;
}

export function useSecretAdapter() {
    return useAdapter().secret;
}

export function useSecurityAdapter() {
    return useAdapter().security;
}

export function useNotificationAdapter() {
    return useAdapter().notification;
}

export function useArenaAdapter() {
    return useAdapter().arena;
}

/**
 * Hook to get the current platform.
 */
export function usePlatform() {
    return useAdapter().platform;
}

// ============================================================================
// Optional Context Hook (for checking if adapter is available)
// ============================================================================

/**
 * Hook to optionally access the platform adapter.
 * Returns null if not within an AdapterProvider.
 * Useful for components that can work with or without an adapter.
 */
export function useAdapterOptional(): IPlatformAdapter | null {
    return useContext(AdapterContext);
}

// ============================================================================
// Event Subscription Hooks
// ============================================================================

/**
 * Hook to subscribe to a specific adapter event.
 * Automatically handles subscription and cleanup.
 * 
 * @param event - The event type to subscribe to
 * @param handler - The handler function to call when the event fires
 * 
 * @example
 * ```tsx
 * // Subscribe to banner notifications
 * useAdapterEvent('banner', (event) => {
 *   setBanner({ type: event.type, message: event.message });
 * });
 * 
 * // Subscribe to collections changes
 * useAdapterEvent('collectionsChanged', () => {
 *   refetchCollections();
 * });
 * ```
 */
export function useAdapterEvent<T extends AdapterEventType>(
    event: T,
    handler: AdapterEventHandler<T>
): void {
    const adapter = useAdapter();
    
    // Memoize the handler to avoid unnecessary re-subscriptions
    const stableHandler = useCallback(handler, [handler]);

    useEffect(() => {
        adapter.events.on(event, stableHandler);
        return () => {
            adapter.events.off(event, stableHandler);
        };
    }, [adapter, event, stableHandler]);
}

/**
 * Hook to subscribe to multiple adapter events at once.
 * 
 * @param handlers - Object mapping event types to their handlers
 * 
 * @example
 * ```tsx
 * useAdapterEvents({
 *   banner: (event) => setBanner(event),
 *   collectionsChanged: () => refetchCollections(),
 *   encryptionStatusChanged: (status) => setEncryptionStatus(status),
 * });
 * ```
 */
export function useAdapterEvents(
    handlers: Partial<{ [K in AdapterEventType]: AdapterEventHandler<K> }>
): void {
    const adapter = useAdapter();

    useEffect(() => {
        // Subscribe to all provided events
        const entries = Object.entries(handlers) as Array<[AdapterEventType, AdapterEventHandler<any>]>;
        
        for (const [event, handler] of entries) {
            if (handler) {
                adapter.events.on(event, handler);
            }
        }

        // Cleanup: unsubscribe from all events
        return () => {
            for (const [event, handler] of entries) {
                if (handler) {
                    adapter.events.off(event, handler);
                }
            }
        };
    }, [adapter, handlers]);
}

/**
 * Hook to access the adapter's event emitter directly.
 * Useful when you need more control over event subscription.
 */
export function useAdapterEventEmitter() {
    return useAdapter().events;
}
