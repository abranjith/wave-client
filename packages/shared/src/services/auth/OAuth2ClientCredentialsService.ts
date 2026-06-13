/**
 * OAuth2 Client Credentials grant service.
 *
 * Obtains an access token from the token endpoint using client credentials
 * (client_id + client_secret) with no user interaction. Suitable for
 * machine-to-machine (M2M) API authentication.
 *
 * Tokens are cached for their reported lifetime (expires_in). When the server
 * omits expires_in, caching is skipped and the token endpoint is called on
 * every request.
 */

import { OAuth2ServiceBase } from './OAuth2ServiceBase';
import type { Auth, AuthResult, AuthRequestConfig, EnvVarsMap, OAuth2ClientCredentialsAuth } from './types';
import { AuthType, authOk, authErr } from './types';

export class OAuth2ClientCredentialsService extends OAuth2ServiceBase {
    getAuthType(): string {
        return AuthType.OAUTH2_CLIENT_CREDENTIALS;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        if (auth.type !== AuthType.OAUTH2_CLIENT_CREDENTIALS) {
            return authErr('Invalid auth type for OAuth2ClientCredentialsService');
        }

        const ccAuth = auth as OAuth2ClientCredentialsAuth;

        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        if (this.hasAuthorizationHeader(config.headers)) {
            return authOk({ headers: {} });
        }

        // Resolve env-var placeholders in all configurable fields
        const tokenUrlResult = this.resolveValue(ccAuth.tokenUrl, envVars);
        const clientIdResult = this.resolveValue(ccAuth.clientId, envVars);
        const clientSecretResult = this.resolveValue(ccAuth.clientSecret, envVars);
        const scopeResult = this.resolveValue(ccAuth.scope, envVars);
        const audienceResult = this.resolveValue(ccAuth.audience, envVars);

        const unresolved = [
            ...tokenUrlResult.unresolved,
            ...clientIdResult.unresolved,
            ...clientSecretResult.unresolved,
            ...scopeResult.unresolved,
            ...audienceResult.unresolved,
        ];
        if (unresolved.length > 0) {
            return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
        }

        try {
            const cached = this.getCachedToken(auth.id);
            if (cached) {
                return authOk({
                    headers: { 'Authorization': `${cached.tokenType} ${cached.accessToken}` },
                });
            }

            const grantParams: Record<string, string> = {
                grant_type: 'client_credentials',
            };
            if (scopeResult.resolved) {
                grantParams.scope = scopeResult.resolved;
            }
            if (audienceResult.resolved) {
                grantParams.audience = audienceResult.resolved;
            }

            const token = await this.fetchToken(
                tokenUrlResult.resolved,
                grantParams,
                ccAuth.clientAuthMethod,
                clientIdResult.resolved,
                clientSecretResult.resolved
            );

            this.cacheToken(auth.id, token);

            return authOk({
                headers: { 'Authorization': `${token.tokenType} ${token.accessToken}` },
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'OAuth2 client credentials token request failed';
            return authErr(message);
        }
    }
}
