/**
 * Digest Authentication Service.
 * Implements RFC 2617 HTTP Digest Authentication.
 * Handles the full 401 challenge-response flow internally.
 */

import * as crypto from 'crypto';
import { AuthServiceBase } from './AuthServiceBase';
import { Auth, AuthResult, AuthRequestConfig, AuthType, DigestAuth, EnvVarsMap, authOk, authErr } from './types';
import { httpService, SendConfig } from '../HttpService';

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
            return authErr('Invalid auth type for DigestAuthService');
        }

        const digestAuth = auth as DigestAuth;

        // Validate auth configuration
        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        // Resolve username and password placeholders
        const usernameResult = this.resolveValue(digestAuth.username, envVars);
        const passwordResult = this.resolveValue(digestAuth.password, envVars);

        // Check for unresolved placeholders
        const unresolved = [...usernameResult.unresolved, ...passwordResult.unresolved];
        if (unresolved.length > 0) {
            return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
        }

        const username = usernameResult.resolved;
        const password = passwordResult.resolved;

        try {
            // Check cache for existing nonce
            let cached = this.getCached<DigestCacheData>(auth.id);

            // Build send config
            const sendConfig = this.buildSendConfig(config);

            if (cached) {
                // Try with cached nonce first
                const authHeader = this.buildAuthorizationHeader(
                    config.method,
                    config.url,
                    username,
                    password,
                    cached
                );

                const authenticatedConfig: SendConfig = {
                    ...sendConfig,
                    headers: {
                        ...sendConfig.headers,
                        'Authorization': authHeader,
                    },
                    validateStatus: true,
                };

                const result = await httpService.send(authenticatedConfig);

                // If 401 with stale=true, refresh nonce
                if (result.response.status === 401) {
                    const wwwAuth = result.response.headers['www-authenticate'];
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
                                sendConfig,
                                username,
                                password,
                                challenge,
                                auth.id
                            );
                        }
                    }
                    // Not a stale nonce issue, clear cache and do full flow
                    this.clearCache(auth.id);
                } else {
                    // Success or other status
                    return authOk({
                        handledInternally: true,
                        response: result.response,
                    });
                }
            }

            // No cache or cache failed - do full 401 challenge flow
            // Make initial request without auth to get 401
            const initialConfig: SendConfig = {
                ...sendConfig,
                validateStatus: true,
            };

            const initialResult = await httpService.send(initialConfig);

            // If we got a success without auth, return it
            if (initialResult.response.status !== 401) {
                return authOk({
                    handledInternally: true,
                    response: initialResult.response,
                });
            }

            // Parse WWW-Authenticate header
            const wwwAuth = initialResult.response.headers['www-authenticate'];
            if (!wwwAuth || !wwwAuth.toLowerCase().startsWith('digest')) {
                return authOk({
                    handledInternally: true,
                    response: initialResult.response,
                });
            }

            const challenge = this.parseWwwAuthenticate(wwwAuth);
            if (!challenge) {
                return authErr('Failed to parse Digest challenge');
            }

            return this.retryWithChallenge(
                config,
                sendConfig,
                username,
                password,
                challenge,
                auth.id
            );
        } catch (error: any) {
            return authErr(error.message || 'Digest auth failed');
        }
    }

    /**
     * Build send config from auth request config.
     */
    private buildSendConfig(config: AuthRequestConfig): SendConfig {
        return {
            method: config.method,
            url: config.url,
            headers: config.headers as Record<string, string>,
            params: config.params,
            body: config.body,
        };
    }

    /**
     * Retry the request with the digest challenge.
     */
    private async retryWithChallenge(
        config: AuthRequestConfig,
        sendConfig: SendConfig,
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
        const authenticatedConfig: SendConfig = {
            ...sendConfig,
            headers: {
                ...sendConfig.headers,
                'Authorization': authHeader,
            },
            validateStatus: true,
        };

        const result = await httpService.send(authenticatedConfig);

        return authOk({
            handledInternally: true,
            response: result.response,
        });
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
}
