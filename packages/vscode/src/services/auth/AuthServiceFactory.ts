/**
 * Auth Service Factory.
 * Creates and manages singleton instances of auth services based on auth type.
 */

import { AuthServiceBase } from './AuthServiceBase';
import { ApiKeyAuthService } from './ApiKeyAuthService';
import { BasicAuthService } from './BasicAuthService';
import { DigestAuthService } from './DigestAuthService';
import { OAuth2RefreshService } from './OAuth2RefreshService';
import { AuthType } from './types';

/**
 * Factory class for creating and managing auth service instances.
 * Uses singleton pattern for each auth type.
 */
class AuthServiceFactoryClass {
    private services: Map<AuthType, AuthServiceBase> = new Map();

    /**
     * Get the auth service for the specified auth type.
     * Creates the service if it doesn't exist.
     * @param authType The type of authentication
     * @returns The auth service instance or null if type is unknown
     */
    getService(authType: AuthType): AuthServiceBase | null {
        // Check if service already exists
        let service = this.services.get(authType);
        if (service) {
            return service;
        }

        // Create new service based on type
        switch (authType) {
            case AuthType.API_KEY:
                service = new ApiKeyAuthService();
                break;
            case AuthType.BASIC:
                service = new BasicAuthService();
                break;
            case AuthType.DIGEST:
                service = new DigestAuthService();
                break;
            case AuthType.OAUTH2_REFRESH:
                service = new OAuth2RefreshService();
                break;
            default:
                return null;
        }

        // Cache and return
        this.services.set(authType, service);
        return service;
    }

    /**
     * Check if an auth type handles requests internally.
     * @param authType The type of authentication
     * @returns true if the auth type handles requests internally
     */
    handlesRequestInternally(authType: AuthType): boolean {
        const service = this.getService(authType);
        return service?.handlesRequestInternally() ?? false;
    }

    /**
     * Clear all cached auth data.
     * @param authId Optional auth ID to clear specific cache
     */
    clearAllCaches(authId?: string): void {
        this.services.forEach(service => {
            service.clearCache(authId);
        });
    }

    /**
     * Clear cache for a specific auth type.
     * @param authType The type of authentication
     * @param authId Optional auth ID to clear specific cache
     */
    clearCache(authType: AuthType, authId?: string): void {
        const service = this.services.get(authType);
        if (service) {
            service.clearCache(authId);
        }
    }
}

// Export singleton instance
export const AuthServiceFactory = new AuthServiceFactoryClass();
