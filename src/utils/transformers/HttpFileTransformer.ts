/**
 * HTTP File Transformer
 * Transforms .http files to Wave Collection format.
 * 
 * HTTP files are text-based files that define HTTP requests in a simple format.
 * Example:
 * ```
 * ### Get Users
 * GET https://api.example.com/users
 * Authorization: Bearer {{token}}
 * 
 * ### Create User
 * POST https://api.example.com/users
 * Content-Type: application/json
 * 
 * {
 *   "name": "John Doe"
 * }
 * ```
 */

import { BaseCollectionTransformer, CollectionFormatType, Result, ok, err } from './BaseCollectionTransformer';
import { Collection, CollectionItem, CollectionRequest, CollectionUrl, CollectionBody, HeaderRow } from '../../types/collection';

/**
 * Parsed HTTP request from .http file
 */
interface ParsedHttpRequest {
    name: string;
    method: string;
    url: string;
    headers: HeaderRow[];
    body?: string;
}

/**
 * Transformer for .http file format
 */
export class HttpFileTransformer extends BaseCollectionTransformer<string> {
    readonly formatType: CollectionFormatType = 'http';
    readonly formatName = 'HTTP File';
    readonly fileExtensions = ['.http', '.rest'];

    /**
     * Validates if the data is a valid HTTP file content (string)
     */
    validate(data: unknown): data is string {
        if (typeof data !== 'string') {
            return false;
        }

        // Basic validation: should contain at least one HTTP method
        const httpMethodPattern = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/im;
        return httpMethodPattern.test(data);
    }

    /**
     * Detects if data is HTTP file content
     */
    canHandle(data: unknown): boolean {
        return this.validate(data);
    }

    /**
     * Transforms HTTP file content to Collection
     */
    transformFrom(external: string, filename?: string): Result<Collection, string> {
        try {
            const requests = this.parseHttpFile(external);
            
            if (requests.length === 0) {
                return err('No valid HTTP requests found in file');
            }

            const collectionName = filename?.replace(/\.(http|rest)$/i, '') || 'Imported HTTP Collection';

            const collection: Collection = {
                info: {
                    name: collectionName,
                    description: `Imported from ${filename || 'HTTP file'}`
                },
                item: requests.map((req) => this.createCollectionItem(req))
            };

            return ok(collection);
        } catch (error) {
            return err(`Failed to parse HTTP file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Transforms Collection to HTTP file content
     * Note: Export to HTTP format is limited - some data may be lost
     */
    transformTo(collection: Collection): Result<string, string> {
        try {
            const lines: string[] = [];
            
            // Add file header comment
            lines.push(`# ${collection.info.name}`);
            if (collection.info.description) {
                lines.push(`# ${collection.info.description}`);
            }
            lines.push('');

            // Convert items to HTTP format
            this.convertItemsToHttp(collection.item, lines);

            return ok(lines.join('\n'));
        } catch (error) {
            return err(`Failed to export to HTTP format: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Parses HTTP file content into request objects
     */
    private parseHttpFile(content: string): ParsedHttpRequest[] {
        const requests: ParsedHttpRequest[] = [];
        
        // Split by request separators (###, ---, or blank lines before HTTP methods)
        const requestBlocks = content.split(/(?:^|\n)(?:###|---)\s*/);
        
        for (const block of requestBlocks) {
            const trimmed = block.trim();
            if (!trimmed) {
                continue;
            }

            const parsed = this.parseRequestBlock(trimmed);
            if (parsed) {
                requests.push(parsed);
            }
        }

        return requests;
    }

    /**
     * Parses a single request block
     * Sample, input:
     * ```
     * # Get Users
     * GET https://api.example.com/users
     * Authorization: Bearer {{token}}
     * 
     * ```{
     *   "name": "John Doe"
     * }
     * ```
     * Returns ParsedHttpRequest or null if invalid
     */
    private parseRequestBlock(block: string): ParsedHttpRequest | null {
        const lines = block.split('\n');
        let name = 'Request';
        let method = 'GET';
        let url = '';
        const headers: HeaderRow[] = [];
        let body = '';
        let inBody = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Skip empty lines before finding the request line
            if (!url && !trimmedLine) {
                continue;
            }

            // Check for request name (comment before method line)
            if (!url && trimmedLine.startsWith('#')) {
                name = trimmedLine.substring(1).trim() || name;
                continue;
            }

            // Parse request line (METHOD URL)
            if (!url) {
                const requestLineMatch = trimmedLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
                if (requestLineMatch) {
                    method = requestLineMatch[1].toUpperCase();
                    url = requestLineMatch[2].split(/\s+/)[0]; // Take URL, ignore HTTP version
                    continue;
                }
            }

            // Empty line after headers indicates body start
            if (url && !inBody && !trimmedLine) {
                inBody = true;
                continue;
            }

            // Parse headers (before body)
            if (url && !inBody && trimmedLine.includes(':')) {
                const colonIndex = trimmedLine.indexOf(':');
                const key = trimmedLine.substring(0, colonIndex).trim();
                const value = trimmedLine.substring(colonIndex + 1).trim();
                
                // Skip HTTP version line
                if (!key.startsWith('HTTP/')) {
                    headers.push({
                        id: this.generateId(),
                        key,
                        value,
                        disabled: false
                    });
                }
                continue;
            }

            // Collect body lines
            if (inBody) {
                body += (body ? '\n' : '') + line;
            }
        }

        if (!url) {
            return null;
        }

        return {
            name,
            method,
            url,
            headers,
            body: body.trim() || undefined
        };
    }

    /**
     * Creates a CollectionItem from a parsed HTTP request
     */
    private createCollectionItem(parsed: ParsedHttpRequest): CollectionItem {
        const urlObj: CollectionUrl = {
            raw: parsed.url,
            host: this.extractHost(parsed.url),
            path: this.extractPath(parsed.url)
        };

        const request: CollectionRequest = {
            method: parsed.method,
            url: urlObj,
            header: parsed.headers
        };

        // Add body if present
        if (parsed.body) {
            const contentType = parsed.headers.find(h => 
                h.key.toLowerCase() === 'content-type'
            )?.value || 'text/plain';

            request.body = {
                mode: this.detectBodyMode(contentType),
                raw: parsed.body
            };

            // Add language hint for raw body
            if (contentType.includes('json')) {
                request.body.options = {
                    raw: { language: 'json' }
                };
            } else if (contentType.includes('xml')) {
                request.body.options = {
                    raw: { language: 'xml' }
                };
            }
        }

        return {
            id: this.generateId(),
            name: parsed.name,
            request
        };
    }

    /**
     * Extracts host from URL
     */
    private extractHost(url: string): string[] {
        try {
            const urlObj = new URL(url.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
            return [urlObj.host];
        } catch {
            // Handle URLs with variables
            const match = url.match(/^(?:https?:\/\/)?([^\/]+)/);
            return match ? [match[1]] : [];
        }
    }

    /**
     * Extracts path from URL
     */
    private extractPath(url: string): string[] {
        try {
            const urlObj = new URL(url.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
            return urlObj.pathname.split('/').filter(Boolean);
        } catch {
            const match = url.match(/^(?:https?:\/\/)?[^\/]+(\/.*)?$/);
            if (match && match[1]) {
                return match[1].split('/').filter(Boolean);
            }
            return [];
        }
    }

    /**
     * Detects body mode from content type
     */
    private detectBodyMode(contentType: string): 'raw' | 'urlencoded' | 'formdata' {
        if (contentType.includes('x-www-form-urlencoded')) {
            return 'urlencoded';
        }
        if (contentType.includes('multipart/form-data')) {
            return 'formdata';
        }
        return 'raw';
    }

    /**
     * Converts collection items to HTTP file format
     */
    private convertItemsToHttp(items: CollectionItem[], lines: string[], depth: number = 0): void {
        for (const item of items) {
            if (item.item) {
                // Folder - add as comment section
                lines.push(`### ${item.name}`);
                lines.push('');
                this.convertItemsToHttp(item.item, lines, depth + 1);
            } else if (item.request) {
                // Request
                lines.push(`### ${item.name}`);
                
                const url = typeof item.request.url === 'string' 
                    ? item.request.url 
                    : item.request.url?.raw || '';
                
                lines.push(`${item.request.method || 'GET'} ${url}`);

                // Add headers
                if (item.request.header) {
                    for (const header of item.request.header) {
                        if (!header.disabled) {
                            lines.push(`${header.key}: ${header.value}`);
                        }
                    }
                }

                // Add body
                if (item.request.body?.raw) {
                    lines.push('');
                    lines.push(item.request.body.raw);
                }

                lines.push('');
            }
        }
    }
}

/**
 * Singleton instance of the HTTP file transformer
 */
export const httpFileTransformer = new HttpFileTransformer();
