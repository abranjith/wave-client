import axios, { AxiosResponse } from 'axios';
import * as https from 'https';
import { URL } from 'url';
import { Cookie } from '../types/collection';
import { cookieService } from './CookieService';
import { storeService } from './StoreService';
import { getGlobalSettings } from './BaseStorageService';
import { convertToBase64 } from '../utils/encoding';

/**
 * HTTP request configuration
 */
export interface HttpRequestConfig {
    id: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    params: Record<string, string>;
    body?: any;
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
 * Handles cookie management, proxy configuration, and certificate handling.
 */
export class HttpService {
    /**
     * Executes an HTTP request with all configured middleware (cookies, proxy, certs).
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
            const headers = { ...request.headers };
            if (cookieHeader) {
                headers['Cookie'] = cookieHeader;
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

            const response = await axios({
                method: request.method,
                url: request.url,
                params: new URLSearchParams(request.params),
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
}

// Export singleton instance for convenience
export const httpService = new HttpService();
