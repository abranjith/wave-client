/**
 * HMAC Authentication Service.
 *
 * Signs a user-defined template string with a secret key using Node.js crypto.
 * The computed signature is placed in a request header or query parameter.
 *
 * Supported template placeholders (resolved at request time, after env-var
 * substitution):
 *   {method}    — HTTP method (upper-case)
 *   {url}       — full request URL
 *   {path}      — URL pathname
 *   {query}     — raw query string without a leading "?"
 *   {host}      — URL host (hostname + optional port)
 *   {body}      — raw request body cast to string
 *   {timestamp} — Unix seconds as a decimal string
 *   {nonce}     — 16-byte random hex string
 *
 * A timestamp and/or nonce generated for the signature are also emitted to
 * dedicated headers when `timestampHeader`/`nonceHeader` are configured, so
 * the server can reproduce the string-to-sign.
 */

import * as crypto from 'crypto';
import { AuthServiceBase } from './AuthServiceBase';
import type { Auth, AuthResult, AuthRequestConfig, EnvVarsMap, HmacAuth } from './types';
import { AuthType, authOk, authErr } from './types';

export class HmacAuthService extends AuthServiceBase {
    getAuthType(): string {
        return AuthType.HMAC;
    }

    async applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult> {
        if (auth.type !== AuthType.HMAC) {
            return authErr('Invalid auth type for HmacAuthService');
        }

        const hmacAuth = auth as HmacAuth;

        const validationError = this.validateAuth(auth, config.url);
        if (validationError) {
            return authErr(validationError);
        }

        // Resolve env-var placeholders in all user-configurable string fields
        const secretKeyResult = this.resolveValue(hmacAuth.secretKey, envVars);
        const templateResult = this.resolveValue(hmacAuth.signatureTemplate, envVars);
        const targetNameResult = this.resolveValue(hmacAuth.targetName, envVars);
        const prefixResult = this.resolveValue(hmacAuth.prefix, envVars);
        const keyIdResult = this.resolveValue(hmacAuth.keyId, envVars);

        const unresolved = [
            ...secretKeyResult.unresolved,
            ...templateResult.unresolved,
            ...targetNameResult.unresolved,
            ...prefixResult.unresolved,
            ...keyIdResult.unresolved,
        ];
        if (unresolved.length > 0) {
            return authErr(`Unresolved placeholders: ${unresolved.join(', ')}`);
        }

        const secretKey = secretKeyResult.resolved;
        const targetName = targetNameResult.resolved.trim();
        const prefix = prefixResult.resolved;

        if (!secretKey) {
            return authErr('HMAC secret key is required');
        }
        if (!targetName) {
            return authErr('HMAC target name is required');
        }

        // Generate the per-request values once so they are consistent between
        // the signature template and any companion headers.
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomBytes(16).toString('hex');

        // Derive request components for placeholder substitution
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(config.url);
        } catch {
            return authErr(`Invalid request URL: ${config.url}`);
        }

        const placeholders: Record<string, string> = {
            method: config.method.toUpperCase(),
            url: config.url,
            path: parsedUrl.pathname,
            query: parsedUrl.search.replace(/^\?/, ''),
            host: parsedUrl.host,
            body: config.body !== undefined && config.body !== null
                ? String(config.body)
                : '',
            timestamp,
            nonce,
        };

        const stringToSign = this.renderTemplate(templateResult.resolved, placeholders);

        let signature: string;
        try {
            signature = crypto
                .createHmac(hmacAuth.algorithm, secretKey)
                .update(stringToSign)
                .digest(hmacAuth.outputEncoding);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'HMAC computation failed';
            return authErr(`HMAC error: ${message}`);
        }

        const signatureValue = prefix ? `${prefix}${signature}` : signature;

        const resultHeaders: Record<string, string> = {};
        const resultQueryParams: Record<string, string> = {};

        if (hmacAuth.sendIn === 'header') {
            // Respect existing header (case-insensitive) — same semantics as ApiKeyAuthService
            const alreadySet = Object.keys(config.headers).some(
                k => k.toLowerCase() === targetName.toLowerCase()
            );
            if (!alreadySet) {
                resultHeaders[targetName] = signatureValue;
            }
        } else {
            resultQueryParams[targetName] = signatureValue;
        }

        // Emit timestamp and nonce to companion headers when configured
        if (hmacAuth.timestampHeader) {
            resultHeaders[hmacAuth.timestampHeader] = timestamp;
        }
        if (hmacAuth.nonceHeader) {
            resultHeaders[hmacAuth.nonceHeader] = nonce;
        }

        return authOk({
            headers: Object.keys(resultHeaders).length > 0 ? resultHeaders : undefined,
            queryParams: Object.keys(resultQueryParams).length > 0 ? resultQueryParams : undefined,
        });
    }

    /**
     * Replaces `{placeholder}` tokens in the template string with their
     * corresponding values from the placeholders map.
     */
    private renderTemplate(template: string, placeholders: Record<string, string>): string {
        return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
            return Object.prototype.hasOwnProperty.call(placeholders, key)
                ? placeholders[key]
                : `{${key}}`;
        });
    }
}
