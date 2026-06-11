/**
 * HTTP File Transformer
 * Transforms .http files to Wave Collection format.
 *
 * Implements the ASP.NET Core / VS Code REST Client `.http` syntax:
 * `###` separators (text after is a candidate name), `#` and `//` comments,
 * `@name` directives, file variables (`@var=value` — skipped, unresolved),
 * optional methods (default GET), URL continuation lines, and verbatim
 * bodies. `{{var}}` references pass through unresolved.
 *
 * Example:
 * ```
 * @baseUrl=https://api.example.com
 *
 * ### Get Users
 * // A comment between requests
 * GET {{baseUrl}}/users
 *   ?page=1
 *   &limit=20
 * Authorization: Bearer {{token}}
 *
 * # @name createUser
 * POST {{baseUrl}}/users HTTP/1.1
 * Content-Type: application/json
 *
 * {
 *   "name": "John Doe"
 * }
 * ```
 */

import { BaseCollectionTransformer, CollectionFormatType, Result, ok, err } from './BaseCollectionTransformer';
import { Collection, CollectionItem, CollectionRequest, CollectionUrl, CollectionBody, HeaderRow } from '../../types/collection';
import { CURRENT_COLLECTION_SCHEMA_VERSION } from '../../schemas/collectionSchema';

/**
 * Parsed HTTP request from .http file.
 * `name` is assigned by the naming pass after all blocks are parsed.
 */
interface ParsedHttpRequest {
    name: string;
    method: string;
    url: string;
    headers: HeaderRow[];
    body?: string;
    /** Name from a `# @name` / `// @name` directive (highest priority). */
    nameDirective?: string;
    /** Text after the `###` separator that opened this block (second priority). */
    separatorText?: string;
    /** Nearest non-directive comment above the request line (second priority fallback). */
    leadingComment?: string;
}

/**
 * A pre-parse unit: the lines between two `###` separators.
 */
interface RequestBlock {
    /** Trimmed text after the `###` separator (candidate request name). */
    separatorText?: string;
    /** Raw content lines of the block (original text, body bytes preserved). */
    lines: string[];
}

/** HTTP methods accepted on a request line (per the ASP.NET Core .http spec). */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];

/** Matches `METHOD URL [HTTP-version]` request lines (method required). */
const METHOD_LINE_RE = new RegExp(`^(${HTTP_METHODS.join('|')})\\s+(.+)$`, 'i');

/** Matches `# @name foo`, `// @name foo`, `#@name=foo` spacing variants. */
const NAME_DIRECTIVE_RE = /^(?:#|\/\/)\s*@name\s*=?\s*(.+)$/i;

/** Matches file-variable lines (`@var=value`) — recognized and skipped. */
const FILE_VARIABLE_RE = /^@[\w-]+\s*=/;

/** Matches a comment line outside the body (`#` or `//` prefixed). */
const COMMENT_LINE_RE = /^(?:#|\/\/)/;

/** Matches a bare-URL request line (method omitted → GET). Single token only. */
const BARE_URL_RE = /^(?:https?:\/\/|\{\{)\S*$/i;

/** Matches a trailing HTTP version token on a request line (ignored). */
const HTTP_VERSION_RE = /\s+HTTP\/[\d.]+\s*$/i;

/**
 * Transformer for .http file format
 */
export class HttpFileTransformer extends BaseCollectionTransformer<string> {
    readonly formatType: CollectionFormatType = 'http';
    readonly formatName = 'HTTP File';
    readonly fileExtensions = ['.http', '.rest'];

    /**
     * Validates if the data is valid HTTP file content (string).
     *
     * Content qualifies when it contains a request line per the .http
     * grammar: `METHOD URL` (URL must look absolute) or a bare absolute URL
     * (method omitted → GET). JSON-looking text is rejected outright so this
     * detector stays conservative for content-based format detection.
     */
    validate(data: unknown): data is string {
        if (typeof data !== 'string' || !data.trim()) {
            return false;
        }

        // JSON content (collections, Postman, Swagger) is never an .http file.
        const trimmed = data.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            return false;
        }

        return data.split('\n').some((line) => {
            const candidate = line.trim();
            const methodMatch = candidate.match(METHOD_LINE_RE);
            if (methodMatch) {
                // Require a URL-ish target so prose like "GET up early" doesn't match.
                const target = methodMatch[2].trim().split(/\s+/)[0];
                return target.includes('://') || target.startsWith('{{') || target.startsWith('/');
            }
            return BARE_URL_RE.test(candidate);
        });
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
    async transformFrom(external: string, filename?: string): Promise<Result<Collection, string>> {
        try {
            const requests = this.parseHttpFile(external);
            
            if (requests.length === 0) {
                return err('No valid HTTP requests found in file');
            }

            const collectionName = filename?.replace(/\.(http|rest)$/i, '') || 'Imported HTTP Collection';

            const collection: Collection = {
                info: {
                    waveId: this.generateId(),
                    name: collectionName,
                    description: `Imported from ${filename || 'HTTP file'}`,
                    version: CURRENT_COLLECTION_SCHEMA_VERSION
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
    async transformTo(collection: Collection): Promise<Result<string, string>> {
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
     * Parses HTTP file content into request objects.
     *
     * Two stages: split into `###`-delimited blocks, parse each block, then
     * run the naming pass (directive > comment/separator > URL-derived, with
     * a uniqueness suffix) across the whole file.
     */
    private parseHttpFile(content: string): ParsedHttpRequest[] {
        const blocks = this.splitBlocks(content);
        const requests: ParsedHttpRequest[] = [];

        for (const block of blocks) {
            const parsed = this.parseRequestBlock(block);
            if (parsed) {
                requests.push(parsed);
            }
        }

        this.assignNames(requests);
        return requests;
    }

    /**
     * Splits file content into request blocks.
     *
     * Only lines starting with `###` delimit requests (the `---` separator is
     * not part of the .http spec). Text after `###` is captured as a candidate
     * request name. Content before the first separator forms the first block.
     */
    private splitBlocks(content: string): RequestBlock[] {
        const blocks: RequestBlock[] = [];
        let current: RequestBlock = { lines: [] };

        for (const line of content.split(/\r?\n/)) {
            if (line.trimStart().startsWith('###')) {
                blocks.push(current);
                current = { separatorText: line.trimStart().slice(3).trim() || undefined, lines: [] };
            } else {
                current.lines.push(line);
            }
        }
        blocks.push(current);

        return blocks;
    }

    /**
     * Parses a single request block per the .http grammar:
     *
     * - Comments (`#` / `//`) are allowed anywhere outside the body; `@name`
     *   directives are extracted, other comments feed the naming fallback.
     * - File variables (`@var=value`) are recognized and skipped.
     * - Request line: `[METHOD] URL [HTTP-version]` — method optional
     *   (default GET), HTTP version ignored.
     * - URL continuation lines (starting with `?` or `&`) are appended.
     * - Headers run until the first blank line; interleaved comments skipped.
     * - Body is everything after that blank line, verbatim — comments are NOT
     *   stripped inside the body; only trailing whitespace is trimmed.
     *
     * Returns null for blocks without a parseable request line.
     */
    private parseRequestBlock(block: RequestBlock): ParsedHttpRequest | null {
        let nameDirective: string | undefined;
        let leadingComment: string | undefined;
        let method = '';
        let url = '';
        const headers: HeaderRow[] = [];
        const bodyLines: string[] = [];

        type Phase = 'preamble' | 'afterRequestLine' | 'headers' | 'body';
        let phase: Phase = 'preamble';

        for (const line of block.lines) {
            const trimmed = line.trim();

            if (phase === 'body') {
                bodyLines.push(line);
                continue;
            }

            // Outside the body: blank lines end headers, otherwise tolerated.
            if (!trimmed) {
                if (phase === 'afterRequestLine' || phase === 'headers') {
                    phase = 'body';
                }
                continue;
            }

            // Comments are allowed anywhere outside the body.
            if (COMMENT_LINE_RE.test(trimmed)) {
                const directive = trimmed.match(NAME_DIRECTIVE_RE);
                if (directive) {
                    nameDirective = directive[1].trim();
                } else if (phase === 'preamble') {
                    // Nearest non-directive comment above the request line.
                    leadingComment = trimmed.replace(/^(?:#|\/\/)\s*/, '').trim() || leadingComment;
                }
                continue;
            }

            if (phase === 'preamble') {
                // File variables are recognized and skipped (no resolution).
                if (FILE_VARIABLE_RE.test(trimmed)) {
                    continue;
                }

                const parsedLine = this.parseRequestLine(trimmed);
                if (!parsedLine) {
                    // Not a request line — the block carries no request.
                    return null;
                }
                method = parsedLine.method;
                url = parsedLine.url;
                phase = 'afterRequestLine';
                continue;
            }

            // URL continuation lines (per spec: subsequent lines starting ? or &).
            if (phase === 'afterRequestLine' && (trimmed.startsWith('?') || trimmed.startsWith('&'))) {
                url += trimmed;
                continue;
            }

            // Header line: Key: Value
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const key = trimmed.substring(0, colonIndex).trim();
                const value = trimmed.substring(colonIndex + 1).trim();
                if (!key.startsWith('HTTP/')) {
                    headers.push({ id: this.generateId(), key, value, disabled: false });
                }
                phase = 'headers';
                continue;
            }

            // Unrecognized non-blank line outside the body — tolerate and skip.
        }

        if (!url) {
            return null;
        }

        // Trailing whitespace trimmed; internal blank lines and comments preserved.
        const body = bodyLines.join('\n').replace(/\s+$/, '');

        return {
            name: '',
            method,
            url,
            headers,
            body: body || undefined,
            nameDirective,
            separatorText: block.separatorText,
            leadingComment,
        };
    }

    /**
     * Parses a request line: `[METHOD] URL [HTTP-version]`.
     * Method optional (default GET); the trailing HTTP version token is ignored.
     */
    private parseRequestLine(line: string): { method: string; url: string } | null {
        const withoutVersion = line.replace(HTTP_VERSION_RE, '');

        const methodMatch = withoutVersion.match(METHOD_LINE_RE);
        if (methodMatch) {
            return {
                method: methodMatch[1].toUpperCase(),
                url: methodMatch[2].trim().split(/\s+/)[0],
            };
        }

        // Method-less request line: a bare URL (absolute or variable-prefixed).
        if (BARE_URL_RE.test(withoutVersion.trim())) {
            return { method: 'GET', url: withoutVersion.trim() };
        }

        return null;
    }

    /**
     * Resolves final request names with the three-tier priority —
     * `@name` directive, then separator text / nearest comment, then a
     * URL-derived fallback — and de-duplicates with ` 2`, ` 3`, … suffixes.
     */
    private assignNames(requests: ParsedHttpRequest[]): void {
        const usedNames = new Set<string>();

        for (const request of requests) {
            const baseName =
                request.nameDirective ||
                request.separatorText ||
                request.leadingComment ||
                this.deriveNameFromUrl(request.method, request.url);

            let finalName = baseName;
            let suffix = 2;
            while (usedNames.has(finalName)) {
                finalName = `${baseName} ${suffix}`;
                suffix++;
            }
            usedNames.add(finalName);
            request.name = finalName;
        }
    }

    /**
     * Derives a simple display name from the method and URL: strips
     * protocol and `{{var}}` segments, then uses the last meaningful word
     * (e.g., `GET https://api.example.com/users` → `Get users`).
     */
    private deriveNameFromUrl(method: string, url: string): string {
        const cleaned = url
            .replace(/\{\{[^}]*\}\}/g, ' ')
            .replace(/^[a-z+]+:\/\//i, ' ')
            .replace(/[?#].*$/, ' ');

        const words = cleaned.split(/[^a-zA-Z0-9]+/).filter(Boolean);
        const methodTitle = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();

        if (words.length === 0) {
            return `${methodTitle} request`;
        }
        return `${methodTitle} ${words[words.length - 1]}`;
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

        const requestId = this.generateId();

        const request: CollectionRequest = {
            id: requestId,
            name: parsed.name,
            method: parsed.method,
            url: urlObj,
            header: parsed.headers
        };

        // Add body if present
        if (parsed.body) {
            const contentType = parsed.headers.find(h => 
                h.key.toLowerCase() === 'content-type'
            )?.value || 'text/plain';

            // Create proper BodyRaw type
            const bodyMode = this.detectBodyMode(contentType);
            if (bodyMode === 'raw') {
                // Determine language from content type
                let language: 'json' | 'xml' | 'html' | 'text' | undefined = undefined;
                if (contentType.includes('json')) {
                    language = 'json';
                } else if (contentType.includes('xml')) {
                    language = 'xml';
                } else if (contentType.includes('html')) {
                    language = 'html';
                }

                request.body = {
                    mode: 'raw',
                    raw: parsed.body,
                    options: language ? { raw: { language } } : undefined
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
                // Request (HTTP-only format; WS/SSE requests fall back to GET with URL only)
                const req = item.request as CollectionRequest;
                lines.push(`### ${item.name}`);
                
                const url = typeof req.url === 'string' 
                    ? req.url 
                    : req.url?.raw || '';
                
                lines.push(`${req.method || 'GET'} ${url}`);

                // Add headers
                if (req.header) {
                    for (const header of req.header) {
                        if (!header.disabled) {
                            lines.push(`${header.key}: ${header.value}`);
                        }
                    }
                }

                // Add body
                if (req.body?.mode === 'raw' && req.body.raw) {
                    lines.push('');
                    lines.push(req.body.raw);
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
