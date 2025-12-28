/**
 * Basic Authentication Service.
 * Handles HTTP Basic authentication with Base64 encoding.
 */

import { AuthServiceBase } from './AuthServiceBase';
import { Auth, AuthResult, AuthRequestConfig, AuthType, BasicAuth, EnvVarsMap, authOk, authErr } from './types';

export class BasicAuthService extends AuthServiceBase {
    getAuthType(): string {
        return AuthType.BASIC;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        // Validate auth type
        if (auth.type !== AuthType.BASIC) {
            return authErr('Invalid auth type for BasicAuthService');
        }

        const basicAuth = auth as BasicAuth;

        // Validate auth configuration
        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        // Check if Authorization header already exists
        if (this.hasAuthorizationHeader(config.headers)) {
            return authOk({ headers: {} });
        }

        // Resolve username and password placeholders
        const usernameResult = this.resolveValue(basicAuth.username, envVars);
        const passwordResult = this.resolveValue(basicAuth.password, envVars);

        // Check for unresolved placeholders
        const unresolved = [...usernameResult.unresolved, ...passwordResult.unresolved];
        if (unresolved.length > 0) {
            return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
        }

        const username = usernameResult.resolved;
        const password = passwordResult.resolved;

        // Create Basic auth header value
        const credentials = `${username}:${password}`;
        const encodedCredentials = this.base64Encode(credentials);
        const authHeaderValue = `Basic ${encodedCredentials}`;

        return authOk({
            headers: { 'Authorization': authHeaderValue },
        });
    }
}
