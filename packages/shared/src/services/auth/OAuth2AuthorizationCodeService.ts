/**
 * OAuth2 Authorization Code grant service (request-time token application).
 *
 * This service handles the *apply* side of the Authorization Code flow:
 *  1. Use the stored access token if it is still valid.
 *  2. If the token is expired but a refresh_token is present, refresh transparently.
 *  3. If no usable token exists (and no refresh token), return authErr so the caller
 *     knows the user must re-authorize via the AuthWizard interactive flow.
 *
 * Token acquisition (PKCE + manual code/URL paste) is handled interactively inside
 * AuthWizard and is NOT part of this service.
 *
 * Note: refreshed tokens are kept in the in-memory cache for the session lifetime.
 * Cross-session persistence of refreshed tokens is tracked in TODO.md.
 */

import { OAuth2ServiceBase } from './OAuth2ServiceBase';
import type { Auth, AuthResult, AuthRequestConfig, EnvVarsMap, OAuth2AuthorizationCodeAuth } from './types';
import { AuthType, authOk, authErr } from './types';

const EXPIRY_BUFFER_MS = 60_000;

export class OAuth2AuthorizationCodeService extends OAuth2ServiceBase {
    getAuthType(): string {
        return AuthType.OAUTH2_AUTHORIZATION_CODE;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        if (auth.type !== AuthType.OAUTH2_AUTHORIZATION_CODE) {
            return authErr('Invalid auth type for OAuth2AuthorizationCodeService');
        }

        const acAuth = auth as OAuth2AuthorizationCodeAuth;

        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        if (this.hasAuthorizationHeader(config.headers)) {
            return authOk({ headers: {} });
        }

        // --- 1. Use in-memory cached token (from a previous refresh in this session) ---
        const inMemory = this.getCachedToken(auth.id);
        if (inMemory) {
            return authOk({
                headers: { 'Authorization': `${inMemory.tokenType} ${inMemory.accessToken}` },
            });
        }

        // --- 2. Use stored access token if not expired ---
        if (acAuth.accessToken) {
            const isExpired =
                acAuth.tokenExpiresAt !== undefined &&
                Date.now() >= acAuth.tokenExpiresAt - EXPIRY_BUFFER_MS;

            if (!isExpired) {
                const tokenType = acAuth.tokenType ?? 'Bearer';
                return authOk({
                    headers: { 'Authorization': `${tokenType} ${acAuth.accessToken}` },
                });
            }
        }

        // --- 3. Refresh via refresh_token if available ---
        if (acAuth.refreshToken) {
            const tokenUrlResult = this.resolveValue(acAuth.tokenUrl, envVars);
            const clientIdResult = this.resolveValue(acAuth.clientId, envVars);
            const clientSecretResult = this.resolveValue(acAuth.clientSecret, envVars);
            const scopeResult = this.resolveValue(acAuth.scope, envVars);

            const unresolved = [
                ...tokenUrlResult.unresolved,
                ...clientIdResult.unresolved,
                ...clientSecretResult.unresolved,
                ...scopeResult.unresolved,
            ];
            if (unresolved.length > 0) {
                return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
            }

            try {
                const token = await this.refreshAccessToken(
                    tokenUrlResult.resolved,
                    acAuth.refreshToken,
                    acAuth.clientAuthMethod,
                    clientIdResult.resolved,
                    clientSecretResult.resolved,
                    scopeResult.resolved || undefined
                );

                this.cacheToken(auth.id, token);

                return authOk({
                    headers: { 'Authorization': `${token.tokenType} ${token.accessToken}` },
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Token refresh failed';
                return authErr(message);
            }
        }

        // --- 4. No usable token — user must re-authorize ---
        return authErr(
            `No access token available for auth "${acAuth.name}" — re-authorize via the Auth Store wizard.`
        );
    }
}
