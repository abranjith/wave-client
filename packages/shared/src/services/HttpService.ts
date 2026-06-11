import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import { URL } from 'url';

import { cookieService } from './CookieService';
import { storeService } from './StoreService';
import { getGlobalSettings } from './BaseStorageService';
import { convertToBase64, HttpResponseResult, type SentRequestBody, type SentRequestData } from '@wave-client/core';
import type { HttpRequestConfig } from '@wave-client/core';
import { executeValidation, createGlobalRulesMap, createEnvVarsMap } from '../utils/validationEngine';
import type { Cookie, ValidationResult } from '../types';
import type { Auth, AuthType, EnvVarsMap, AuthRequestConfig, InternalAuthResponse } from './auth/types';
import { AuthServiceFactory } from './auth';
import { WAVE_CLIENT_USER_AGENT } from './httpConstants';

// Re-export AuthService types that may be needed externally
export type { AuthRequestConfig, InternalAuthResponse };

/**
 * Configuration for internal HTTP send (used by auth services like Digest).
 */
export interface SendConfig {
    method: string;
    url: string;
    headers: Record<string, string>;
    params?: string;
    body?: unknown;
    validateStatus?: boolean; // If true, don't throw on any status (default: false)
    responseType?: 'arraybuffer' | 'text' | 'json';
}

/**
 * Result of internal send operation.
 */
export interface SendResult {
    response: InternalAuthResponse;
    error?: string;
}

/**
 * Flexible auth type for HTTP requests.
 * Can be a full Auth object or a simpler configuration.
 */
export interface HttpAuth {
    type: AuthType | string;
    enabled: boolean;
    [key: string]: unknown;
}

// ==================== Serialized Body Types ====================
// These types match the serializable body types from @wave-client/core

/**
 * Serializable form data entry for transport between client and server.
 */
export interface SerializedFormDataEntry {
    key: string;
    value: string;  // For text: the value; for files: base64 encoded data
    fieldType: 'text' | 'file';
    fileName?: string;
    contentType?: string;
}

/**
 * Serialized form data body.
 */
export interface SerializedFormDataBody {
    type: 'formdata';
    entries: SerializedFormDataEntry[];
}

/**
 * Serialized binary/file body.
 */
export interface SerializedFileBody {
    type: 'file';
    data: string;  // base64 encoded
    fileName: string;
    contentType: string;
}

/**
 * All possible body types that can be received in an HTTP request config.
 */
export type HttpRequestBody =
    | string
    | Record<string, string>
    | SerializedFormDataBody
    | SerializedFileBody
    | null
    | undefined;

/**
 * Auth result from auth service
 */
interface AuthResult {
    isOk: boolean;
    isErr: boolean;
    value?: {
        headers?: Record<string, string>;
        queryParams?: Record<string, string>;
        handledInternally?: boolean;
        response?: InternalAuthResponse;
    };
    error?: string;
}

/**
 * Interface for auth service
 */
interface IAuthService {
    applyAuth(
        config: AuthRequestConfig,
        auth: Auth,
        envVars: EnvVarsMap
    ): Promise<AuthResult>;
}

/**
 * Auth service factory interface
 */
interface IAuthServiceFactory {
    getService(type: AuthType): IAuthService | null;
}

// Auth service factory placeholder - will be set by the consumer
let authServiceFactory: IAuthServiceFactory | null = null;

/**
 * Sets the auth service factory for handling authentication.
 * @param factory The auth service factory
 */
export function setAuthServiceFactory(factory: IAuthServiceFactory): void {
    authServiceFactory = factory;
}

/**
 * Service for executing HTTP requests.
 * Handles cookie management, proxy configuration, certificate handling, and authentication.
 */
export class HttpService {
    /**
     * Registry of in-flight requests keyed by `HttpRequestConfig.id` (the tab id,
     * which is unique per in-flight request). Each entry holds the `AbortController`
     * whose signal is threaded into the outbound axios call so {@link cancel} can
     * abort the **server-side** request. Entries are always removed in the `finally`
     * of {@link execute} — success, error, or abort — so there are no leaks.
     */
    private readonly activeRequests = new Map<string, AbortController>();

    /**
     * Aborts an in-flight request and removes it from the registry.
     *
     * Cancellation is idempotent and race-safe: once a request finishes (success,
     * error, or a prior cancel) its registry entry is gone, so a later/duplicate
     * cancel for the same id is a no-op that returns `false`.
     *
     * The aborted axios call rejects with a cancellation error which {@link execute}
     * maps to a UI-friendly Cancelled `HttpResponseResult` (`status: 0`,
     * `statusText: 'Cancelled'`) — not an unhandled error.
     *
     * @param requestId The request/tab id used when the request was issued.
     * @returns `true` if a matching in-flight request was found and aborted;
     *   `false` when no in-flight request matches the id.
     */
    cancel(requestId: string): boolean {
        const controller = this.activeRequests.get(requestId);
        if (!controller) {
            return false;
        }
        // Remove before aborting so the execute() finally cannot race a new
        // controller registered under the same id.
        this.activeRequests.delete(requestId);
        controller.abort();
        return true;
    }

    /**
     * Detects whether an error is the result of an aborted request (cancellation)
     * rather than a genuine network/HTTP failure.
     */
    private isAbortError(error: unknown): boolean {
        if (axios.isCancel(error)) {
            return true;
        }
        const candidate = error as { code?: string; name?: string } | undefined;
        return candidate?.code === 'ERR_CANCELED' || candidate?.name === 'CanceledError';
    }

    /**
     * Builds the UI-friendly response returned when a request is cancelled.
     * A cancellation is deliberately surfaced as a well-formed response (not an
     * error) so the normal response path can render it.
     */
    private buildCancelledResponse(
        requestId: string,
        elapsedTime: number,
        sentRequest: SentRequestData | undefined
    ): HttpResponseResult {
        return {
            id: requestId,
            status: 0,
            statusText: 'Cancelled',
            elapsedTime,
            size: 0,
            headers: {},
            body: '',
            isEncoded: false,
            cookies: [],
            sentRequest,
        };
    }

    /**
     * Normalize headers from flexible type (HeaderRow[] or Record) to Record<string, string>
     */
    private normalizeHeaders(headers: HttpRequestConfig['headers']): Record<string, string> {
        if (Array.isArray(headers)) {
            // Convert HeaderRow[] to Record<string, string>
            return headers.reduce((acc, row) => {
                if (!row.disabled && row.key) {
                    acc[row.key] = row.value || '';
                }
                return acc;
            }, {} as Record<string, string>);
        }
        // Already a Record, but might have string[] values - convert to string
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(headers)) {
            result[key] = Array.isArray(value) ? value.join(', ') : value;
        }
        return result;
    }

    /**
     * Normalize params from flexible type (ParamRow[] or string) to string
     */
    private normalizeParams(params: HttpRequestConfig['params']): string {
        if (typeof params === 'string') {
            return params;
        }
        if (Array.isArray(params)) {
            // Convert ParamRow[] to URLSearchParams string
            const urlParams = new URLSearchParams();
            params.forEach(row => {
                if (!row.disabled && row.key) {
                    urlParams.append(row.key, row.value || '');
                }
            });
            return urlParams.toString();
        }
        return '';
    }

    /**
     * Finds a header key in a case-insensitive way.
     */
    private findHeaderKey(headers: Record<string, string>, headerName: string): string | undefined {
        const target = headerName.toLowerCase();
        return Object.keys(headers).find((key) => key.toLowerCase() === target);
    }

    /**
     * Injects the default RFC 7231 User-Agent value when no User-Agent exists.
     */
    private ensureDefaultUserAgent(headers: Record<string, string>): void {
        const existingUserAgentKey = this.findHeaderKey(headers, 'user-agent');
        if (!existingUserAgentKey) {
            headers['User-Agent'] = WAVE_CLIENT_USER_AGENT;
        }
    }

    /**
     * Builds a full request URL from base URL and serialized query params.
     */
    private buildRequestUrl(baseUrl: string, params?: string): string {
        if (!params) {
            return baseUrl;
        }
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}${params}`;
    }

    /**
     * Type guard for URL-encoded body payload shape.
     */
    private isStringRecord(value: unknown): value is Record<string, string> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false;
        }

        return Object.values(value).every((entry) => typeof entry === 'string');
    }

    /**
     * Derives a Sent-body format hint from a Content-Type header value.
     * Mirrors the raw-body languages supported in the request editor.
     */
    private deriveBodyFormat(contentType?: string): SentRequestBody['format'] {
        const value = (contentType || '').toLowerCase();
        if (value.includes('json')) { return 'json'; }
        if (value.includes('xml')) { return 'xml'; }
        if (value.includes('html')) { return 'html'; }
        if (value.includes('csv')) { return 'csv'; }
        return 'text';
    }

    /**
     * Converts the outgoing request body into a display-safe Sent tab payload.
     *
     * Reduced to a single `{ text, format }` shape: form-data and url-encoded
     * bodies are JSON-encoded, file/binary bodies are summarised to metadata text
     * (never raw payload bytes), and raw bodies keep their text with a format hint
     * derived from the Content-Type header.
     */
    private buildSentRequestBody(
        body: HttpRequestBody | unknown,
        headers: Record<string, string>
    ): SentRequestBody | undefined {
        if (body === null || body === undefined) {
            return undefined;
        }

        // Multipart form-data → JSON array (file fields are metadata-only).
        if (this.isSerializedFormDataBody(body)) {
            const fields = body.entries.map((entry) =>
                entry.fieldType === 'file'
                    ? { key: entry.key, file: { fileName: entry.fileName, contentType: entry.contentType } }
                    : { key: entry.key, value: entry.value }
            );
            return { text: JSON.stringify(fields, null, 2), format: 'json' };
        }

        // Binary/file → metadata summary only (never the base64 payload).
        if (this.isSerializedFileBody(body)) {
            let size: number | undefined;
            try {
                size = Buffer.from(body.data, 'base64').byteLength;
            } catch {
                size = undefined;
            }
            const summary = [
                body.fileName,
                body.contentType,
                typeof size === 'number' ? `${size} bytes` : undefined,
            ].filter(Boolean).join(' · ');
            return { text: summary, format: 'text' };
        }

        // URL-encoded form → JSON object.
        if (this.isStringRecord(body)) {
            return { text: JSON.stringify(body, null, 2), format: 'json' };
        }

        const contentTypeKey = this.findHeaderKey(headers, 'content-type');
        const contentType = contentTypeKey ? headers[contentTypeKey] : undefined;

        // Raw text → keep as-is with a format hint from the Content-Type.
        if (typeof body === 'string') {
            return { text: body, format: this.deriveBodyFormat(contentType) };
        }

        // Any other object payload → JSON.
        return { text: JSON.stringify(body, null, 2), format: 'json' };
    }

    /**
     * Captures the final request values immediately before the wire send.
     */
    private buildSentRequestSnapshot(
        method: string,
        requestUrl: string,
        headers: Record<string, string>,
        body: HttpRequestBody | unknown
    ): SentRequestData {
        return {
            method,
            url: requestUrl,
            headers: { ...headers },
            body: this.buildSentRequestBody(body, headers),
        };
    }

    /**
     * Low-level send method for making HTTP requests without auth processing.
     * Used by auth services (like Digest) that need to make HTTP calls internally.
     * @param config The send configuration
     * @returns The response result
     */
    async send(config: SendConfig): Promise<SendResult> {
        try {
            const settings = await getGlobalSettings();

            // Get proxy and HTTPS agent configurations
            const proxy = await storeService.getProxyForUrl(config.url);
            const customAgent = await storeService.getHttpsAgentForUrl(config.url);

            // Build HTTPS agent with certificate validation settings
            let httpsAgent: https.Agent | undefined = customAgent || undefined;
            if (settings.ignoreCertificateValidation) {
                if (customAgent) {
                    httpsAgent = new https.Agent({
                        ...customAgent.options,
                        rejectUnauthorized: false,
                    });
                } else {
                    httpsAgent = new https.Agent({ rejectUnauthorized: false });
                }
            }

            // Calculate timeout (0 means no timeout)
            const timeout = settings.requestTimeoutSeconds > 0
                ? settings.requestTimeoutSeconds * 1000
                : 0;

            this.ensureDefaultUserAgent(config.headers);

            // Build URL with params
            const requestUrl = this.buildRequestUrl(config.url, config.params);

            const response = await axios({
                method: config.method,
                url: requestUrl,
                headers: config.headers,
                data: config.body,
                responseType: config.responseType || 'arraybuffer',
                proxy: proxy || undefined,
                httpsAgent: httpsAgent,
                maxRedirects: settings.maxRedirects,
                timeout: timeout,
                validateStatus: config.validateStatus ? () => true : undefined,
            });

            return {
                response: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: response.headers as Record<string, unknown>,
                    data: response.data,
                },
            };
        } catch (error: unknown) {
            const axiosError = error as { response?: AxiosResponse; message?: string };

            // If we have a response, return it (for non-2xx status codes)
            if (axiosError.response) {
                return {
                    response: {
                        status: axiosError.response.status,
                        statusText: axiosError.response.statusText,
                        headers: axiosError.response.headers as Record<string, unknown>,
                        data: axiosError.response.data,
                    },
                    error: `Request failed with status ${axiosError.response.statusText}`
                };
            }

            // Network error or other failure
            return {
                response: {
                    status: 0,
                    statusText: axiosError.message || 'Error',
                    headers: {},
                    data: undefined,
                },
                error: axiosError.message || 'Request failed',
            };
        }
    }

    /**
     * Executes an HTTP request with all configured middleware (cookies, proxy, certs, auth).
     * @param request The request configuration (includes optional validation)
     * @returns The response result and any new cookies
     */
    async execute(
        request: HttpRequestConfig
    ): Promise<HttpResponseResult> {

        let start = Date.now();
        let sentRequest: SentRequestData | undefined;

        // Register an AbortController so cancel() can abort the outbound call.
        const controller = new AbortController();
        this.activeRequests.set(request.id, controller);

        try {
            // Load settings and cookies
            const settings = await getGlobalSettings();
            const cookies = await cookieService.loadAll();
            const cookieHeader = cookieService.getCookiesForUrl(cookies, request.url);

            // Normalize headers from flexible type and add cookies
            const headers = this.normalizeHeaders(request.headers);
            if (cookieHeader) {
                headers['Cookie'] = cookieHeader;
            }

            // Normalize params from flexible type
            let paramsString = this.normalizeParams(request.params);

            // Handle authentication if provided
            authServiceFactory ??= AuthServiceFactory;
            if (request.auth && request.auth.enabled && authServiceFactory) {
                const authService = authServiceFactory.getService(request.auth.type as AuthType);
                if (authService) {
                    const authConfig: AuthRequestConfig = {
                        method: request.method,
                        url: request.url,
                        headers: headers,
                        params: paramsString,
                        body: request.body
                    };

                    const authResult = await authService.applyAuth(
                        authConfig,
                        request.auth as unknown as Auth,
                        request.envVars || {}
                    );

                    // Check for auth error (using Result pattern)
                    if (authResult.isErr) {
                        throw new Error(`Auth error: ${authResult.error}`);
                    }

                    const authData = authResult.value;

                    // Apply auth headers
                    if (authData?.headers) {
                        Object.assign(headers, authData.headers);
                    }

                    // Apply auth query params
                    if (authData?.queryParams) {
                        const authParams = new URLSearchParams(authData.queryParams).toString();
                        if (paramsString) {
                            paramsString = `${paramsString}&${authParams}`;
                        } else {
                            paramsString = authParams;
                        }
                    }

                    this.ensureDefaultUserAgent(headers);

                    // If auth handled internally (like Digest), process and return its response
                    if (authData?.handledInternally && authData.response) {
                        const elapsedTime = Date.now() - start;
                        const internalResponse = authData.response;
                        const requestUrl = this.buildRequestUrl(request.url, paramsString);

                        sentRequest = this.buildSentRequestSnapshot(
                            request.method,
                            requestUrl,
                            headers,
                            request.body
                        );

                        // Process cookies from internal response
                        const newCookies = this.processSetCookieHeadersFromRaw(
                            internalResponse.headers,
                            request.url
                        );

                        if (newCookies.length > 0) {
                            const updatedCookies = cookieService.mergeCookies(cookies, newCookies);
                            await cookieService.saveAll(updatedCookies);
                        }

                        const bodyBase64 = convertToBase64(internalResponse.data);

                        // Calculate size from response data
                        let responseSize = 0;
                        if (internalResponse.data) {
                            if (Buffer.isBuffer(internalResponse.data)) {
                                responseSize = internalResponse.data.byteLength;
                            } else if (internalResponse.data instanceof ArrayBuffer) {
                                responseSize = internalResponse.data.byteLength;
                            } else if (typeof internalResponse.data === 'string') {
                                responseSize = Buffer.byteLength(internalResponse.data, 'utf-8');
                            }
                        }

                        return {
                            id: request.id,
                            status: internalResponse.status,
                            statusText: internalResponse.statusText,
                            elapsedTime,
                            size: responseSize,
                            headers: internalResponse.headers as Record<string, string>,
                            body: bodyBase64,
                            isEncoded: true,
                            cookies: newCookies,
                            sentRequest,
                        };
                    }
                }
            }

            // Respect user-supplied User-Agent values while providing a default when absent.
            this.ensureDefaultUserAgent(headers);

            // Get proxy and HTTPS agent configurations
            const proxy = await storeService.getProxyForUrl(request.url);
            const customAgent = await storeService.getHttpsAgentForUrl(request.url);

            // Build HTTPS agent with certificate validation settings
            let httpsAgent: https.Agent | undefined = customAgent || undefined;
            if (settings.ignoreCertificateValidation) {
                if (customAgent) {
                    httpsAgent = new https.Agent({
                        ...customAgent.options,
                        rejectUnauthorized: false,
                    });
                } else {
                    httpsAgent = new https.Agent({ rejectUnauthorized: false });
                }
            }

            // Calculate timeout (0 means no timeout)
            const timeout = settings.requestTimeoutSeconds > 0
                ? settings.requestTimeoutSeconds * 1000
                : 0;

            // Execute the request
            start = Date.now();

            // Build final URL with params
            const requestUrl = this.buildRequestUrl(request.url, paramsString);

            // Handle custom formdata serialization for VS Code extension communication
            let requestBody: unknown = request.body;

            // Check for serialized formdata: { type: 'formdata', entries: [...] }
            if (this.isSerializedFormDataBody(request.body)) {
                // SerializedFormDataBody detected
                try {
                    const formData = new FormData();

                    for (const entry of request.body.entries) {
                        if (entry.fieldType === 'file') {
                            // Reconstruct Blob from base64
                            const blob = this.base64ToBlob(entry.value, entry.contentType || 'application/octet-stream');
                            formData.append(entry.key, blob, entry.fileName || 'file');
                        } else {
                            formData.append(entry.key, entry.value);
                        }
                    }

                    requestBody = formData;
                    // FormData reconstructed successfully

                    // Remove Content-Type header to let axios/browser set it with boundary
                    const contentTypeKey = this.findHeaderKey(headers, 'content-type');
                    if (contentTypeKey) {
                        delete headers[contentTypeKey];
                    }
                } catch (e) {
                    console.error('Failed to reconstruct FormData:', e);
                    // Fallback to original body if reconstruction fails
                }
            }
            // Check for serialized file/binary body: { type: 'file', data: '...', fileName: '...', contentType: '...' }
            else if (this.isSerializedFileBody(request.body)) {
                try {
                    // Convert base64 to Buffer for axios
                    requestBody = this.base64ToBuffer(request.body.data);

                    // Ensure Content-Type is set from the file body's contentType
                    const contentTypeKey = this.findHeaderKey(headers, 'content-type');
                    if (!contentTypeKey) {
                        headers['Content-Type'] = request.body.contentType;
                    }
                } catch (e) {
                    console.error('Failed to reconstruct file body:', e);
                    // Fallback to original body if reconstruction fails
                }
            }

            // Capture immediately before axios so URL/headers/body reflect final on-wire values.
            sentRequest = this.buildSentRequestSnapshot(
                request.method,
                requestUrl,
                headers,
                request.body
            );

            const response = await axios({
                method: request.method,
                url: requestUrl,
                headers: headers,
                data: requestBody,
                responseType: 'arraybuffer',
                proxy: proxy || undefined,
                httpsAgent: httpsAgent,
                maxRedirects: settings.maxRedirects,
                timeout: timeout,
                signal: controller.signal,
            });

            const elapsedTime = Date.now() - start;

            // Process Set-Cookie headers
            const newCookies = this.processSetCookieHeaders(response, request.url);

            // If we got new cookies, merge and save them
            if (newCookies.length > 0) {
                const updatedCookies = cookieService.mergeCookies(cookies, newCookies);
                await cookieService.saveAll(updatedCookies);
            }

            // Convert response body to base64
            const bodyBase64 = convertToBase64(response.data);

            // Build response data for validation
            const responseData = {
                id: request.id,
                status: response.status,
                statusText: response.statusText,
                elapsedTime,
                size: response.data ? response.data.byteLength : 0,
                headers: response.headers as Record<string, string>,
                body: bodyBase64,
                isEncoded: true,
                sentRequest,
            };

            // Execute validation if configured
            let validationResult: ValidationResult | undefined;
            if (request.validation && request.validation.enabled) {
                const globalRules = await storeService.loadValidationRules();
                const globalRulesMap = createGlobalRulesMap(globalRules);
                const envVarsMap = createEnvVarsMap(request.envVars || {});
                validationResult = executeValidation(request.validation, responseData, globalRulesMap, envVarsMap);
            }

            return {
                ...responseData,
                validationResult,
                cookies: newCookies
            };
        } catch (error: unknown) {
            const elapsedTime = Date.now() - start;

            // A cancelled request is not an error: map it to a well-formed,
            // UI-friendly Cancelled response so the normal response path handles it.
            // Never log request bodies/headers (may contain secrets).
            if (this.isAbortError(error)) {
                console.info(`[HttpService] request cancelled id=${request.id} elapsedMs=${elapsedTime}`);
                return this.buildCancelledResponse(request.id, elapsedTime, sentRequest);
            }

            const axiosError = error as { response?: AxiosResponse; message?: string };

            // Convert error response to base64
            const errorBodyBase64 = axiosError?.response?.data
                ? convertToBase64(axiosError.response.data)
                : Buffer.from(axiosError.message || 'Unknown error', 'utf8').toString('base64');

            const errorSize = axiosError?.response?.data
                ? (axiosError.response.data.byteLength || Buffer.byteLength(axiosError.response.data) || 0)
                : Buffer.byteLength(axiosError.message || 'Unknown error');

            // Convert axios headers to Record<string, string>
            const errorHeaders: Record<string, string> = {};
            if (axiosError?.response?.headers) {
                for (const [key, value] of Object.entries(axiosError.response.headers)) {
                    if (value !== undefined && value !== null) {
                        errorHeaders[key] = String(value);
                    }
                }
            }

            return {
                id: request.id,
                status: axiosError?.response?.status || 0,
                statusText: axiosError?.response?.statusText || 'Error',
                elapsedTime,
                size: errorSize,
                headers: errorHeaders,
                body: errorBodyBase64,
                isEncoded: true,
                cookies: [],
                sentRequest,
            };
        } finally {
            // Always release the registry entry — success, error, or abort — no leaks.
            this.activeRequests.delete(request.id);
        }
    }

    /**
     * Processes Set-Cookie headers from a response.
     * @param response The axios response
     * @param requestUrl The original request URL
     * @returns Array of parsed cookies
     */
    private processSetCookieHeaders(response: AxiosResponse, requestUrl: string): Cookie[] {
        const newCookies: Cookie[] = [];
        const setCookieHeader = response.headers['set-cookie'];

        if (setCookieHeader) {
            const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
            const url = new URL(requestUrl);

            setCookies.forEach(header => {
                const cookie = cookieService.parseSetCookie(header, url.hostname);
                if (cookie) {
                    newCookies.push(cookie);
                }
            });
        }

        return newCookies;
    }

    /**
     * Processes Set-Cookie headers from raw headers object.
     * Used when auth service handles request internally.
     * @param headers The response headers
     * @param requestUrl The original request URL
     * @returns Array of parsed cookies
     */
    private processSetCookieHeadersFromRaw(headers: Record<string, unknown>, requestUrl: string): Cookie[] {
        const newCookies: Cookie[] = [];
        const setCookieHeader = headers['set-cookie'];

        if (setCookieHeader) {
            const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader as string];
            const url = new URL(requestUrl);

            setCookies.forEach((header: string) => {
                const cookie = cookieService.parseSetCookie(header, url.hostname);
                if (cookie) {
                    newCookies.push(cookie);
                }
            });
        }

        return newCookies;
    }

    // ==================== Helper Methods for Body Type Handling ====================

    /**
     * Type guard to check if body is a SerializedFormDataBody.
     */
    private isSerializedFormDataBody(body: unknown): body is SerializedFormDataBody {
        return body !== null &&
            body !== undefined &&
            typeof body === 'object' &&
            'type' in body &&
            body.type === 'formdata' &&
            'entries' in body &&
            Array.isArray(body.entries);
    }

    /**
     * Type guard to check if body is a SerializedFileBody.
     */
    private isSerializedFileBody(body: unknown): body is SerializedFileBody {
        return body !== null &&
            body !== undefined &&
            typeof body === 'object' &&
            'type' in body &&
            body.type === 'file' &&
            'data' in body &&
            typeof body.data === 'string';
    }

    /**
     * Convert base64 string to Blob.
     */
    private base64ToBlob(base64: string, contentType: string): Blob {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    }

    /**
     * Convert base64 string to Buffer (for Node.js axios requests).
     */
    private base64ToBuffer(base64: string): Buffer {
        return Buffer.from(base64, 'base64');
    }
}

// Export singleton instance for convenience
export const httpService = new HttpService();
