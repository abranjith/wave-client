import { StateCreator } from 'zustand';
import type { ArenaProviderType, ArenaProviderSettingsMap } from '../../config/arenaConfig';
import { getDefaultProviderSettings } from '../../config/arenaConfig';

// ============================================================================
// Arena Settings (sub-section of AppSettings)
// ============================================================================

/**
 * Arena-specific settings managed through the SettingsWizard.
 * Covers LLM provider config, model selection, and general AI preferences.
 */
export interface ArenaAppSettings {
    /** Default LLM provider */
    defaultProvider: ArenaProviderType;
    /** Default model for the selected provider */
    defaultModel: string;
    /** Enable streaming responses */
    enableStreaming: boolean;
    /** Max sessions to keep */
    maxSessions: number;
    /** Max messages per session */
    maxMessagesPerSession: number;
    /** Per-provider configuration (API keys, URLs, disabled models) */
    providers: ArenaProviderSettingsMap;
}

export const DEFAULT_ARENA_APP_SETTINGS: ArenaAppSettings = {
    defaultProvider: 'gemini',
    defaultModel: 'gemini-2.0-flash',
    enableStreaming: true,
    maxSessions: 5,
    maxMessagesPerSession: 10,
    providers: getDefaultProviderSettings(),
};

// ============================================================================
// App Settings
// ============================================================================

// Settings interface
export interface AppSettings {
    // File storage location
    saveFilesLocation: string; // Default: homeDir/.waveclient
    
    // Request settings
    maxRedirects: number; // Default: 5
    requestTimeoutSeconds: number; // Default: 0 (no timeout)
    
    // History settings
    maxHistoryItems: number; // Default: 10
    
    // Common header names to suggest in requests (comma-separated list)
    commonHeaderNames: string[];
    
    // Encryption key environment variable name
    encryptionKeyEnvVar: string; // Default: WAVECLIENT_SECRET_KEY
    
    // Encryption key validation status
    encryptionKeyValidationStatus: 'none' | 'valid' | 'invalid'; // Default: none
    
    // Security settings
    ignoreCertificateValidation: boolean; // Default: false
    
    // Arena / AI settings
    arena: ArenaAppSettings;
}

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
    saveFilesLocation: '', // Will be set to homeDir/.waveclient by extension
    maxRedirects: 5,
    requestTimeoutSeconds: 0,
    maxHistoryItems: 10,
    commonHeaderNames: [],
    encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
    encryptionKeyValidationStatus: 'none',
    ignoreCertificateValidation: false,
    arena: { ...DEFAULT_ARENA_APP_SETTINGS },
};

// Settings store interface
interface SettingsSlice {
    settings: AppSettings;
    
    // Update operations
    setSettings: (settings: AppSettings) => void;
    updateSettings: (updates: Partial<AppSettings>) => void;
    resetSettings: () => void;
    
    // Individual setting updates
    setSaveFilesLocation: (location: string) => void;
    setMaxRedirects: (count: number) => void;
    setRequestTimeoutSeconds: (seconds: number) => void;
    setMaxHistoryItems: (count: number) => void;
    setCommonHeaderNames: (headerNames: string[]) => void;
    setEncryptionKeyEnvVar: (envVar: string) => void;
    setIgnoreCertificateValidation: (ignore: boolean) => void;
    
    // Arena settings
    updateArenaSettings: (updates: Partial<ArenaAppSettings>) => void;
    updateArenaProviderSettings: (providerId: ArenaProviderType, updates: Partial<ArenaAppSettings['providers'][ArenaProviderType]>) => void;
    
    // Utility operations
    getSettings: () => AppSettings;
}

const createSettingsSlice: StateCreator<SettingsSlice> = (set, get) => ({
    settings: { ...DEFAULT_SETTINGS },

    // Set all settings at once
    setSettings: (settings) => set({ settings }),

    // Partial update of settings
    updateSettings: (updates) => set((state) => ({
        settings: { ...state.settings, ...updates }
    })),

    // Reset to default settings
    resetSettings: () => set({ settings: { ...DEFAULT_SETTINGS } }),

    // Individual setting updates
    setSaveFilesLocation: (location) => set((state) => ({
        settings: { ...state.settings, saveFilesLocation: location }
    })),

    setMaxRedirects: (count) => set((state) => ({
        settings: { ...state.settings, maxRedirects: Math.max(0, count) }
    })),

    setRequestTimeoutSeconds: (seconds) => set((state) => ({
        settings: { ...state.settings, requestTimeoutSeconds: Math.max(0, seconds) }
    })),

    setMaxHistoryItems: (count) => set((state) => ({
        settings: { ...state.settings, maxHistoryItems: Math.max(1, count) }
    })),

    setCommonHeaderNames: (headerNames) => set((state) => ({
        settings: { ...state.settings, commonHeaderNames: headerNames }
    })),

    setEncryptionKeyEnvVar: (envVar) => set((state) => ({
        settings: { ...state.settings, encryptionKeyEnvVar: envVar }
    })),

    setIgnoreCertificateValidation: (ignore) => set((state) => ({
        settings: { ...state.settings, ignoreCertificateValidation: ignore }
    })),

    // Arena settings — deep-merge into settings.arena
    updateArenaSettings: (updates) => set((state) => ({
        settings: {
            ...state.settings,
            arena: { ...state.settings.arena, ...updates },
        },
    })),

    updateArenaProviderSettings: (providerId, updates) => set((state) => ({
        settings: {
            ...state.settings,
            arena: {
                ...state.settings.arena,
                providers: {
                    ...state.settings.arena.providers,
                    [providerId]: {
                        ...state.settings.arena.providers[providerId],
                        ...updates,
                    },
                },
            },
        },
    })),

    // Get current settings
    getSettings: () => get().settings,
});

export default createSettingsSlice;
