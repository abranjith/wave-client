import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import { URL } from 'url';
import { cookieService } from './CookieService';
import { storeService } from './StoreService';
import { getGlobalSettings } from './BaseStorageService';
import { AuthServiceFactory, Auth, AuthType, EnvVarsMap, AuthRequestConfig, InternalAuthResponse } from './auth';
import { convertToBase64 } from '../utils/encoding';
import type { Cookie } from './types';

/**
 * Configuration for internal HTTP send (used by auth services like Digest).
 */
export interface SendConfig {
    method: string;
    url: string;
    headers: Record<string, string>;
    params?: string;
    body?: any;
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
 * HTTP request configuration
 */
export interface HttpRequestConfig {
    id: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    params?: string | Record<string, string>; // Can be string or object
    body?: any;
    auth?: Auth;
    envVars?: EnvVarsMap;
}

/**
 * HTTP response result
 */
export interface HttpResponseResult {
    id: string;
    status: number;
    statusText: string;
    elapsedTime: number;
    size: number;
    headers: Record<string, string>;
    body: string;
    is_encoded: boolean;
}

/**
 * Service for executing HTTP requests.
 * Handles cookie management, proxy configuration, certificate handling, and authentication.
 */
export class HttpService {
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

            // Build URL with params
            let requestUrl = config.url;
            if (config.params) {
                const separator = config.url.includes('?') ? '&' : '?';
                requestUrl = `${config.url}${separator}${config.params}`;
            }

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
                    headers: response.headers as Record<string, any>,
                    data: response.data,
                },
            };
        } catch (error: any) {
            // If we have a response, return it (for non-2xx status codes)
            if (error.response) {
                return {
                    response: {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        headers: error.response.headers as Record<string, any>,
                        data: error.response.data,
                    },
                    error: `Request failed with status ${error.response.statusText}`
                };
            }

            // Network error or other failure
            return {
                response: {
                    status: 0,
                    statusText: error.message || 'Error',
                    headers: {},
                    data: undefined,
                },
                error: error.message || 'Request failed',
            };
        }
    }

    /**
     * Executes an HTTP request with all configured middleware (cookies, proxy, certs, auth).
     * @param request The request configuration
     * @returns The response result and any new cookies
     */
    async execute(request: HttpRequestConfig): Promise<{
        response: HttpResponseResult;
        newCookies: Cookie[];
    }> {
        
        let start = Date.now();

        try {
            // Load settings and cookies
            const settings = await getGlobalSettings();
            const cookies = await cookieService.loadAll();
            const cookieHeader = cookieService.getCookiesForUrl(cookies, request.url);

            // Build headers with cookies
            const headers: Record<string, string> = { ...request.headers };
            if (cookieHeader) {
                headers['Cookie'] = cookieHeader;
            }

            // Build URL with params
            let fullUrl = request.url;
            let paramsString = '';
            if (request.params) {
                if (typeof request.params === 'string') {
                    paramsString = request.params;
                } else if (Object.keys(request.params).length > 0) {
                    paramsString = new URLSearchParams(request.params).toString();
                }
            }

            // Handle authentication if provided
            if (request.auth && request.auth.enabled) {
                const authService = AuthServiceFactory.getService(request.auth.type as AuthType);
                if (authService) {
                    const authConfig: AuthRequestConfig = {
                        method: request.method,
                        url: fullUrl,
                        headers: headers,
                        params: paramsString,
                        body: request.body
                    };

                    const authResult = await authService.applyAuth(
                        authConfig,
                        request.auth,
                        request.envVars || {}
                    );

                    // Check for auth error (using Result pattern)
                    if (authResult.isErr) {
                        throw new Error(`Auth error: ${authResult.error}`);
                    }

                    const authData = authResult.value;

                    // If auth handled internally (like Digest), process and return its response
                    if (authData.handledInternally && authData.response) {
                        const elapsedTime = Date.now() - start;
                        const internalResponse = authData.response;

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
                            response: {
                                id: request.id,
                                status: internalResponse.status,
                                statusText: internalResponse.statusText,
                                elapsedTime,
                                size: responseSize,
                                headers: internalResponse.headers as Record<string, string>,
                                body: bodyBase64,
                                is_encoded: true,
                            },
                            newCookies,
                        };
                    }

                    // Apply auth headers
                    if (authData.headers) {
                        Object.assign(headers, authData.headers);
                    }

                    // Apply auth query params
                    if (authData.queryParams) {
                        const authParams = new URLSearchParams(authData.queryParams).toString();
                        if (paramsString) {
                            paramsString = `${paramsString}&${authParams}`;
                        } else {
                            paramsString = authParams;
                        }
                    }
                }
            }

            // Get proxy and HTTPS agent configurations
            const proxy = await storeService.getProxyForUrl(request.url);
            const customAgent = await storeService.getHttpsAgentForUrl(request.url);

            // Build HTTPS agent with certificate validation settings
            // If a custom agent is provided (for client certs), merge with ignoreCertificateValidation
            // Otherwise, create a new agent if we need to disable certificate validation
            let httpsAgent: https.Agent | undefined = customAgent || undefined;
            if (settings.ignoreCertificateValidation) {
                if (customAgent) {
                    // Custom agent exists - we need to update its options
                    // Note: https.Agent options are read-only after creation,
                    // so we create a new agent with merged options
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
            let requestUrl = fullUrl;
            if (paramsString) {
                const separator = fullUrl.includes('?') ? '&' : '?';
                requestUrl = `${fullUrl}${separator}${paramsString}`;
            }

            const response = await axios({
                method: request.method,
                url: requestUrl,
                headers: headers,
                data: request.body,
                responseType: 'arraybuffer',
                proxy: proxy || undefined,
                httpsAgent: httpsAgent,
                maxRedirects: settings.maxRedirects,
                timeout: timeout,
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

            return {
                response: {
                    id: request.id,
                    status: response.status,
                    statusText: response.statusText,
                    elapsedTime,
                    size: response.data ? response.data.byteLength : 0,
                    headers: response.headers as Record<string, string>,
                    body: bodyBase64,
                    is_encoded: true,
                },
                newCookies
            };
        } catch (error: any) {
            const elapsedTime = Date.now() - start;

            // Convert error response to base64
            const errorBodyBase64 = error?.response?.data
                ? convertToBase64(error.response.data)
                : Buffer.from(error.message, 'utf8').toString('base64');

            const errorSize = error?.response?.data
                ? (error.response.data.byteLength || Buffer.byteLength(error.response.data) || 0)
                : Buffer.byteLength(error.message);

            return {
                response: {
                    id: request.id,
                    status: error?.response?.status || 0,
                    statusText: error?.response?.statusText || 'Error',
                    elapsedTime,
                    size: errorSize,
                    headers: error?.response?.headers || {},
                    body: errorBodyBase64,
                    is_encoded: true,
                },
                newCookies: []
            };
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
    private processSetCookieHeadersFromRaw(headers: Record<string, any>, requestUrl: string): Cookie[] {
        const newCookies: Cookie[] = [];
        const setCookieHeader = headers['set-cookie'];

        if (setCookieHeader) {
            const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
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
}

// Export singleton instance for convenience
export const httpService = new HttpService();
