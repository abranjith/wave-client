/**
 * Digest Authentication Service.
 * Implements RFC 2617 HTTP Digest Authentication.
 * Handles the full 401 challenge-response flow internally.
 */

import * as crypto from 'crypto';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as https from 'https';
import { AuthServiceBase } from './AuthServiceBase';
import { Auth, AuthResult, AuthRequestConfig, AuthType, DigestAuth, EnvVarsMap } from './types';
import { getGlobalSettings } from '../BaseStorageService';
import { storeService } from '../StoreService';

/**
 * Parsed WWW-Authenticate header for Digest auth
 */
interface DigestChallenge {
    realm: string;
    nonce: string;
    qop?: string;
    opaque?: string;
    algorithm?: string;
    stale?: boolean;
}

/**
 * Cached digest auth data
 */
interface DigestCacheData {
    realm: string;
    nonce: string;
    nc: number; // Nonce count
    opaque?: string;
    algorithm?: string;
    qop?: string;
}

export class DigestAuthService extends AuthServiceBase {
    getAuthType(): string {
        return AuthType.DIGEST;
    }

    /**
     * Digest auth handles the full request internally.
     */
    handlesRequestInternally(): boolean {
        return true;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        // Validate auth type
        if (auth.type !== AuthType.DIGEST) {
            return { error: 'Invalid auth type for DigestAuthService' };
        }

        const digestAuth = auth as DigestAuth;

        // Validate auth configuration
        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return { error: validationError };
        }

        // Resolve username and password placeholders
        const usernameResult = this.resolveValue(digestAuth.username, envVars);
        const passwordResult = this.resolveValue(digestAuth.password, envVars);

        // Check for unresolved placeholders
        const unresolved = [...usernameResult.unresolved, ...passwordResult.unresolved];
        if (unresolved.length > 0) {
            return { error: `Unresolved placeholders: ${unresolved.join(', ')}` };
        }

        const username = usernameResult.resolved;
        const password = passwordResult.resolved;

        try {
            // Check cache for existing nonce
            let cached = this.getCached<DigestCacheData>(auth.id);

            // Get common axios config
            const axiosConfig = await this.buildAxiosConfig(config);

            if (cached) {
                // Try with cached nonce first
                const authHeader = this.buildAuthorizationHeader(
                    config.method,
                    config.url,
                    username,
                    password,
                    cached
                );

                axiosConfig.headers = {
                    ...axiosConfig.headers,
                    'Authorization': authHeader,
                };

                try {
                    const response = await axios(axiosConfig);
                    return {
                        handledInternally: true,
                        response: this.formatResponse(response),
                    };
                } catch (error: any) {
                    // If 401 with stale=true, refresh nonce
                    if (error.response?.status === 401) {
                        const wwwAuth = error.response.headers['www-authenticate'];
                        if (wwwAuth) {
                            const challenge = this.parseWwwAuthenticate(wwwAuth);
                            if (challenge?.stale) {
                                // Update cache with new nonce, reset nc
                                cached = {
                                    ...cached,
                                    nonce: challenge.nonce,
                                    nc: 0,
                                };
                                this.setCache(auth.id, cached);
                                // Retry with new nonce
                                return this.retryWithChallenge(
                                    config,
                                    axiosConfig,
                                    username,
                                    password,
                                    challenge,
                                    auth.id
                                );
                            }
                        }
                    }
                    // Not a stale nonce issue, clear cache and do full flow
                    this.clearCache(auth.id);
                }
            }

            // No cache or cache failed - do full 401 challenge flow
            // Make initial request without auth to get 401
            try {
                const initialResponse = await axios(axiosConfig);
                // If we got a success without auth, return it
                return {
                    handledInternally: true,
                    response: this.formatResponse(initialResponse),
                };
            } catch (error: any) {
                if (error.response?.status !== 401) {
                    // Not a 401, return the error
                    return {
                        handledInternally: true,
                        response: this.formatErrorResponse(error),
                    };
                }

                // Parse WWW-Authenticate header
                const wwwAuth = error.response.headers['www-authenticate'];
                if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest')) {
                    return {
                        handledInternally: true,
                        response: this.formatErrorResponse(error),
                    };
                }

                const challenge = this.parseWwwAuthenticate(wwwAuth);
                if (!challenge) {
                    return { error: 'Failed to parse Digest challenge' };
                }

                return this.retryWithChallenge(
                    config,
                    axiosConfig,
                    username,
                    password,
                    challenge,
                    auth.id
                );
            }
        } catch (error: any) {
            return { error: error.message || 'Digest auth failed' };
        }
    }

    /**
     * Retry the request with the digest challenge.
     */
    private async retryWithChallenge(
        config: AuthRequestConfig,
        axiosConfig: AxiosRequestConfig,
        username: string,
        password: string,
        challenge: DigestChallenge,
        authId: string
    ): Promise<AuthResult> {
        // Create cache entry
        const cacheData: DigestCacheData = {
            realm: challenge.realm,
            nonce: challenge.nonce,
            nc: 1,
            opaque: challenge.opaque,
            algorithm: challenge.algorithm,
            qop: challenge.qop,
        };

        // Build authorization header
        const authHeader = this.buildAuthorizationHeader(
            config.method,
            config.url,
            username,
            password,
            cacheData
        );

        // Update cache
        this.setCache(authId, cacheData);

        // Make authenticated request
        axiosConfig.headers = {
            ...axiosConfig.headers,
            'Authorization': authHeader,
        };

        try {
            const response = await axios(axiosConfig);
            return {
                handledInternally: true,
                response: this.formatResponse(response),
            };
        } catch (error: any) {
            return {
                handledInternally: true,
                response: this.formatErrorResponse(error),
            };
        }
    }

    /**
     * Build the axios request configuration.
     */
    private async buildAxiosConfig(config: AuthRequestConfig): Promise<AxiosRequestConfig> {
        const settings = await getGlobalSettings();

        // Get proxy and HTTPS agent
        const proxy = await storeService.getProxyForUrl(config.url);
        let httpsAgent: https.Agent | undefined;

        const customAgent = await storeService.getHttpsAgentForUrl(config.url);
        if (settings.ignoreCertificateValidation) {
            if (customAgent) {
                httpsAgent = new https.Agent({
                    ...customAgent.options,
                    rejectUnauthorized: false,
                });
            } else {
                httpsAgent = new https.Agent({ rejectUnauthorized: false });
            }
        } else {
            httpsAgent = customAgent || undefined;
        }

        const timeout = settings.requestTimeoutSeconds > 0
            ? settings.requestTimeoutSeconds * 1000
            : 0;

        // Build URL with params
        let fullUrl = config.url;
        if (config.params) {
            const separator = config.url.includes('?') ? '&' : '?';
            fullUrl = `${config.url}${separator}${config.params}`;
        }

        return {
            method: config.method as any,
            url: fullUrl,
            headers: config.headers as Record<string, string>,
            data: config.body,
            responseType: 'arraybuffer',
            proxy: proxy || undefined,
            httpsAgent,
            maxRedirects: settings.maxRedirects,
            timeout,
            validateStatus: () => true, // Don't throw on any status
        };
    }

    /**
     * Parse WWW-Authenticate header for Digest parameters.
     */
    private parseWwwAuthenticate(header: string): DigestChallenge | null {
        if (!header.toLowerCase().startsWith('digest')) {
            return null;
        }

        const params: Record<string, string> = {};
        
        // Remove "Digest " prefix
        const content = header.substring(7);
        
        // Parse key=value pairs (handles quoted values)
        const regex = /(\w+)=(?:"([^"]+)"|([^\s,]+))/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            const key = match[1].toLowerCase();
            const value = match[2] || match[3];
            params[key] = value;
        }

        if (!params.realm || !params.nonce) {
            return null;
        }

        return {
            realm: params.realm,
            nonce: params.nonce,
            qop: params.qop,
            opaque: params.opaque,
            algorithm: params.algorithm,
            stale: params.stale?.toLowerCase() === 'true',
        };
    }

    /**
     * Build the Authorization header for Digest auth.
     */
    private buildAuthorizationHeader(
        method: string,
        url: string,
        username: string,
        password: string,
        cacheData: DigestCacheData
    ): string {
        const uri = new URL(url).pathname + new URL(url).search;
        const cnonce = this.generateRandomString(16);
        const nc = cacheData.nc.toString(16).padStart(8, '0');
        const algorithm = cacheData.algorithm?.toUpperCase() || 'MD5';

        // Determine hash function
        const hashFn = algorithm.startsWith('SHA-256') ? 'sha256' : 'md5';

        // Calculate HA1
        let ha1 = this.hash(`${username}:${cacheData.realm}:${password}`, hashFn);
        if (algorithm === 'MD5-sess' || algorithm === 'SHA-256-sess') {
            ha1 = this.hash(`${ha1}:${cacheData.nonce}:${cnonce}`, hashFn);
        }

        // Calculate HA2
        const ha2 = this.hash(`${method.toUpperCase()}:${uri}`, hashFn);

        // Calculate response
        let response: string;
        if (cacheData.qop) {
            response = this.hash(
                `${ha1}:${cacheData.nonce}:${nc}:${cnonce}:${cacheData.qop}:${ha2}`,
                hashFn
            );
        } else {
            response = this.hash(`${ha1}:${cacheData.nonce}:${ha2}`, hashFn);
        }

        // Build header
        let header = `Digest username="${username}", realm="${cacheData.realm}", nonce="${cacheData.nonce}", uri="${uri}", response="${response}"`;

        if (cacheData.algorithm) {
            header += `, algorithm=${cacheData.algorithm}`;
        }

        if (cacheData.qop) {
            header += `, qop=${cacheData.qop}, nc=${nc}, cnonce="${cnonce}"`;
        }

        if (cacheData.opaque) {
            header += `, opaque="${cacheData.opaque}"`;
        }

        // Increment nonce count for next request
        cacheData.nc++;

        return header;
    }

    /**
     * Hash a string with the specified algorithm.
     */
    private hash(value: string, algorithm: 'md5' | 'sha256'): string {
        return crypto.createHash(algorithm).update(value).digest('hex');
    }

    /**
     * Format a successful response.
     */
    private formatResponse(response: AxiosResponse): any {
        return {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: response.data,
        };
    }

    /**
     * Format an error response.
     */
    private formatErrorResponse(error: any): any {
        if (error.response) {
            return {
                status: error.response.status,
                statusText: error.response.statusText,
                headers: error.response.headers,
                data: error.response.data,
            };
        }
        return {
            status: 0,
            statusText: error.message || 'Error',
            headers: {},
            data: Buffer.from(error.message || 'Unknown error'),
        };
    }
}
