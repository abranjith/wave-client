import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import { URL } from 'url';
import { Cookie } from '../types/collection';
import { cookieService } from './CookieService';
import { storeService } from './StoreService';
import { getGlobalSettings } from './BaseStorageService';
import { convertToBase64 } from '../utils/encoding';
import { AuthServiceFactory, Auth, AuthType, EnvVarsMap, AuthRequestConfig } from './auth';

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
    body: string; // Base64 encoded
}

/**
 * Service for executing HTTP requests.
 * Handles cookie management, proxy configuration, certificate handling, and authentication.
 */
export class HttpService {
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
                        body: request.body,
                    };

                    const authResult = await authService.applyAuth(
                        authConfig,
                        request.auth,
                        request.envVars || {}
                    );

                    // Check for auth error
                    if (authResult.error) {
                        throw new Error(`Auth error: ${authResult.error}`);
                    }

                    // If auth handled internally (like Digest), process and return its response
                    if (authResult.handledInternally && authResult.response) {
                        const elapsedTime = Date.now() - start;
                        const internalResponse = authResult.response;

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

                        return {
                            response: {
                                id: request.id,
                                status: internalResponse.status,
                                statusText: internalResponse.statusText,
                                elapsedTime,
                                size: internalResponse.data ? internalResponse.data.byteLength : 0,
                                headers: internalResponse.headers as Record<string, string>,
                                body: bodyBase64,
                            },
                            newCookies,
                        };
                    }

                    // Apply auth headers
                    if (authResult.headers) {
                        Object.assign(headers, authResult.headers);
                    }

                    // Apply auth query params
                    if (authResult.queryParams) {
                        const authParams = new URLSearchParams(authResult.queryParams).toString();
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
