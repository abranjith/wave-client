import * as path from 'path';
import * as crypto from 'crypto';

import { BaseStorageService } from './BaseStorageService';
import { isUrlInDomains } from '../utils';
import type { Cookie } from '../types';

/**
 * Service for managing HTTP cookies.
 * Handles cookie storage, retrieval, parsing, and merging.
 */
export class CookieService extends BaseStorageService {
    private readonly storeDir = 'store';
    private readonly cookiesFileName = 'cookies.json';

    /**
     * Gets the cookies file path using current settings.
     */
    private async getCookiesFilePath(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.storeDir, this.cookiesFileName);
    }

    /**
     * Loads all cookies from storage.
     * @returns Array of cookies
     */
    async loadAll(): Promise<Cookie[]> {
        const cookiesFile = await this.getCookiesFilePath();
        return await this.readJsonFileSecure<Cookie[]>(cookiesFile, []);
    }

    /**
     * Saves cookies to storage.
     * @param cookies The cookies to save
     */
    async saveAll(cookies: Cookie[]): Promise<void> {
        const cookiesFile = await this.getCookiesFilePath();
        await this.writeJsonFileSecure(cookiesFile, cookies);
    }

    /**
     * Gets cookies that should be sent for a given URL.
     * Filters by domain, path, expiration, and secure flag.
     * @param cookies The available cookies
     * @param urlStr The URL to get cookies for
     * @returns Cookie header string (e.g., "name1=value1; name2=value2")
     */
    getCookiesForUrl(cookies: Cookie[], urlStr: string): string {
        try {
            const url = new URL(urlStr);
            const now = new Date();

            const validCookies = cookies.filter(cookie => {
                if (!cookie.enabled) {
                    return false;
                }

                // Check expiration
                if (cookie.expires) {
                    const expiresDate = new Date(cookie.expires);
                    if (expiresDate < now) {
                        return false;
                    }
                }

                // Check domain
                if (!isUrlInDomains(urlStr, [cookie.domain])) {
                    return false;
                }

                // Check path
                if (Boolean(cookie.path) && cookie.path !== '/') {
                    if (!url.pathname.startsWith(cookie.path)) {
                        return false;
                    }
                }

                // Check secure flag
                if (cookie.secure && url.protocol !== 'https:') {
                    return false;
                }

                return true;
            });

            return validCookies.map(c => `${c.name}=${c.value}`).join('; ');
        } catch (e) {
            console.error('Error processing cookies for URL:', e);
            return '';
        }
    }

    /**
     * Parses a Set-Cookie header into a Cookie object.
     * @param header The Set-Cookie header value
     * @param defaultDomain The default domain to use if not specified
     * @returns The parsed Cookie or null if invalid
     */
    parseSetCookie(header: string, defaultDomain: string): Cookie | null {
        const parts = header.split(';').map(p => p.trim());
        if (parts.length === 0) {
            return null;
        }

        const [nameValue, ...attributes] = parts;
        const separatorIndex = nameValue.indexOf('=');
        if (separatorIndex === -1) {
            return null;
        }

        const name = nameValue.substring(0, separatorIndex);
        const value = nameValue.substring(separatorIndex + 1);

        const cookie: Cookie = {
            id: crypto.randomUUID(),
            name,
            value,
            domain: defaultDomain,
            path: '/',
            httpOnly: false,
            secure: false,
            enabled: true
        };

        for (const attr of attributes) {
            const lowerAttr = attr.toLowerCase();
            if (lowerAttr.startsWith('domain=')) {
                cookie.domain = attr.substring(7);
            } else if (lowerAttr.startsWith('path=')) {
                cookie.path = attr.substring(5);
            } else if (lowerAttr.startsWith('expires=')) {
                try {
                    const date = new Date(attr.substring(8));
                    if (!isNaN(date.getTime())) {
                        cookie.expires = date.toISOString();
                    }
                } catch { /* ignore invalid dates */ }
            } else if (lowerAttr.startsWith('max-age=')) {
                const maxAge = parseInt(attr.substring(8));
                if (!isNaN(maxAge)) {
                    const date = new Date();
                    date.setSeconds(date.getSeconds() + maxAge);
                    cookie.expires = date.toISOString();
                }
            } else if (lowerAttr === 'secure') {
                cookie.secure = true;
            } else if (lowerAttr === 'httponly') {
                cookie.httpOnly = true;
            } else if (lowerAttr.startsWith('samesite=')) {
                const sameSite = attr.substring(9);
                if (['Strict', 'Lax', 'None'].includes(sameSite)) {
                    cookie.sameSite = sameSite as Cookie['sameSite'];
                }
            }
        }

        return cookie;
    }

    /**
     * Merges new cookies with existing cookies.
     * Updates existing cookies by domain/name and adds new ones.
     * @param existing The existing cookies
     * @param newCookies The new cookies to merge
     * @returns The merged cookie array
     */
    mergeCookies(existing: Cookie[], newCookies: Cookie[]): Cookie[] {
        const result = [...existing];

        for (const newCookie of newCookies) {
            const existingIndex = result.findIndex(
                c => c.domain === newCookie.domain && c.name === newCookie.name
            );

            if (existingIndex !== -1) {
                // Update existing cookie
                result[existingIndex] = { ...result[existingIndex], ...newCookie };
            } else {
                // Add new cookie
                result.push(newCookie);
            }
        }

        return result;
    }
}

// Export singleton instance for convenience
export const cookieService = new CookieService();
