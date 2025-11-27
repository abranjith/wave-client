import * as path from 'path';
import https from 'https';
import { BaseStorageService } from './BaseStorageService';
import { Proxy, Cert, CertType } from '../types/collection';
import { isUrlInDomains } from '../utils/common';

/**
 * Authentication entry for storing auth configurations.
 */
export interface AuthEntry {
    id: string;
    name: string;
    type: string;
    [key: string]: any;
}

/**
 * Axios proxy configuration interface
 */
export interface AxiosProxyConfig {
    protocol?: string;
    host: string;
    port: number;
    auth?: {
        username: string;
        password: string;
    };
}

/**
 * Service for managing store items (auth configs, proxies, certificates).
 * Handles loading, saving, and matching of these configurations.
 */
export class StoreService extends BaseStorageService {
    private readonly storeDir = 'store';
    private readonly authFileName = 'auth.json';
    private readonly proxiesFileName = 'proxies.json';
    private readonly certsFileName = 'certs.json';

    /**
     * Gets the store directory path using current settings.
     */
    private async getStoreDirectory(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.storeDir);
    }

    // ==================== Auth Methods ====================

    /**
     * Loads all auth configurations from storage.
     * @returns Array of auth entries
     */
    async loadAuths(): Promise<AuthEntry[]> {
        const storeDir = await this.getStoreDirectory();
        const authsFile = path.join(storeDir, this.authFileName);
        return this.readJsonFile<AuthEntry[]>(authsFile, []);
    }

    /**
     * Saves auth configurations to storage.
     * @param auths The auth entries to save
     */
    async saveAuths(auths: AuthEntry[]): Promise<void> {
        const storeDir = await this.getStoreDirectory();
        const authsFile = path.join(storeDir, this.authFileName);
        this.writeJsonFile(authsFile, auths);
    }

    // ==================== Proxy Methods ====================

    /**
     * Loads all proxy configurations from storage.
     * @returns Array of proxy configurations
     */
    async loadProxies(): Promise<Proxy[]> {
        const storeDir = await this.getStoreDirectory();
        const proxiesFile = path.join(storeDir, this.proxiesFileName);
        return this.readJsonFile<Proxy[]>(proxiesFile, []);
    }

    /**
     * Saves proxy configurations to storage.
     * @param proxies The proxy configurations to save
     */
    async saveProxies(proxies: Proxy[]): Promise<void> {
        const storeDir = await this.getStoreDirectory();
        const proxiesFile = path.join(storeDir, this.proxiesFileName);
        this.writeJsonFile(proxiesFile, proxies);
    }

    /**
     * Gets the appropriate proxy configuration for a given URL.
     * Accounts for enabled status, domain filters, and exclude filters.
     * @param urlStr The URL to get a proxy for
     * @returns Axios-compatible proxy config or null if no matching proxy
     */
    async getProxyForUrl(urlStr: string): Promise<AxiosProxyConfig | null> {
        try {
            const proxies = await this.loadProxies();
            const enabledProxies = proxies.filter(proxy => proxy.enabled);

            for (const proxy of enabledProxies) {
                // Check if URL is in exclude list - if so, skip this proxy
                if (proxy.excludeDomains && proxy.excludeDomains.length > 0) {
                    if (isUrlInDomains(urlStr, proxy.excludeDomains)) {
                        continue;
                    }
                }

                // Check if URL matches domain filters
                // If domainFilters is empty, proxy applies to all domains (unless excluded)
                if (!proxy.domainFilters || proxy.domainFilters.length === 0) {
                    return this.parseProxyConfig(proxy);
                }

                // Check if URL is in the domain filters
                if (isUrlInDomains(urlStr, proxy.domainFilters)) {
                    return this.parseProxyConfig(proxy);
                }
            }

            return null;
        } catch (error: any) {
            console.error('Error getting proxy for URL:', error);
            return null;
        }
    }

    /**
     * Parses a proxy configuration into Axios-compatible format.
     * @param proxy The proxy configuration
     * @returns Axios proxy config or null if invalid
     */
    private parseProxyConfig(proxy: Proxy): AxiosProxyConfig | null {
        try {
            const proxyUrl = new URL(proxy.url);

            const config: AxiosProxyConfig = {
                protocol: proxyUrl.protocol.replace(':', ''),
                host: proxyUrl.hostname,
                port: parseInt(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80)
            };

            if (proxy.userName && proxy.password) {
                config.auth = {
                    username: proxy.userName,
                    password: proxy.password
                };
            }

            return config;
        } catch (error: any) {
            console.error('Error parsing proxy config:', error);
            return null;
        }
    }

    // ==================== Certificate Methods ====================

    /**
     * Loads all certificate configurations from storage.
     * @returns Array of certificate configurations
     */
    async loadCerts(): Promise<Cert[]> {
        const storeDir = await this.getStoreDirectory();
        const certsFile = path.join(storeDir, this.certsFileName);
        return this.readJsonFile<Cert[]>(certsFile, []);
    }

    /**
     * Saves certificate configurations to storage.
     * @param certs The certificate configurations to save
     */
    async saveCerts(certs: Cert[]): Promise<void> {
        const storeDir = await this.getStoreDirectory();
        const certsFile = path.join(storeDir, this.certsFileName);
        this.writeJsonFile(certsFile, certs);
    }

    /**
     * Gets an HTTPS agent configured with the appropriate certificate for a URL.
     * @param urlStr The URL to get an HTTPS agent for
     * @returns Configured HTTPS agent or null if no matching cert or not HTTPS
     */
    async getHttpsAgentForUrl(urlStr: string): Promise<https.Agent | null> {
        try {
            const url = new URL(urlStr);
            if (url.protocol !== 'https:') {
                return null; // Only HTTPS URLs need certs
            }

            const certs = await this.loadCerts();
            
            for (const cert of certs) {
                if (!cert.enabled) {
                    continue;
                }

                if (!isUrlInDomains(urlStr, cert.domainFilters)) {
                    continue;
                }

                // Check for expiration
                if (cert.expiryDate) {
                    const expiresDate = new Date(cert.expiryDate);
                    const now = new Date();
                    if (expiresDate < now) {
                        continue; // Skip expired certs
                    }
                }

                if (cert.type === CertType.CA) {
                    // CA type certs only set the 'ca' field
                    return new https.Agent({
                        ca: cert.certFile,
                        passphrase: cert.passPhrase,
                    });
                }

                // Self-signed cert
                return new https.Agent({
                    cert: cert.certFile,
                    key: cert.keyFile,
                    pfx: cert.pfxFile,
                    passphrase: cert.passPhrase,
                });
            }

            return null;
        } catch (error: any) {
            console.error('Error getting HTTPS agent for URL:', error);
            return null;
        }
    }
}

// Export singleton instance for convenience
export const storeService = new StoreService();
