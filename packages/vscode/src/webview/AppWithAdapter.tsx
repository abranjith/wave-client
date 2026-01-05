/**
 * App Entry Point with Adapter Pattern
 * 
 * This file provides the AdapterProvider at the root level, allowing all components to
 * access platform-specific functionality through a unified interface.
 * 
 * MIGRATION STRATEGY:
 * 1. Phase 1 (Current): Create adapter infrastructure alongside existing code
 * 2. Phase 2: Update components to use useAdapter() hook instead of vsCodeRef prop
 * 3. Phase 3: Remove legacy vsCodeRef.postMessage calls
 * 4. Phase 4: Extract to wave-client-core package
 * 
 * IMPORTANT: acquireVsCodeApi() can only be called once per webview session.
 * This wrapper calls it first and provides the adapter context. App.tsx still
 * has its own vsCodeRef but this is fine during transition - both point to same API.
 */

import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import { AdapterProvider, type IPlatformAdapter } from '@wave-client/core';
import { createVSCodeAdapter } from './adapters/vsCodeAdapter';
import App from './App';

// Declare the VS Code API acquisition function (provided by VS Code webview runtime)
declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
};

// Global singleton for VS Code API - ensures single acquisition
let vsCodeApiInstance: ReturnType<typeof acquireVsCodeApi> | null = null;

function getVSCodeApi() {
    if (!vsCodeApiInstance && typeof acquireVsCodeApi !== 'undefined') {
        vsCodeApiInstance = acquireVsCodeApi();
    }
    return vsCodeApiInstance;
}

// Export for use by App.tsx during transition
export { getVSCodeApi };

// Theme Context
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeContext.Provider');
  }
  return context;
};

/**
 * Wrapper component that provides the adapter context.
 * During the migration period, this coexists with the legacy vsCodeRef pattern in App.tsx.
 */
export const AppWithAdapter: React.FC = () => {
    const [adapter, setAdapter] = useState<IPlatformAdapter | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const cleanupRef = useRef<(() => void) | null>(null);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    };

    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
    }, [theme]);

    useEffect(() => {
        try {
            const vsCodeApi = getVSCodeApi();
            if (vsCodeApi) {
                const { adapter: vscodeAdapter, handleMessage, cleanup } = createVSCodeAdapter(vsCodeApi);
                
                // Listen for messages from the extension
                // Note: App.tsx also adds its own listener - both will receive messages
                window.addEventListener('message', handleMessage);
                cleanupRef.current = () => {
                    window.removeEventListener('message', handleMessage);
                    cleanup();
                };
                
                setAdapter(vscodeAdapter);
            } else {
                setError(new Error('VS Code API not available'));
            }
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }

        return () => {
            cleanupRef.current?.();
        };
    }, []);

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen p-4 bg-slate-900">
                <div className="text-center max-w-md">
                    <div className="text-red-500 text-xl mb-2">⚠️</div>
                    <h2 className="text-lg font-semibold text-red-400 mb-2">
                        Failed to Initialize
                    </h2>
                    <p className="text-sm text-slate-400">
                        {error.message}
                    </p>
                </div>
            </div>
        );
    }

    if (!adapter) {
        return (
            <div className="flex items-center justify-center h-screen bg-slate-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">Loading Wave Client...</p>
                </div>
            </div>
        );
    }

    return (
        <AdapterProvider adapter={adapter}>
            <ThemeContext.Provider value={{ theme, toggleTheme }}>
                    <App />
            </ThemeContext.Provider>
        </AdapterProvider>
    );
};

/**
 * Hook for components migrating from vsCodeRef to adapter pattern.
 * 
 * Usage example for gradual migration:
 * ```tsx
 * // Before (legacy):
 * const vsCodeRef = useRef<any>(null);
 * vsCodeRef.current.postMessage({ type: 'loadCollections' });
 * 
 * // After (with adapter):
 * const { storage } = useAdapter();
 * const result = await storage.loadCollections();
 * if (result.isOk) {
 *   setCollections(result.value);
 * }
 * ```
 */

export default AppWithAdapter;
