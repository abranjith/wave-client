import { StateCreator } from 'zustand';
import { Result, ok, err } from '../../utils/result';
import { Proxy } from '../../types/collection';

// Proxy store interface
interface ProxySlice {
    proxies: Proxy[];
    activeProxy: Proxy | null;
    
    // CRUD operations
    addProxy: (proxy: Proxy) => Result<Proxy, string>;
    removeProxy: (id: string) => Result<void, string>;
    updateProxy: (id: string, updates: Partial<Proxy>) => Result<Proxy, string>;
    setActiveProxy: (proxy: Proxy | null) => void;
    
    // Utility operations
    toggleProxyEnabled: (id: string) => Result<void, string>;
    getProxyById: (id: string) => Proxy | undefined;
    getProxyByName: (name: string) => Proxy | undefined;
    getEnabledProxies: () => Proxy[];
    getProxyForDomain: (domain: string) => Proxy | undefined;
    isProxyNameUnique: (name: string, excludeId?: string) => boolean;
    clearAllProxies: () => void;
    setProxies: (proxies: Proxy[]) => void;
}

const createProxySlice: StateCreator<ProxySlice> = (set, get) => ({
    proxies: [],
    activeProxy: null,

    setProxies: (proxies) => set({ proxies }),
    setActiveProxy: (proxy) => set({ activeProxy: proxy }),

    // Add a new proxy configuration
    addProxy: (proxy) => {
        // Check if name is unique
        const nameExists = get().proxies.some(p => p.name === proxy.name);
        if (nameExists) {
            return err(`Proxy with name "${proxy.name}" already exists`);
        }
        
        // Validate proxy URL
        if (!proxy.url || proxy.url.trim() === '') {
            return err('Proxy URL is required');
        }
        
        set((state) => ({
            proxies: [...state.proxies, proxy]
        }));
        
        return ok(proxy);
    },

    // Remove a proxy by ID
    removeProxy: (id) => {
        const proxy = get().proxies.find(p => p.id === id);
        if (!proxy) {
            return err(`Proxy with id "${id}" not found`);
        }
        
        set((state) => ({
            proxies: state.proxies.filter((proxy) => proxy.id !== id),
            activeProxy: state.activeProxy?.id === id ? null : state.activeProxy
        }));
        
        return ok(undefined);
    },

    // Update an existing proxy
    updateProxy: (id, updates) => {
        const proxy = get().proxies.find(p => p.id === id);
        if (!proxy) {
            return err(`Proxy with id "${id}" not found`);
        }
        
        // If updating name, check uniqueness
        if (updates.name && updates.name !== proxy.name) {
            const nameExists = get().proxies.some(p => p.id !== id && p.name === updates.name);
            if (nameExists) {
                return err(`Proxy with name "${updates.name}" already exists`);
            }
        }
        
        // Validate proxy URL if being updated
        if (updates.url !== undefined && (!updates.url || updates.url.trim() === '')) {
            return err('Proxy URL cannot be empty');
        }
        
        const updatedProxy = { ...proxy, ...updates };
        
        set((state) => ({
            proxies: state.proxies.map((p) =>
                p.id === id ? updatedProxy : p
            ),
            activeProxy: state.activeProxy?.id === id ? updatedProxy : state.activeProxy
        }));
        
        return ok(updatedProxy);
    },

    // Toggle enabled state
    toggleProxyEnabled: (id) => {
        const proxy = get().proxies.find(p => p.id === id);
        if (!proxy) {
            return err(`Proxy with id "${id}" not found`);
        }
        
        const updatedProxy = { ...proxy, enabled: !proxy.enabled };
        
        set((state) => ({
            proxies: state.proxies.map((p) =>
                p.id === id ? updatedProxy : p
            )
        }));
        
        return ok(undefined);
    },

    // Get proxy by ID
    getProxyById: (id) => {
        return get().proxies.find((proxy) => proxy.id === id);
    },

    // Get proxy by name
    getProxyByName: (name) => {
        return get().proxies.find((proxy) => proxy.name === name);
    },

    // Get all enabled proxies
    getEnabledProxies: () => {
        return get().proxies.filter((proxy) => proxy.enabled);
    },

    // Get the appropriate proxy for a specific domain
    getProxyForDomain: (domain) => {
        const enabledProxies = get().proxies.filter((proxy) => proxy.enabled);
        
        for (const proxy of enabledProxies) {
            // Check if domain is in exclude list
            const isExcluded = proxy.excludeDomains.some(excludeDomain => {
                const pattern = excludeDomain.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`, 'i');
                return regex.test(domain);
            });
            
            if (isExcluded) {
                continue;
            }
            
            // If no domain filters, apply to all domains (that aren't excluded)
            if (proxy.domainFilters.length === 0) {
                return proxy;
            }
            
            // Check if domain matches any filter (supports wildcards)
            const isMatch = proxy.domainFilters.some(filter => {
                const pattern = filter.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`, 'i');
                return regex.test(domain);
            });
            
            if (isMatch) {
                return proxy;
            }
        }
        
        return undefined;
    },

    // Check if proxy name is unique
    isProxyNameUnique: (name, excludeId) => {
        return !get().proxies.some(proxy => 
            proxy.name === name && proxy.id !== excludeId
        );
    },

    // Clear all proxies
    clearAllProxies: () => set({ proxies: [], activeProxy: null }),
});

export default createProxySlice;
