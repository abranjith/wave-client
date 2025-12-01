import { StateCreator } from 'zustand';
import { Result, ok, err } from '../../utils/result';
import {
    AuthType,
    BaseAuth,
    ApiKeyAuth,
    BasicAuth,
    DigestAuth,
    OAuth2RefreshAuth,
    Auth,
} from '../../types/auth';

// Re-export types for backward compatibility
export { AuthType, Auth, ApiKeyAuth, BasicAuth, DigestAuth, OAuth2RefreshAuth };
export type { BaseAuth };

// Auth store interface
interface AuthSlice {
    auths: Auth[];
    activeAuth: Auth | null;
    
    // CRUD operations
    addAuth: (auth: Auth) => Result<Auth, string>;
    removeAuth: (id: string) => Result<void, string>;
    updateAuth: (id: string, updates: Partial<Auth>) => Result<Auth, string>;
    setActiveAuth: (auth: Auth | null) => void;
    
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
    activeAuth: null,

    setAuths: (auths) => set({ auths }),
    setActiveAuth: (auth) => set({ activeAuth: auth }),

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
            auths: state.auths.filter((auth) => auth.id !== id),
            activeAuth: state.activeAuth?.id === id ? null : state.activeAuth
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
            ),
            activeAuth: state.activeAuth?.id === id ? updatedAuth : state.activeAuth
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
