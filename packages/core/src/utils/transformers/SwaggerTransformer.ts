/**
 * Swagger/OpenAPI Transformer
 * Transforms OpenAPI (Swagger) specifications to Wave Collection format.
 * 
 * Supports OpenAPI 3.x and Swagger 2.0 specifications.
 * Creates requests from path operations and organizes them by tags.
 */

import { BaseCollectionTransformer, CollectionFormatType, Result, ok, err } from './BaseCollectionTransformer';
import { Collection, CollectionItem, CollectionRequest, CollectionUrl, CollectionBody, HeaderRow, ParamRow } from '../../types/collection';

/**
 * OpenAPI 3.x specification types
 */
interface OpenAPISpec {
    openapi?: string;
    swagger?: string;
    info: {
        title: string;
        description?: string;
        version: string;
    };
    servers?: Array<{
        url: string;
        description?: string;
        variables?: Record<string, { default: string; enum?: string[]; description?: string }>;
    }>;
    host?: string; // Swagger 2.0
    basePath?: string; // Swagger 2.0
    schemes?: string[]; // Swagger 2.0
    paths: Record<string, PathItem>;
    tags?: Array<{ name: string; description?: string }>;
}

interface PathItem {
    get?: Operation;
    post?: Operation;
    put?: Operation;
    patch?: Operation;
    delete?: Operation;
    head?: Operation;
    options?: Operation;
    parameters?: Parameter[];
}

interface Operation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses?: Record<string, Response>;
    security?: Array<Record<string, string[]>>;
}

interface Parameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema?: Schema;
    example?: unknown;
}

interface RequestBody {
    description?: string;
    required?: boolean;
    content?: Record<string, MediaType>;
}

interface MediaType {
    schema?: Schema;
    example?: unknown;
    examples?: Record<string, { value: unknown }>;
}

interface Schema {
    type?: string;
    format?: string;
    properties?: Record<string, Schema>;
    items?: Schema;
    example?: unknown;
    default?: unknown;
    enum?: unknown[];
}

interface Response {
    description?: string;
    content?: Record<string, MediaType>;
}

/**
 * Transformer for OpenAPI/Swagger specifications
 */
export class SwaggerTransformer extends BaseCollectionTransformer<OpenAPISpec> {
    readonly formatType: CollectionFormatType = 'swagger';
    readonly formatName = 'OpenAPI / Swagger';
    readonly fileExtensions = ['.json', '.yaml', '.yml'];

    /**
     * Validates if the data is a valid OpenAPI specification
     */
    validate(data: unknown): data is OpenAPISpec {
        if (!data || typeof data !== 'object') {
            return false;
        }

        const obj = data as Record<string, unknown>;

        // Must have openapi (3.x) or swagger (2.0) version field
        if (!obj.openapi && !obj.swagger) {
            return false;
        }

        // Must have info object
        if (!obj.info || typeof obj.info !== 'object') {
            return false;
        }

        // Must have paths object
        if (!obj.paths || typeof obj.paths !== 'object') {
            return false;
        }

        return true;
    }

    /**
     * Detects if data is an OpenAPI specification
     */
    canHandle(data: unknown): boolean {
        return this.validate(data);
    }

    /**
     * Transforms OpenAPI specification to Collection
     */
    transformFrom(external: OpenAPISpec, filename?: string): Result<Collection, string> {
        try {
            const collectionName = external.info.title || filename?.replace(/\.(json|yaml|yml|txt)$/i, '') || 'Imported API';
            const baseUrl = this.getBaseUrl(external);

            // Group operations by tags
            const taggedOperations = this.groupOperationsByTag(external);

            // Create collection items
            const items: CollectionItem[] = [];

            for (const [tag, operations] of taggedOperations) {
                if (tag === '__untagged__') {
                    // Add untagged operations directly to root
                    items.push(...operations.map(op => this.createRequestItem(op, baseUrl)));
                } else {
                    // Create folder for tag
                    items.push({
                        id: this.generateId(),
                        name: tag,
                        description: this.getTagDescription(external, tag),
                        item: operations.map(op => this.createRequestItem(op, baseUrl))
                    });
                }
            }

            const collection: Collection = {
                info: {
                    waveId: this.generateId(),
                    name: collectionName,
                    description: external.info.description,
                    version: this.waveVersion,
                },
                item: items
            };

            return ok(collection);
        } catch (error) {
            return err(`Failed to parse OpenAPI specification: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Transforms Collection to OpenAPI specification
     * Note: Export to OpenAPI format is limited - responses and schemas are not fully reconstructed
     */
    transformTo(collection: Collection): Result<OpenAPISpec, string> {
        try {
            const paths: Record<string, PathItem> = {};
            const tags: Array<{ name: string; description?: string }> = [];

            // Convert items to paths
            this.convertItemsToPaths(collection.item, paths, tags);

            // Extract server URL from first request item
            const serverUrl = this.extractServerUrl(collection.item);

            const spec: OpenAPISpec = {
                openapi: '3.0.3',
                info: {
                    title: collection.info.name,
                    description: collection.info.description || '',
                    version: '1.0.0'
                },
                servers: [{ url: serverUrl }],
                paths,
                tags: tags.length > 0 ? tags : undefined
            };

            return ok(spec);
        } catch (error) {
            return err(`Failed to export to OpenAPI format: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Gets the base URL from the OpenAPI spec
     */
    private getBaseUrl(spec: OpenAPISpec): string {
        // OpenAPI 3.x
        if (spec.servers && spec.servers.length > 0) {
            let url = spec.servers[0].url;
            
            // Replace server variables with defaults
            if (spec.servers[0].variables) {
                for (const [key, variable] of Object.entries(spec.servers[0].variables)) {
                    url = url.replace(`{${key}}`, variable.default);
                }
            }
            
            return url;
        }

        // Swagger 2.0
        if (spec.host) {
            const scheme = spec.schemes?.[0] || 'https';
            const basePath = spec.basePath || '';
            return `${scheme}://${spec.host}${basePath}`;
        }

        return 'https://api.example.com';
    }

    /**
     * Groups operations by their tags
     */
    private groupOperationsByTag(spec: OpenAPISpec): Map<string, Array<{ method: string; path: string; operation: Operation }>> {
        const grouped = new Map<string, Array<{ method: string; path: string; operation: Operation }>>();
        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

        for (const [path, pathItem] of Object.entries(spec.paths)) {
            for (const method of methods) {
                const operation = pathItem[method];
                if (!operation) {
                    continue;
                }

                const tags = operation.tags?.length ? operation.tags : ['__untagged__'];
                
                for (const tag of tags) {
                    if (!grouped.has(tag)) {
                        grouped.set(tag, []);
                    }
                    grouped.get(tag)!.push({ method, path, operation });
                }
            }
        }

        return grouped;
    }

    /**
     * Gets description for a tag
     */
    private getTagDescription(spec: OpenAPISpec, tagName: string): string | undefined {
        const tag = spec.tags?.find(t => t.name === tagName);
        return tag?.description;
    }

    /**
     * Extracts the server base URL from collection items
     */
    private extractServerUrl(items: CollectionItem[]): string {
        for (const item of items) {
            if (item.item) {
                // Recursively search folders
                const url = this.extractServerUrl(item.item);
                if (url !== 'https://api.example.com') {
                    return url;
                }
            } else if (item.request) {
                const rawUrl = typeof item.request.url === 'string' 
                    ? item.request.url 
                    : item.request.url?.raw;
                
                if (rawUrl) {
                    try {
                        // Replace variables with placeholder to parse URL
                        const urlToParse = rawUrl.replace(/\{\{[^}]+\}\}/g, 'placeholder');
                        const urlObj = new URL(urlToParse);
                        return `${urlObj.protocol}//${urlObj.host}`;
                    } catch {
                        // Try to extract base URL with regex
                        const match = rawUrl.match(/^(https?:\/\/[^\/]+)/);
                        if (match) {
                            return match[1];
                        }
                    }
                }
            }
        }
        
        // Default fallback
        return 'https://api.example.com';
    }

    /**
     * Creates a collection item from an operation
     */
    private createRequestItem(
        op: { method: string; path: string; operation: Operation },
        baseUrl: string
    ): CollectionItem {
        const { method, path, operation } = op;
        // Convert OpenAPI path parameters {param} to app format {{param}}
        const convertedPath = path.replace(/\{([^}]+)\}/g, '{{$1}}');
        const fullUrl = `${baseUrl}${convertedPath}`;

        // Build headers from parameters
        const headers: HeaderRow[] = [];
        const queryParams: ParamRow[] = [];
        
        if (operation.parameters) {
            for (const param of operation.parameters) {
                if (param.in === 'header') {
                    headers.push({
                        id: this.generateId(),
                        key: param.name,
                        value: this.getExampleValue(param),
                        disabled: !(param.required ?? true)
                    });
                } else if (param.in === 'query') {
                    queryParams.push({
                        id: this.generateId(),
                        key: param.name,
                        value: this.getExampleValue(param),
                        disabled: !(param.required ?? true)
                    });
                }
            }
        }

        // Build URL with query params
        const urlObj: CollectionUrl = {
            raw: fullUrl,
            host: [baseUrl.replace(/^https?:\/\//, '').split('/')[0]],
            path: path.split('/').filter(Boolean),
            query: queryParams.length > 0 ? queryParams : undefined
        };

        // Build request body
        let body: CollectionBody | undefined;
        if (operation.requestBody?.content) {
            const contentTypes = Object.keys(operation.requestBody.content);
            const preferredType = contentTypes.find(t => t.includes('json')) || contentTypes[0];
            
            if (preferredType) {
                const mediaType = operation.requestBody.content[preferredType];
                
                // Add Content-Type header
                headers.push({
                    id: this.generateId(),
                    key: 'Content-Type',
                    value: preferredType,
                    disabled: false
                });

                body = {
                    mode: 'raw',
                    raw: this.generateExampleBody(mediaType),
                    options: {
                        raw: { language: preferredType.includes('json') ? 'json' : 'text' }
                    }
                };
            }
        }

        const requestId = this.generateId();
        const requestName = operation.summary || operation.operationId || `${method.toUpperCase()} ${path}`;

        const request: CollectionRequest = {
            id: requestId,
            name: requestName,
            method: method.toUpperCase(),
            url: urlObj,
            header: headers.length > 0 ? headers : undefined,
            body
        };

        return {
            id: this.generateId(),
            name: requestName,
            description: operation.description,
            request
        };
    }

    /**
     * Gets example value from a parameter
     */
    private getExampleValue(param: Parameter): string {
        if (param.example !== undefined) {
            return String(param.example);
        }
        if (param.schema?.example !== undefined) {
            return String(param.schema.example);
        }
        if (param.schema?.default !== undefined) {
            return String(param.schema.default);
        }
        if (param.schema?.enum?.length) {
            return String(param.schema.enum[0]);
        }
        
        // Return placeholder based on type
        const type = param.schema?.type || 'string';
        switch (type) {
            case 'integer':
            case 'number':
                return '0';
            case 'boolean':
                return 'true';
            default:
                return `{{${param.name}}}`;
        }
    }

    /**
     * Generates example body from media type
     */
    private generateExampleBody(mediaType: MediaType): string {
        if (mediaType.example !== undefined) {
            return typeof mediaType.example === 'string' 
                ? mediaType.example 
                : JSON.stringify(mediaType.example, null, 2);
        }

        if (mediaType.examples) {
            const firstExample = Object.values(mediaType.examples)[0];
            if (firstExample?.value !== undefined) {
                return typeof firstExample.value === 'string'
                    ? firstExample.value
                    : JSON.stringify(firstExample.value, null, 2);
            }
        }

        if (mediaType.schema) {
            return JSON.stringify(this.generateSchemaExample(mediaType.schema), null, 2);
        }

        return '{}';
    }

    /**
     * Generates example from schema
     */
    private generateSchemaExample(schema: Schema): unknown {
        if (schema.example !== undefined) {
            return schema.example;
        }

        if (schema.default !== undefined) {
            return schema.default;
        }

        if (schema.enum?.length) {
            return schema.enum[0];
        }

        switch (schema.type) {
            case 'object':
                if (schema.properties) {
                    const obj: Record<string, unknown> = {};
                    for (const [key, propSchema] of Object.entries(schema.properties)) {
                        obj[key] = this.generateSchemaExample(propSchema);
                    }
                    return obj;
                }
                return {};

            case 'array':
                if (schema.items) {
                    return [this.generateSchemaExample(schema.items)];
                }
                return [];

            case 'string':
                if (schema.format === 'date') {
                    return '2024-01-01';
                }
                if (schema.format === 'date-time') {
                    return '2024-01-01T00:00:00Z';
                }
                if (schema.format === 'email') {
                    return 'user@example.com';
                }
                if (schema.format === 'uuid') {
                    return '00000000-0000-0000-0000-000000000000';
                }
                return 'string';

            case 'integer':
            case 'number':
                return 0;

            case 'boolean':
                return true;

            default:
                return null;
        }
    }

    /**
     * Converts collection items to OpenAPI paths
     */
    private convertItemsToPaths(
        items: CollectionItem[],
        paths: Record<string, PathItem>,
        tags: Array<{ name: string; description?: string }>,
        currentTag?: string
    ): void {
        for (const item of items) {
            if (item.item) {
                // Folder becomes a tag
                tags.push({
                    name: item.name,
                    description: typeof item.description === 'string' ? item.description : undefined
                });
                this.convertItemsToPaths(item.item, paths, tags, item.name);
            } else if (item.request) {
                // Request becomes a path operation
                const url = typeof item.request.url === 'string' 
                    ? item.request.url 
                    : item.request.url?.raw || '/';
                
                // Extract path from URL
                let pathStr = '/';
                try {
                    const urlObj = new URL(url.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
                    pathStr = urlObj.pathname || '/';
                } catch {
                    const match = url.match(/(?:https?:\/\/[^\/]+)?(\/[^\?]*)/);
                    if (match) {
                        pathStr = match[1];
                    }
                }

                const method = (item.request.method || 'get').toLowerCase() as keyof PathItem;
                
                if (!paths[pathStr]) {
                    paths[pathStr] = {};
                }

                const operation: Operation = {
                    operationId: item.name.replace(/\s+/g, '_').toLowerCase(),
                    summary: item.name,
                    description: typeof item.description === 'string' ? item.description : undefined,
                    tags: currentTag ? [currentTag] : undefined,
                    responses: {
                        '200': { description: 'Successful response' }
                    }
                };

                (paths[pathStr] as any)[method] = operation;
            }
        }
    }
}

/**
 * Singleton instance of the Swagger transformer
 */
export const swaggerTransformer = new SwaggerTransformer();
