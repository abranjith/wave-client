/**
 * OAuth2 Refresh Token Authentication Service.
 * Handles OAuth2 token refresh flow with caching.
 */

import { AuthServiceBase } from './AuthServiceBase';
import { Auth, AuthResult, AuthRequestConfig, AuthType, OAuth2RefreshAuth, EnvVarsMap, authOk, authErr } from './types';
import { httpService, SendConfig } from '../HttpService';

/**
 * Cached OAuth2 token data
 */
interface OAuth2TokenCache {
    accessToken: string;
    expiresAt: number;
    tokenType: string;
}

export class OAuth2RefreshService extends AuthServiceBase {
    // Buffer time before expiry to refresh token (1 minute)
    private readonly EXPIRY_BUFFER_MS = 1 * 60 * 1000;

    getAuthType(): string {
        return AuthType.OAUTH2_REFRESH;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        // Validate auth type
        if (auth.type !== AuthType.OAUTH2_REFRESH) {
            return authErr('Invalid auth type for OAuth2RefreshService');
        }

        const oauth2Auth = auth as OAuth2RefreshAuth;

        // Validate auth configuration
        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        // Check if Authorization header already exists
        if (this.hasAuthorizationHeader(config.headers)) {
            return authOk({ headers: {} });
        }

        // Resolve placeholders in auth config
        const tokenUrlResult = this.resolveValue(oauth2Auth.tokenUrl, envVars);
        const clientIdResult = this.resolveValue(oauth2Auth.clientId, envVars);
        const clientSecretResult = this.resolveValue(oauth2Auth.clientSecret, envVars);
        const refreshTokenResult = this.resolveValue(oauth2Auth.refreshToken, envVars);
        const scopeResult = this.resolveValue(oauth2Auth.scope, envVars);

        // Check for unresolved placeholders
        const unresolved = [
            ...tokenUrlResult.unresolved,
            ...clientIdResult.unresolved,
            ...clientSecretResult.unresolved,
            ...refreshTokenResult.unresolved,
            ...scopeResult.unresolved,
        ];

        if (unresolved.length > 0) {
            return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
        }

        try {
            // Check cache for valid token
            const cached = this.getCached<OAuth2TokenCache>(auth.id);
            if (cached && this.isTokenValid(cached)) {
                return authOk({
                    headers: {
                        'Authorization': `${cached.tokenType} ${cached.accessToken}`,
                    },
                });
            }

            // Token is missing or expired, refresh it
            const newToken = await this.refreshAccessToken(
                tokenUrlResult.resolved,
                clientIdResult.resolved,
                clientSecretResult.resolved,
                refreshTokenResult.resolved,
                scopeResult.resolved,
            );

            // Cache the new token
            this.setCache(auth.id, newToken, newToken.expiresAt - Date.now());

            return authOk({
                headers: {
                    'Authorization': `${newToken.tokenType} ${newToken.accessToken}`,
                },
            });
        } catch (error: any) {
            return authErr(error.message || 'OAuth2 token refresh failed');
        }
    }

    /**
     * Check if cached token is still valid.
     */
    private isTokenValid(cached: OAuth2TokenCache): boolean {
        // Consider token invalid if it expires within the buffer time
        return Date.now() < (cached.expiresAt - this.EXPIRY_BUFFER_MS);
    }

    /**
     * Refresh the access token using the refresh token.
     */
    private async refreshAccessToken(
        tokenUrl: string,
        clientId: string,
        clientSecret: string,
        refreshToken: string,
        scope?: string,
    ): Promise<OAuth2TokenCache> {
        // Build token request body
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);
        params.append('client_id', clientId);

        if (clientSecret) {
            params.append('client_secret', clientSecret);
        }

        if (scope) {
            params.append('scope', scope);
        }

        try {
            const sendConfig: SendConfig = {
                method: 'POST',
                url: tokenUrl,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
                responseType: 'json',
            };

            const result = await httpService.send(sendConfig);

            if (result.error) {
                throw new Error(result.error);
            }

            const data = result.response.data as Record<string, unknown>;

            if (!data.access_token) {
                throw new Error('No access_token in token response');
            }

            // Calculate expiry time
            const expiresIn = (data.expires_in as number) || 300; // Default to 5 min if not provided
            const expiresAt = Date.now() + (expiresIn * 1000);

            return {
                accessToken: data.access_token as string,
                expiresAt,
                tokenType: (data.token_type as string) || 'Bearer',
            };
        } catch (error: any) {
            if (error.response) {
                const errorData = error.response.data;
                const errorMessage = errorData?.error_description 
                    || errorData?.error 
                    || `Token refresh failed with status ${error.response.status}`;
                throw new Error(`Error calling token endpoint: ${errorMessage}`);
            }
            throw error;
        }
    }
}
