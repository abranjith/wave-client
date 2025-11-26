import { StateCreator } from 'zustand';

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
    
    // Security settings
    ignoreCertificateValidation: boolean; // Default: false
}

// Default settings
export const DEFAULT_SETTINGS: AppSettings = {
    saveFilesLocation: '', // Will be set to homeDir/.waveclient by extension
    maxRedirects: 5,
    requestTimeoutSeconds: 0,
    maxHistoryItems: 10,
    commonHeaderNames: [],
    encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
    ignoreCertificateValidation: false,
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

    // Get current settings
    getSettings: () => get().settings,
});

export default createSettingsSlice;
