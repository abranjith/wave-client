/**
 * MCP Server Adapter
 * 
 * Implements IHttpAdapter for the MCP server environment.
 * Uses HttpService directly instead of making API calls to a server.
 */

import {
    IHttpAdapter,
    HttpRequestConfig,
    HttpResponseResult,
    Result,
    ok,
    err,
} from '@wave-client/core';
import { httpService } from '@wave-client/shared';

/**
 * HTTP adapter for MCP server using HttpService directly
 */
export class McpHttpAdapter implements IHttpAdapter {
    async executeRequest(
        config: HttpRequestConfig
    ): Promise<Result<HttpResponseResult, string>> {
        try {
            // HttpService.execute() returns HttpResponseResult directly, not Result<>
            const response = await httpService.execute(config);

            // Check if the response indicates an error (status 0 means network error)
            if (response.status === 0) {
                console.error('[McpHttpAdapter] Request failed:', {
                    url: config.url,
                    method: config.method,
                    statusText: response.statusText
                });
                return err(response.statusText || 'Network error');
            }

            return ok(response);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('[McpHttpAdapter] Request failed:', {
                url: config.url,
                method: config.method,
                error: message
            });
            return err(message);
        }
    }
}
