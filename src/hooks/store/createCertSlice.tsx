import { StateCreator } from 'zustand';
import { Result, ok, err } from '../../utils/result';
import { Cert, CertType } from '../../types/collection';

// Cert store interface
interface CertSlice {
    certs: Cert[];
    activeCert: Cert | null;
    
    // CRUD operations
    addCert: (cert: Cert) => Result<Cert, string>;
    removeCert: (id: string) => Result<void, string>;
    updateCert: (id: string, updates: Partial<Cert>) => Result<Cert, string>;
    setActiveCert: (cert: Cert | null) => void;
    
    // Utility operations
    toggleCertEnabled: (id: string) => Result<void, string>;
    getCertById: (id: string) => Cert | undefined;
    getCertByName: (name: string) => Cert | undefined;
    getEnabledCerts: () => Cert[];
    getCertsForDomain: (domain: string) => Cert[];
    isCertNameUnique: (name: string, excludeId?: string) => boolean;
    clearAllCerts: () => void;
    setCerts: (certs: Cert[]) => void;
    removeExpiredCerts: () => void;
    isCertExpired: (cert: Cert) => boolean;
}

const createCertSlice: StateCreator<CertSlice> = (set, get) => ({
    certs: [],
    activeCert: null,

    setCerts: (certs) => set({ certs }),
    setActiveCert: (cert) => set({ activeCert: cert }),

    // Add a new cert configuration
    addCert: (cert) => {
        // Check if name is unique
        const nameExists = get().certs.some(c => c.name === cert.name);
        if (nameExists) {
            return err(`Certificate with name "${cert.name}" already exists`);
        }
        
        // Validate cert configuration based on type
        if (cert.type === CertType.CA) {
            if (!cert.certFile) {
                return err('CA certificate requires a cert file');
            }
        } else if (cert.type === CertType.SELF_SIGNED) {
            const hasCertAndKey = cert.certFile && cert.keyFile;
            const hasPfx = cert.pfxFile;
            
            if (!hasCertAndKey && !hasPfx) {
                return err('Self-signed certificate requires either (cert + key files) or a PFX file');
            }
        }
        
        set((state) => ({
            certs: [...state.certs, cert]
        }));
        
        return ok(cert);
    },

    // Remove a cert by ID
    removeCert: (id) => {
        const cert = get().certs.find(c => c.id === id);
        if (!cert) {
            return err(`Certificate with id "${id}" not found`);
        }
        
        set((state) => ({
            certs: state.certs.filter((cert) => cert.id !== id),
            activeCert: state.activeCert?.id === id ? null : state.activeCert
        }));
        
        return ok(undefined);
    },

    // Update an existing cert
    updateCert: (id, updates) => {
        const cert = get().certs.find(c => c.id === id);
        if (!cert) {
            return err(`Certificate with id "${id}" not found`);
        }
        
        // If updating name, check uniqueness
        if (updates.name && updates.name !== cert.name) {
            const nameExists = get().certs.some(c => c.id !== id && c.name === updates.name);
            if (nameExists) {
                return err(`Certificate with name "${updates.name}" already exists`);
            }
        }
        
        const updatedCert = { ...cert, ...updates } as Cert;
        
        // Validate updated cert configuration
        if (updatedCert.type === CertType.CA) {
            if (!updatedCert.certFile) {
                return err('CA certificate requires a cert file');
            }
        } else if (updatedCert.type === CertType.SELF_SIGNED) {
            const hasCertAndKey = updatedCert.certFile && updatedCert.keyFile;
            const hasPfx = updatedCert.pfxFile;
            
            if (!hasCertAndKey && !hasPfx) {
                return err('Self-signed certificate requires either (cert + key files) or a PFX file');
            }
        }
        
        set((state) => ({
            certs: state.certs.map((c) =>
                c.id === id ? updatedCert : c
            ),
            activeCert: state.activeCert?.id === id ? updatedCert : state.activeCert
        }));
        
        return ok(updatedCert);
    },

    // Toggle enabled state
    toggleCertEnabled: (id) => {
        const cert = get().certs.find(c => c.id === id);
        if (!cert) {
            return err(`Certificate with id "${id}" not found`);
        }
        
        const updatedCert = { ...cert, enabled: !cert.enabled };
        
        set((state) => ({
            certs: state.certs.map((c) =>
                c.id === id ? updatedCert : c
            )
        }));
        
        return ok(undefined);
    },

    // Get cert by ID
    getCertById: (id) => {
        return get().certs.find((cert) => cert.id === id);
    },

    // Get cert by name
    getCertByName: (name) => {
        return get().certs.find((cert) => cert.name === name);
    },

    // Get all enabled certs
    getEnabledCerts: () => {
        return get().certs.filter((cert) => cert.enabled);
    },

    // Get certs for a specific domain
    getCertsForDomain: (domain) => {
        return get().certs.filter((cert) => {
            if (!cert.enabled) {
                return false;
            }
            
            // If no domain filters, apply to all domains
            if (cert.domainFilters.length === 0) {
                return true;
            }
            
            // Check if domain matches any filter (supports wildcards)
            return cert.domainFilters.some(filter => {
                const pattern = filter.replace(/\*/g, '.*');
                const regex = new RegExp(`^${pattern}$`, 'i');
                return regex.test(domain);
            });
        });
    },

    // Check if cert name is unique
    isCertNameUnique: (name, excludeId) => {
        return !get().certs.some(cert => 
            cert.name === name && cert.id !== excludeId
        );
    },

    // Clear all certs
    clearAllCerts: () => set({ certs: [], activeCert: null }),

    // Remove expired certs
    removeExpiredCerts: () => set((state) => ({
        certs: state.certs.filter((cert) => {
            if (!cert.expiryDate) {
                return true;
            }
            const expiryTime = new Date(cert.expiryDate).getTime();
            const now = Date.now();
            return expiryTime > now;
        })
    })),

    // Check if a cert is expired
    isCertExpired: (cert: Cert) => {
        if (!cert.expiryDate) {
            return false;
        }
        const expiryTime = new Date(cert.expiryDate).getTime();
        const now = Date.now();
        return expiryTime <= now;
    },
});

export default createCertSlice;
