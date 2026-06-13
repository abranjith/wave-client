/**
 * OAuth2 Refresh Token grant service.
 *
 * Uses an existing refresh_token to obtain a new access_token from the
 * token endpoint. The access token is cached for its reported lifetime;
 * when expires_in is absent from the response, no caching is applied and
 * the token endpoint is called on every request.
 */

import { OAuth2ServiceBase } from './OAuth2ServiceBase';
import type { Auth, AuthResult, AuthRequestConfig, EnvVarsMap, OAuth2RefreshAuth } from './types';
import { AuthType, authOk, authErr } from './types';

export class OAuth2RefreshService extends OAuth2ServiceBase {
    getAuthType(): string {
        return AuthType.OAUTH2_REFRESH;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        if (auth.type !== AuthType.OAUTH2_REFRESH) {
            return authErr('Invalid auth type for OAuth2RefreshService');
        }

        const oauth2Auth = auth as OAuth2RefreshAuth;

        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        if (this.hasAuthorizationHeader(config.headers)) {
            return authOk({ headers: {} });
        }

        // Resolve env-var placeholders
        const tokenUrlResult = this.resolveValue(oauth2Auth.tokenUrl, envVars);
        const clientIdResult = this.resolveValue(oauth2Auth.clientId, envVars);
        const clientSecretResult = this.resolveValue(oauth2Auth.clientSecret, envVars);
        const refreshTokenResult = this.resolveValue(oauth2Auth.refreshToken, envVars);
        const scopeResult = this.resolveValue(oauth2Auth.scope, envVars);

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
            // Return a cached token if still valid
            const cached = this.getCachedToken(auth.id);
            if (cached) {
                return authOk({
                    headers: { 'Authorization': `${cached.tokenType} ${cached.accessToken}` },
                });
            }

            const token = await this.fetchToken(
                tokenUrlResult.resolved,
                {
                    grant_type: 'refresh_token',
                    refresh_token: refreshTokenResult.resolved,
                    ...(scopeResult.resolved ? { scope: scopeResult.resolved } : {}),
                },
                oauth2Auth.clientAuthMethod,
                clientIdResult.resolved,
                clientSecretResult.resolved
            );

            this.cacheToken(auth.id, token);

            return authOk({
                headers: { 'Authorization': `${token.tokenType} ${token.accessToken}` },
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'OAuth2 token refresh failed';
            return authErr(message);
        }
    }
}
