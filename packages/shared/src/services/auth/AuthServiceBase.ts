/**
 * Abstract base class for all authentication services.
 * Provides common functionality like caching, value resolution, and validation.
 */

import * as crypto from 'crypto';
import type { Auth, AuthResult, AuthRequestConfig, CachedAuthData, EnvVarsMap } from './types';
import { resolveParameterizedValue, isUrlInDomains } from '@wave-client/core';

/**
 * Abstract base class for authentication services.
 * Each auth type (Basic, Digest, OAuth2, etc.) extends this class.
 */
export abstract class AuthServiceBase {
    // In-memory cache for tokens, nonces, etc.
    protected cache: Map<string, CachedAuthData> = new Map();

    // Default cache TTL (1 hour)
    protected defaultCacheTTL: number = 3600 * 1000;

    /**
     * Apply authentication to the request.
     * @param config The request configuration
     * @param auth The auth configuration
     * @param envVars Environment variables for placeholder resolution
     * @returns AuthResult with headers/params to add, or full response for internal handling
     */
    abstract applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult>;

    /**
     * Get the auth type this service handles.
     */
    abstract getAuthType(): string;

    /**
     * Whether this auth type handles the full request internally.
     * If true, the auth service will make the HTTP request and return the response.
     * Default is false (just returns headers/params).
     */
    handlesRequestInternally(): boolean {
        return false;
    }

    // ==================== Caching Methods ====================

    /**
     * Get cached data for an auth ID.
     * @param authId The auth configuration ID
     * @returns Cached data or undefined if not found/expired
     */
    protected getCached<T>(authId: string): T | undefined {
        const cached = this.cache.get(authId);
        if (!cached) {
            return undefined;
        }

        // Check if expired
        if (Date.now() > cached.expiresAt) {
            this.cache.delete(authId);
            return undefined;
        }

        return cached.data as T;
    }

    /**
     * Set cached data for an auth ID.
     * @param authId The auth configuration ID
     * @param data The data to cache
     * @param ttlMs Time-to-live in milliseconds (default: 1 hour)
     */
    protected setCache(authId: string, data: unknown, ttlMs?: number): void {
        const ttl = ttlMs ?? this.defaultCacheTTL;
        this.cache.set(authId, {
            data,
            expiresAt: Date.now() + ttl,
        });
    }

    /**
     * Clear cached data for an auth ID or all cached data.
     * @param authId Optional auth ID to clear specific cache
     */
    clearCache(authId?: string): void {
        if (authId) {
            this.cache.delete(authId);
        } else {
            this.cache.clear();
        }
    }

    // ==================== Value Resolution ====================

    /**
     * Resolve placeholders in a value using environment variables.
     * Delegates to the common resolveParameterizedValue utility.
     * @param value The value that may contain placeholders
     * @param envVars Environment variables map (Record<string, string>)
     * @returns Object with resolved value and any unresolved placeholders
     */
    protected resolveValue(
        value: string | undefined,
        envVars: EnvVarsMap
    ): { resolved: string; unresolved: string[] } {
        if (!value) {
            return { resolved: '', unresolved: [] };
        }
        // Convert Record to Map for the common util
        const envVarsMap = new Map(Object.entries(envVars));
        return resolveParameterizedValue(value, envVarsMap);
    }

    /**
     * Resolve multiple values and collect all unresolved placeholders.
     * @param values Array of values to resolve
     * @param envVars Environment variables map
     * @returns Object with resolved values array and all unresolved placeholders
     */
    protected resolveValues(
        values: (string | undefined)[],
        envVars: EnvVarsMap
    ): { resolved: string[]; unresolved: string[] } {
        const allUnresolved: string[] = [];
        const resolved = values.map(v => {
            const result = this.resolveValue(v, envVars);
            allUnresolved.push(...result.unresolved);
            return result.resolved;
        });

        return { resolved, unresolved: allUnresolved };
    }

    // ==================== Validation Methods ====================

    /**
     * Check if an auth configuration is expired.
     * @param auth The auth configuration
     * @returns true if expired
     */
    protected isExpired(auth: Auth): boolean {
        if (!auth.expiryDate) {
            return false;
        }
        const expiryTime = new Date(auth.expiryDate).getTime();
        return Date.now() >= expiryTime;
    }

    /**
     * Check if a URL matches the auth's domain filters.
     * Delegates to the common isUrlInDomains utility.
     * @param auth The auth configuration
     * @param url The request URL
     * @returns true if the URL matches (or no filters defined)
     */
    protected matchesDomain(auth: Auth, url: string): boolean {
        if (!auth.domainFilters || auth.domainFilters.length === 0) {
            return true;
        }
        return isUrlInDomains(url, auth.domainFilters);
    }

    /**
     * Validate auth configuration before applying.
     * @param auth The auth configuration
     * @param url The request URL
     * @returns Error message if validation fails, undefined if valid
     */
    protected validateAuth(auth: Auth, url: string): string | undefined {
        if (!auth.enabled) {
            return 'Auth is disabled';
        }

        if (this.isExpired(auth)) {
            return `Auth "${auth.name}" is expired`;
        }

        if (!this.matchesDomain(auth, url)) {
            return `Auth "${auth.name}" does not match domain`;
        }

        return undefined;
    }

    // ==================== Utility Methods ====================

    /**
     * Check if Authorization header already exists (case-insensitive).
     * @param headers The current headers
     * @returns true if Authorization header exists
     */
    protected hasAuthorizationHeader(headers: Record<string, string | string[]>): boolean {
        return Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
    }

    /**
     * Base64 encode a string.
     * @param value The string to encode
     * @returns Base64 encoded string
     */
    protected base64Encode(value: string): string {
        return Buffer.from(value).toString('base64');
    }

    /**
     * Generate a random string for nonces, etc.
     * @param length The length of the string
     * @returns Random alphanumeric string
     */
    protected generateRandomString(length: number = 16): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const randomBytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            result += chars[randomBytes[i] % chars.length];
        }
        return result;
    }
}
