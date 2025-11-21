import { StateCreator } from 'zustand';
import { Result, ok, err } from '../../utils/result';

// Base interface with common properties for all auth types
interface BaseAuth {
    id: string; // Cryptographically unique per record
    name: string; // User-friendly name (must be unique)
    enabled: boolean; // Enable/disable flag
    domainFilters: string[]; // Will be sent only for these domains
    expiryDate?: string; // Optional expiry date (ISO string)
    isExpired?: boolean; // Flag to indicate if the auth is expired
    base64Encode: boolean; // Flag to indicate if credentials should be base64 encoded
}

// Auth type enum for type discrimination
export enum AuthType {
    API_KEY = 'apiKey',
    BASIC = 'basic',
    DIGEST = 'digest',
}

// API Key Auth - stores direct key
export interface ApiKeyAuth extends BaseAuth {
    type: AuthType.API_KEY;
    key: string;
    value: string;
    sendIn: 'header' | 'query'; // Flag to indicate where to send (header or query param)
    prefix?: string; // Optional prefix (e.g., "Bearer ", "Token ")
}

// Basic Auth - username and password
export interface BasicAuth extends BaseAuth {
    type: AuthType.BASIC;
    username: string;
    password: string;
}

// Digest Auth - username, password, and digest-specific fields
export interface DigestAuth extends BaseAuth {
    type: AuthType.DIGEST;
    username: string;
    password: string;
    realm?: string;
    nonce?: string;
    algorithm?: 'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess';
    qop?: 'auth' | 'auth-int';
    nc?: string; // Nonce count
    cnonce?: string; // Client nonce
    opaque?: string;
}

// Union type for all auth types - makes it easy to add more types
export type Auth = ApiKeyAuth | BasicAuth | DigestAuth;

// Auth store interface
interface AuthSlice {
    auths: Auth[];
    
    // CRUD operations
    addAuth: (auth: Auth) => Result<Auth, string>;
    removeAuth: (id: string) => Result<void, string>;
    updateAuth: (id: string, updates: Partial<Auth>) => Result<Auth, string>;
    
    // Utility operations
    toggleAuthEnabled: (id: string) => Result<void, string>;
    getAuthById: (id: string) => Auth | undefined;
    getAuthByName: (name: string) => Auth | undefined;
    getEnabledAuths: () => Auth[];
    getAuthsForDomain: (domain: string) => Auth[];
    isAuthNameUnique: (name: string, excludeId?: string) => boolean;
    clearAllAuths: () => void;
    setAuths: (auths: Auth[]) => void;
    removeExpiredAuths: () => void;
    isAuthExpired: (auth: Auth) => boolean;
}

const createAuthSlice: StateCreator<AuthSlice> = (set, get) => ({
    auths: [],

    setAuths: (auths) => set({ auths }),

    // Add a new auth configuration
    addAuth: (auth) => {
        // Check if name is unique
        const nameExists = get().auths.some(a => a.name === auth.name);
        if (nameExists) {
            return err(`Auth with name "${auth.name}" already exists`);
        }
        
        set((state) => ({
            auths: [...state.auths, auth]
        }));
        
        return ok(auth);
    },

    // Remove an auth by ID
    removeAuth: (id) => {
        const auth = get().auths.find(a => a.id === id);
        if (!auth) {
            return err(`Auth with id "${id}" not found`);
        }
        
        set((state) => ({
            auths: state.auths.filter((auth) => auth.id !== id)
        }));
        
        return ok(undefined);
    },

    // Update an existing auth
    updateAuth: (id, updates) => {
        const auth = get().auths.find(a => a.id === id);
        if (!auth) {
            return err(`Auth with id "${id}" not found`);
        }
        
        // If updating name, check uniqueness
        if (updates.name && updates.name !== auth.name) {
            const nameExists = get().auths.some(a => a.id !== id && a.name === updates.name);
            if (nameExists) {
                return err(`Auth with name "${updates.name}" already exists`);
            }
        }
        
        const updatedAuth = { ...auth, ...updates } as Auth;
        
        set((state) => ({
            auths: state.auths.map((a) =>
                a.id === id ? updatedAuth : a
            )
        }));
        
        return ok(updatedAuth);
    },

    // Toggle enabled state
    toggleAuthEnabled: (id) => {
        const auth = get().auths.find(a => a.id === id);
        if (!auth) {
            return err(`Auth with id "${id}" not found`);
        }
        
        const updatedAuth = { ...auth, enabled: !auth.enabled };
        
        set((state) => ({
            auths: state.auths.map((a) =>
                a.id === id ? updatedAuth : a
            )
        }));
        
        return ok(undefined);
    },

    // Get auth by ID
    getAuthById: (id) => {
        return get().auths.find((auth) => auth.id === id);
    },

    // Get auth by name
    getAuthByName: (name) => {
        return get().auths.find((auth) => auth.name === name);
    },

    // Get all enabled auths
    getEnabledAuths: () => {
        return get().auths.filter((auth) => auth.enabled);
    },

    // Get auths for a specific domain
    getAuthsForDomain: (domain) => {
        return get().auths.filter((auth) => {
            if (!auth.enabled) {
                return false;
            }
            
            // If no domain filters, apply to all domains
            if (auth.domainFilters.length === 0) {
                return true;
            }
            
            // Check if domain matches any filter (supports wildcards)
            return auth.domainFilters.some(filter => {
                const pattern = filter.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`, 'i');
                return regex.test(domain);
            });
        });
    },

    // Check if auth name is unique
    isAuthNameUnique: (name, excludeId) => {
        return !get().auths.some(auth => 
            auth.name === name && auth.id !== excludeId
        );
    },

    // Clear all auths
    clearAllAuths: () => set({ auths: [] }),

    // Remove expired auths
    removeExpiredAuths: () => set((state) => ({
        auths: state.auths.filter((auth) => {
            if (!auth.expiryDate) {
                return true;
            }
            const expiryTime = new Date(auth.expiryDate).getTime();
            const now = Date.now();
            return expiryTime > now;
        })
    })),

    // Check if an auth is expired
    isAuthExpired: (auth: Auth) => {
        if (!auth.expiryDate) {
            return false;
        }
        const expiryTime = new Date(auth.expiryDate).getTime();
        const now = Date.now();
        return expiryTime <= now;
    },
});

export default createAuthSlice;
