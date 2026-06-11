/**
 * Swagger/OpenAPI Transformer
 * Transforms OpenAPI (Swagger) specifications to Wave Collection format.
 * 
 * Supports OpenAPI 3.x and Swagger 2.0 specifications.
 * Creates requests from path operations and organizes them by tags.
 */

import { BaseCollectionTransformer, CollectionFormatType, Result, ok, err } from './BaseCollectionTransformer';
import { dereference, validate as scalarValidate } from '@scalar/openapi-parser';
import type { OpenAPI } from '@scalar/openapi-types';
import { Collection, CollectionItem, CollectionRequest, CollectionUrl, CollectionBody, HeaderRow, ParamRow } from '../../types/collection';
import { CURRENT_COLLECTION_SCHEMA_VERSION } from '../../schemas/collectionSchema';

type OpenApiObject = Record<string, unknown>;

interface TaggedOperation {
    method: string;
    path: string;
    operation: OpenApiObject;
    parameters: OpenApiObject[];
}

/**
 * Transformer for OpenAPI/Swagger specifications
 */
export class SwaggerTransformer extends BaseCollectionTransformer<unknown> {
    readonly formatType: CollectionFormatType = 'swagger';
    readonly formatName = 'OpenAPI / Swagger';
    readonly fileExtensions = ['.json', '.yaml', '.yml'];

    /**
     * Validates if the data is a valid OpenAPI specification
     */
    validate(data: unknown): data is unknown {
        if (typeof data === 'string') {
            return this.looksLikeOpenApiString(data);
        }

        if (!data || typeof data !== 'object') {
            return false;
        }

        return this.hasOpenApiShape(data as OpenApiObject);
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
    async transformFrom(external: unknown, filename?: string): Promise<Result<Collection, string>> {
        try {
            const normalized = this.normalizeParserInput(external);
            if (!normalized.isOk) {
                return err(normalized.error);
            }

            const validated = await scalarValidate(normalized.value);
            if (!validated.valid) {
                return err(`Invalid OpenAPI specification: ${this.formatParserErrors(validated.errors)}`);
            }

            const dereferenced = dereference(normalized.value);
            if (!dereferenced.schema) {
                return err(`Failed to parse OpenAPI specification: ${this.formatParserErrors(dereferenced.errors)}`);
            }

            const spec = dereferenced.schema as OpenAPI.Document & OpenApiObject;
            const collectionName = this.getDocumentTitle(spec) || filename?.replace(/\.(json|yaml|yml|txt)$/i, '') || 'Imported API';
            const baseUrl = this.getBaseUrl(spec);

            // Group operations by tags
            const taggedOperations = this.groupOperationsByTag(spec);

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
                        description: this.getTagDescription(spec, tag),
                        item: operations.map(op => this.createRequestItem(op, baseUrl))
                    });
                }
            }

            const collection: Collection = {
                info: {
                    waveId: this.generateId(),
                    name: collectionName,
                    description: this.getDocumentDescription(spec),
                    version: CURRENT_COLLECTION_SCHEMA_VERSION,
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
    async transformTo(collection: Collection): Promise<Result<OpenAPI.Document, string>> {
        try {
            const paths: Record<string, OpenApiObject> = {};
            const tags: Array<{ name: string; description?: string }> = [];

            // Convert items to paths
            this.convertItemsToPaths(collection.item, paths, tags);

            // Extract server URL from first request item
            const serverUrl = this.extractServerUrl(collection.item);

            const spec: OpenAPI.Document = {
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
    private getBaseUrl(spec: OpenApiObject): string {
        // OpenAPI 3.x
        const servers = this.readArray(spec.servers).map((entry) => this.readObject(entry)).filter(Boolean) as OpenApiObject[];

        if (servers.length > 0) {
            const firstServer = servers[0];
            let url = this.readString(firstServer.url) || 'https://api.example.com';
            
            // Replace server variables with defaults
            const variables = this.readObject(firstServer.variables);
            if (variables) {
                for (const [key, variable] of Object.entries(variables)) {
                    const variableObj = this.readObject(variable);
                    const defaultValue = variableObj ? this.readString(variableObj.default) : undefined;
                    if (defaultValue) {
                        url = url.replace(`{${key}}`, defaultValue);
                    }
                }
            }
            
            return url;
        }

        // Swagger 2.0
        const host = this.readString(spec.host);
        if (host) {
            const schemes = this.readStringArray(spec.schemes);
            const scheme = schemes[0] || 'https';
            const basePath = this.readString(spec.basePath) || '';
            return `${scheme}://${host}${basePath}`;
        }

        return 'https://api.example.com';
    }

    /**
     * Groups operations by their tags
     */
    private groupOperationsByTag(spec: OpenApiObject): Map<string, TaggedOperation[]> {
        const grouped = new Map<string, TaggedOperation[]>();
        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

        const paths = this.readObject(spec.paths);
        if (!paths) {
            return grouped;
        }

        for (const [path, rawPathItem] of Object.entries(paths)) {
            const pathItem = this.readObject(rawPathItem);
            if (!pathItem) {
                continue;
            }

            const pathParameters = this.readParameterArray(pathItem.parameters);

            for (const method of methods) {
                const operation = this.readObject(pathItem[method]);
                if (!operation) {
                    continue;
                }

                const operationParameters = this.readParameterArray(operation.parameters);
                const mergedParameters = this.mergeParameters(pathParameters, operationParameters);

                const tags = this.readStringArray(operation.tags);
                const effectiveTags = tags.length ? tags : ['__untagged__'];
                
                for (const tag of effectiveTags) {
                    if (!grouped.has(tag)) {
                        grouped.set(tag, []);
                    }
                    grouped.get(tag)!.push({ method, path, operation, parameters: mergedParameters });
                }
            }
        }

        return grouped;
    }

    /**
     * Gets description for a tag
     */
    private getTagDescription(spec: OpenApiObject, tagName: string): string | undefined {
        const tags = this.readArray(spec.tags);
        const tag = tags
            .map((entry) => this.readObject(entry))
            .find((entry) => entry && this.readString(entry.name) === tagName);

        return tag ? this.readString(tag.description) : undefined;
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
        op: TaggedOperation,
        baseUrl: string
    ): CollectionItem {
        const { method, path, operation, parameters } = op;
        // Convert OpenAPI path parameters {param} to app format {{param}}
        const convertedPath = path.replace(/\{([^}]+)\}/g, '{{$1}}');
        const fullUrl = `${baseUrl}${convertedPath}`;

        // Build headers from parameters
        const headers: HeaderRow[] = [];
        const queryParams: ParamRow[] = [];
        
        for (const param of parameters) {
            const location = this.readString(param.in);
            const key = this.readString(param.name);
            if (!key) {
                continue;
            }

            const required = this.readBoolean(param.required, true);

            if (location === 'header') {
                    headers.push({
                        id: this.generateId(),
                        key,
                        value: this.getExampleValue(param),
                        disabled: !required
                    });
                } else if (location === 'query') {
                    queryParams.push({
                        id: this.generateId(),
                        key,
                        value: this.getExampleValue(param),
                        disabled: !required
                    });
                }
        }

        const body = this.buildRequestBody(operation, parameters, headers);

        // Build URL with query params
        const urlObj: CollectionUrl = {
            raw: fullUrl,
            host: [baseUrl.replace(/^https?:\/\//, '').split('/')[0]],
            path: convertedPath.split('/').filter(Boolean),
            query: queryParams.length > 0 ? queryParams : undefined
        };

        const requestId = this.generateId();
        const requestName = this.readString(operation.summary) || this.readString(operation.operationId) || `${method.toUpperCase()} ${path}`;

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
            description: this.readString(operation.description),
            request
        };
    }

    /**
     * Gets example value from a parameter
     */
    private getExampleValue(param: OpenApiObject): string {
        if (param.example !== undefined) {
            return String(param.example);
        }

        const schema = this.readObject(param.schema);
        if (schema?.example !== undefined) {
            return String(schema.example);
        }
        if (schema?.default !== undefined) {
            return String(schema.default);
        }
        const schemaEnum = this.readArray(schema?.enum);
        if (schemaEnum.length) {
            return String(schemaEnum[0]);
        }
        
        // Return placeholder based on type
        const type = this.readString(schema?.type) || this.readString(param.type) || 'string';
        switch (type) {
            case 'integer':
            case 'number':
                return '0';
            case 'boolean':
                return 'true';
            default:
                return `{{${this.readString(param.name) || 'value'}}}`;
        }
    }

    /**
     * Generates example body from media type
     */
    private generateExampleBody(mediaType: OpenApiObject): string {
        if (mediaType.example !== undefined) {
            return typeof mediaType.example === 'string' 
                ? mediaType.example 
                : JSON.stringify(mediaType.example, null, 2);
        }

        const examples = this.readObject(mediaType.examples);
        if (examples) {
            const firstExample = this.readObject(Object.values(examples)[0]);
            if (firstExample?.value !== undefined) {
                return typeof firstExample.value === 'string'
                    ? firstExample.value
                    : JSON.stringify(firstExample.value, null, 2);
            }
        }

        const schema = this.readObject(mediaType.schema);
        if (schema) {
            return JSON.stringify(this.generateSchemaExample(schema), null, 2);
        }

        return '{}';
    }

    /**
     * Generates example from schema
     */
    private generateSchemaExample(schema: OpenApiObject): unknown {
        if (schema.example !== undefined) {
            return schema.example;
        }

        if (schema.default !== undefined) {
            return schema.default;
        }

        const enumValues = this.readArray(schema.enum);
        if (enumValues.length) {
            return enumValues[0];
        }

        const oneOf = this.readArray(schema.oneOf);
        if (oneOf.length) {
            const firstSchema = this.readObject(oneOf[0]);
            if (firstSchema) {
                return this.generateSchemaExample(firstSchema);
            }
        }

        const anyOf = this.readArray(schema.anyOf);
        if (anyOf.length) {
            const firstSchema = this.readObject(anyOf[0]);
            if (firstSchema) {
                return this.generateSchemaExample(firstSchema);
            }
        }

        const allOf = this.readArray(schema.allOf);
        if (allOf.length) {
            const merged = allOf
                .map((entry) => this.readObject(entry))
                .filter(Boolean)
                .map((entry) => this.generateSchemaExample(entry as OpenApiObject));

            if (merged.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))) {
                return Object.assign({}, ...merged);
            }
            if (merged.length) {
                return merged[0];
            }
        }

        const derivedType = this.readString(schema.type) || (this.readObject(schema.properties) ? 'object' : undefined) || (schema.items ? 'array' : undefined);

        switch (derivedType) {
            case 'object':
                if (this.readObject(schema.properties)) {
                    const obj: Record<string, unknown> = {};
                    for (const [key, propSchema] of Object.entries(this.readObject(schema.properties) as OpenApiObject)) {
                        const propertySchema = this.readObject(propSchema);
                        if (propertySchema) {
                            obj[key] = this.generateSchemaExample(propertySchema);
                        }
                    }
                    return obj;
                }

                const additionalProperties = this.readObject(schema.additionalProperties);
                if (additionalProperties) {
                    return { key: this.generateSchemaExample(additionalProperties) };
                }

                return {};

            case 'array':
                if (schema.items) {
                    const itemSchema = this.readObject(schema.items);
                    if (itemSchema) {
                        return [this.generateSchemaExample(itemSchema)];
                    }
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
        paths: Record<string, OpenApiObject>,
        tags: Array<{ name: string; description?: string }>,
        currentTag?: string
    ): void {
        for (const item of items) {
            if (item.item) {
                // Folder becomes a tag
                if (!tags.some((tag) => tag.name === item.name)) {
                    tags.push({
                        name: item.name,
                        description: typeof item.description === 'string' ? item.description : undefined
                    });
                }
                this.convertItemsToPaths(item.item, paths, tags, item.name);
            } else if (item.request) {
                // Request becomes a path operation
                const url = typeof item.request.url === 'string' 
                    ? item.request.url 
                    : item.request.url?.raw || '/';
                
                // Extract path from URL
                let pathStr = '/';
                const match = url.match(/(?:https?:\/\/[^\/]+)?(\/[^\?]*)/);
                if (match) {
                    pathStr = match[1];
                } else {
                    try {
                        const urlObj = new URL(url.replace(/\{\{[^}]+\}\}/g, 'placeholder'));
                        pathStr = urlObj.pathname || '/';
                    } catch {
                        pathStr = '/';
                    }
                }

                pathStr = pathStr.replace(/\{\{([^}]+)\}\}/g, '{$1}');

                const method = ((item.request as CollectionRequest).method || 'get').toLowerCase();
                
                if (!paths[pathStr]) {
                    paths[pathStr] = {};
                }

                const operation: OpenApiObject = {
                    operationId: item.name.replace(/\s+/g, '_').toLowerCase(),
                    summary: item.name,
                    description: typeof item.description === 'string' ? item.description : undefined,
                    tags: currentTag ? [currentTag] : undefined,
                    responses: {
                        '200': { description: 'Successful response' }
                    }
                };

                (paths[pathStr] as OpenApiObject)[method] = operation;
            }
        }
    }

    private buildRequestBody(operation: OpenApiObject, parameters: OpenApiObject[], headers: HeaderRow[]): CollectionBody | undefined {
        const requestBody = this.readObject(operation.requestBody);
        const content = this.readObject(requestBody?.content);

        if (content) {
            const contentTypes = Object.keys(content);
            const preferredType = contentTypes.find((contentType) => contentType.includes('json')) || contentTypes[0];

            if (!preferredType) {
                return undefined;
            }

            const mediaType = this.readObject(content[preferredType]);
            if (!mediaType) {
                return undefined;
            }

            this.ensureContentTypeHeader(headers, preferredType);

            return {
                mode: 'raw',
                raw: this.generateExampleBody(mediaType),
                options: {
                    raw: { language: preferredType.includes('json') ? 'json' : 'text' }
                }
            };
        }

        const bodyParameter = parameters.find((param) => this.readString(param.in) === 'body');
        if (!bodyParameter) {
            return undefined;
        }

        const schema = this.readObject(bodyParameter.schema);
        const hasExample = bodyParameter.example !== undefined;
        if (!schema && !hasExample) {
            return undefined;
        }

        const consumes = this.readStringArray(operation.consumes);
        const contentType = consumes[0] || 'application/json';
        this.ensureContentTypeHeader(headers, contentType);

        return {
            mode: 'raw',
            raw: this.generateExampleBody({ schema, example: bodyParameter.example }),
            options: {
                raw: { language: contentType.includes('json') ? 'json' : 'text' }
            }
        };
    }

    private ensureContentTypeHeader(headers: HeaderRow[], contentType: string): void {
        const hasHeader = headers.some((header) => header.key.toLowerCase() === 'content-type');
        if (hasHeader) {
            return;
        }

        headers.push({
            id: this.generateId(),
            key: 'Content-Type',
            value: contentType,
            disabled: false
        });
    }

    private mergeParameters(pathParameters: OpenApiObject[], operationParameters: OpenApiObject[]): OpenApiObject[] {
        const merged = new Map<string, OpenApiObject>();

        for (const param of pathParameters) {
            const key = `${this.readString(param.in) || ''}:${this.readString(param.name) || ''}`;
            if (key !== ':') {
                merged.set(key, param);
            }
        }

        for (const param of operationParameters) {
            const key = `${this.readString(param.in) || ''}:${this.readString(param.name) || ''}`;
            if (key !== ':') {
                merged.set(key, param);
            }
        }

        return Array.from(merged.values());
    }

    private readParameterArray(value: unknown): OpenApiObject[] {
        return this.readArray(value)
            .map((entry) => this.readObject(entry))
            .filter(Boolean) as OpenApiObject[];
    }

    private looksLikeOpenApiString(raw: string): boolean {
        return /(\"openapi\"\s*:|\"swagger\"\s*:|\bopenapi\s*:|\bswagger\s*:)/i.test(raw);
    }

    private hasOpenApiShape(obj: OpenApiObject): boolean {
        if (!obj.openapi && !obj.swagger) {
            return false;
        }

        const info = this.readObject(obj.info);
        const paths = this.readObject(obj.paths);

        return Boolean(info && paths);
    }

    private getDocumentTitle(spec: OpenApiObject): string | undefined {
        const info = this.readObject(spec.info);
        return info ? this.readString(info.title) : undefined;
    }

    private getDocumentDescription(spec: OpenApiObject): string | undefined {
        const info = this.readObject(spec.info);
        return info ? this.readString(info.description) : undefined;
    }

    private normalizeParserInput(external: unknown): Result<string, string> {
        if (typeof external === 'string') {
            return ok(external);
        }

        if (!external || typeof external !== 'object') {
            return err('OpenAPI input must be a JSON/YAML string or object.');
        }

        try {
            return ok(JSON.stringify(external));
        } catch (stringifyError) {
            return err(`Failed to serialize OpenAPI object: ${stringifyError instanceof Error ? stringifyError.message : String(stringifyError)}`);
        }
    }

    private formatParserErrors(errors: unknown): string {
        if (!Array.isArray(errors) || errors.length === 0) {
            return 'Unknown parsing error';
        }

        const [first] = errors;
        if (typeof first === 'string') {
            return first;
        }

        if (this.readObject(first)) {
            const firstObj = first as OpenApiObject;
            const message = this.readString(firstObj.message);
            if (message) {
                return message;
            }
            return JSON.stringify(firstObj);
        }

        return String(first);
    }

    private readObject(value: unknown): OpenApiObject | undefined {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return value as OpenApiObject;
    }

    private readArray(value: unknown): unknown[] {
        return Array.isArray(value) ? value : [];
    }

    private readString(value: unknown): string | undefined {
        return typeof value === 'string' ? value : undefined;
    }

    private readStringArray(value: unknown): string[] {
        return this.readArray(value).filter((entry): entry is string => typeof entry === 'string');
    }

    private readBoolean(value: unknown, fallback: boolean): boolean {
        return typeof value === 'boolean' ? value : fallback;
    }
}

/**
 * Singleton instance of the Swagger transformer
 */
export const swaggerTransformer = new SwaggerTransformer();
