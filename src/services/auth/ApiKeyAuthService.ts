/**
 * API Key Authentication Service.
 * Handles API key authentication sent via header or query parameter.
 */

import { AuthServiceBase } from './AuthServiceBase';
import { Auth, AuthResult, AuthRequestConfig, AuthType, ApiKeyAuth, EnvVarsMap, authOk, authErr } from './types';

export class ApiKeyAuthService extends AuthServiceBase {
    getAuthType(): string {
        return AuthType.API_KEY;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        // Validate auth type
        if (auth.type !== AuthType.API_KEY) {
            return authErr('Invalid auth type for ApiKeyAuthService');
        }

        const apiKeyAuth = auth as ApiKeyAuth;

        // Validate auth configuration
        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        // Resolve key and value placeholders
        const keyResult = this.resolveValue(apiKeyAuth.key, envVars);
        const valueResult = this.resolveValue(apiKeyAuth.value, envVars);

        // Check for unresolved placeholders
        const unresolved = [...keyResult.unresolved, ...valueResult.unresolved];
        if (unresolved.length > 0) {
            return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
        }

        const key = keyResult.resolved.trim();
        let value = valueResult.resolved;

        // Apply prefix if specified
        if (apiKeyAuth.prefix) {
            value = `${apiKeyAuth.prefix}${value}`;
        }

        // Return based on sendIn setting
        if (apiKeyAuth.sendIn === 'header') {
            // Check if header already exists (case-insensitive)
            const headerExists = Object.keys(config.headers).some(
                k => k.toLowerCase() === key.toLowerCase()
            );

            if (headerExists) {
                // Don't overwrite existing header
                return authOk({ headers: {} });
            }

            return authOk({
                headers: { [key]: value },
            });
        } else {
            // Query parameter
            return authOk({
                queryParams: { [key]: value },
            });
        }
    }
}
