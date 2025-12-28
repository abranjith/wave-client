/**
 * Postman Collection Transformer
 * Transforms between Postman Collection v2.1.0 format and internal Collection type.
 */

import {
    PostmanCollection,
    PostmanItem,
    PostmanRequest,
    PostmanUrl,
    PostmanHeader,
    PostmanBody,
    PostmanResponse,
    PostmanQueryParam,
} from '../../types/external/postman';

import {
    Collection,
    CollectionItem,
    CollectionRequest,
    CollectionUrl,
    CollectionBody,
    CollectionResponse,
    HeaderRow,
    ParamRow,
    FormField,
    MultiPartFormField,
} from '../../types/collection';

import {
    BaseCollectionTransformer,
    CollectionFormatType,
    Result,
    ok,
    err,
} from './BaseCollectionTransformer';

/**
 * Transformer for Postman Collection v2.1.0 format
 */
export class PostmanCollectionTransformer extends BaseCollectionTransformer<PostmanCollection> {
    readonly formatType: CollectionFormatType = 'postman';
    readonly formatName = 'Postman Collection v2.1.0';
    readonly fileExtensions = ['.json', '.postman_collection.json'];

    /**
     * Validates if the given data is a valid Postman collection
     */
    validate(data: unknown): data is PostmanCollection {
        if (!data || typeof data !== 'object') {
            return false;
        }

        const obj = data as Record<string, unknown>;
        
        // Check for required Postman structure
        if (!obj.info || typeof obj.info !== 'object') {
            return false;
        }

        const info = obj.info as Record<string, unknown>;
        if (typeof info.name !== 'string') {
            return false;
        }

        // Check for schema field (Postman specific)
        if (info.schema && typeof info.schema === 'string') {
            return info.schema.includes('schema.getpostman.com') || 
                   info.schema.includes('schema.postman.com');
        }

        // If no schema, check for item array
        return Array.isArray(obj.item);
    }

    /**
     * Detects if the given JSON data is a Postman collection
     */
    canHandle(data: unknown): boolean {
        return this.validate(data);
    }

    /**
     * Transforms a Postman collection to internal Collection format
     */
    transformFrom(external: PostmanCollection, filename?: string): Result<Collection, string> {
        try {
            const collection: Collection = {
                info: {
                    waveId: this.generateId(),
                    name: external.info.name,
                    description: this.extractString(external.info.description),
                    version: this.waveVersion,
                },
                item: this.transformItems(external.item),
                filename,
            };

            return ok(collection);
        } catch (error) {
            return err(`Failed to transform Postman collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Transforms internal Collection to Postman collection format
     */
    transformTo(collection: Collection): Result<PostmanCollection, string> {
        try {
            const postmanCollection: PostmanCollection = {
                info: {
                    name: collection.info.name,
                    description: collection.info.description,
                    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
                },
                item: this.transformItemsToPostman(collection.item),
            };

            return ok(postmanCollection);
        } catch (error) {
            return err(`Failed to transform to Postman collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ========================================================================
    // Private: Transform FROM Postman
    // ========================================================================

    /**
     * Recursively transforms Postman items to internal CollectionItems
     */
    private transformItems(items: PostmanItem[]): CollectionItem[] {
        return items.map(item => this.transformItem(item));
    }

    /**
     * Transforms a single Postman item to internal CollectionItem
     */
    private transformItem(item: PostmanItem): CollectionItem {
        const collectionItem: CollectionItem = {
            id: item.id || this.generateId(),
            name: item.name || 'Unnamed',
            description: this.extractString(item.description),
        };

        // If it's a folder (has nested items)
        if (item.item && Array.isArray(item.item)) {
            collectionItem.item = this.transformItems(item.item);
        }

        // If it's a request
        if (item.request) {
            collectionItem.request = this.transformRequest(item.request);
        }

        // Transform responses if present
        if (item.response && Array.isArray(item.response)) {
            collectionItem.response = item.response.map(r => this.transformResponse(r));
        }

        return collectionItem;
    }

    /**
     * Transforms a Postman request to internal CollectionRequest
     */
    private transformRequest(request: PostmanRequest): CollectionRequest {
        return {
            method: request.method?.toUpperCase() || 'GET',
            url: this.transformUrl(request.url),
            header: this.transformHeaders(request.header),
            body: this.transformBody(request.body),
            description: this.extractString(request.description),
        };
    }

    /**
     * Transforms Postman URL to internal CollectionUrl
     */
    private transformUrl(url: PostmanUrl | string | undefined): CollectionUrl | string {
        if (!url) {
            return { raw: '' };
        }

        if (typeof url === 'string') {
            return url;
        }

        const collectionUrl: CollectionUrl = {
            raw: url.raw || this.buildRawUrl(url),
        };

        if (url.protocol) {
            collectionUrl.protocol = url.protocol;
        }

        if (url.host) {
            collectionUrl.host = Array.isArray(url.host) ? url.host : [url.host];
        }

        if (url.path) {
            collectionUrl.path = Array.isArray(url.path) ? url.path : [url.path];
        }

        if (url.query && url.query.length > 0) {
            collectionUrl.query = url.query.map(q => this.transformQueryParam(q));
        }

        return collectionUrl;
    }

    /**
     * Builds a raw URL string from URL parts
     */
    private buildRawUrl(url: PostmanUrl): string {
        const protocol = url.protocol || 'https';
        const host = Array.isArray(url.host) ? url.host.join('.') : (url.host || '');
        const port = url.port ? `:${url.port}` : '';
        const path = Array.isArray(url.path) ? '/' + url.path.join('/') : (url.path || '');
        
        return `${protocol}://${host}${port}${path}`;
    }

    /**
     * Transforms a Postman query parameter to internal ParamRow
     */
    private transformQueryParam(param: PostmanQueryParam): ParamRow {
        return {
            id: this.generateId(),
            key: param.key || '',
            value: param.value || '',
            disabled: param.disabled || false,
        };
    }

    /**
     * Transforms Postman headers to internal HeaderRow array
     */
    private transformHeaders(headers: PostmanHeader[] | string | undefined): HeaderRow[] {
        if (!headers) {
            return [];
        }

        if (typeof headers === 'string') {
            // Parse header string format
            return headers.split('\n').filter(h => h.includes(':')).map(h => {
                const [key, ...valueParts] = h.split(':');
                return {
                    id: this.generateId(),
                    key: key.trim(),
                    value: valueParts.join(':').trim(),
                    disabled: false,
                };
            });
        }

        return headers.map(h => ({
            id: this.generateId(),
            key: h.key,
            value: h.value,
            disabled: h.disabled || false,
        }));
    }

    /**
     * Transforms Postman body to internal CollectionBody
     */
    private transformBody(body: PostmanBody | undefined): CollectionBody | undefined {
        if (!body || body.disabled) {
            return undefined;
        }

        const collectionBody: CollectionBody = {
            mode: this.mapBodyMode(body.mode),
        };

        switch (body.mode) {
            case 'raw':
                collectionBody.raw = body.raw;
                if (body.options?.raw?.language) {
                    collectionBody.options = {
                        raw: { language: this.mapRawLanguage(body.options.raw.language) },
                    };
                }
                break;

            case 'urlencoded':
                collectionBody.urlencoded = body.urlencoded?.map(p => ({
                    id: this.generateId(),
                    key: p.key,
                    value: p.value || null,
                    disabled: p.disabled || false,
                })) as FormField[];
                break;

            case 'formdata':
                collectionBody.formdata = body.formdata?.map(p => ({
                    id: this.generateId(),
                    key: p.key,
                    value: p.value || null,
                    disabled: p.disabled || false,
                    fieldType: p.type === 'file' ? 'file' : 'text',
                })) as MultiPartFormField[];
                break;

            case 'file':
                // File mode - would need actual file data
                collectionBody.mode = 'file';
                break;
        }

        return collectionBody;
    }

    /**
     * Maps Postman body mode to internal mode
     */
    private mapBodyMode(mode: string | undefined): CollectionBody['mode'] {
        switch (mode) {
            case 'raw': return 'raw';
            case 'urlencoded': return 'urlencoded';
            case 'formdata': return 'formdata';
            case 'file': return 'file';
            default: return 'none';
        }
    }

    /**
     * Maps Postman raw language to internal language
     */
    private mapRawLanguage(language: string): 'json' | 'xml' | 'html' | 'text' | 'csv' {
        switch (language.toLowerCase()) {
            case 'json': return 'json';
            case 'xml': return 'xml';
            case 'html': return 'html';
            case 'csv': return 'csv';
            default: return 'text';
        }
    }

    /**
     * Transforms a Postman response to internal CollectionResponse
     */
    private transformResponse(response: PostmanResponse): CollectionResponse {
        return {
            id: response.id || this.generateId(),
            name: response.status || 'Response',
            originalRequest: response.originalRequest 
                ? this.transformRequest(response.originalRequest) 
                : undefined,
            status: response.status || '',
            code: response.code || 0,
            header: this.transformHeaders(response.header ?? undefined),
            body: response.body || undefined,
            responseTime: typeof response.responseTime === 'number' 
                ? response.responseTime 
                : undefined,
        };
    }

    // ========================================================================
    // Private: Transform TO Postman
    // ========================================================================

    /**
     * Recursively transforms internal items to Postman items
     */
    private transformItemsToPostman(items: CollectionItem[]): PostmanItem[] {
        return items.map(item => this.transformItemToPostman(item));
    }

    /**
     * Transforms a single internal item to Postman item
     */
    private transformItemToPostman(item: CollectionItem): PostmanItem {
        const postmanItem: PostmanItem = {
            id: item.id,
            name: item.name,
            description: item.description,
        };

        // If it's a folder
        if (item.item && Array.isArray(item.item)) {
            postmanItem.item = this.transformItemsToPostman(item.item);
        }

        // If it's a request
        if (item.request) {
            postmanItem.request = this.transformRequestToPostman(item.request);
        }

        // Transform responses
        if (item.response && Array.isArray(item.response)) {
            postmanItem.response = item.response.map(r => this.transformResponseToPostman(r));
        }

        return postmanItem;
    }

    /**
     * Transforms internal request to Postman request
     */
    private transformRequestToPostman(request: CollectionRequest): PostmanRequest {
        return {
            method: request.method,
            url: this.transformUrlToPostman(request.url),
            header: this.transformHeadersToPostman(request.header),
            body: this.transformBodyToPostman(request.body),
            description: request.description,
        };
    }

    /**
     * Transforms internal URL to Postman URL
     */
    private transformUrlToPostman(url: CollectionUrl | string): PostmanUrl | string {
        if (typeof url === 'string') {
            return url;
        }

        const postmanUrl: PostmanUrl = {
            raw: url.raw,
        };

        if (url.protocol) {
            postmanUrl.protocol = url.protocol;
        }

        if (url.host) {
            postmanUrl.host = url.host;
        }

        if (url.path) {
            postmanUrl.path = url.path;
        }

        if (url.query && url.query.length > 0) {
            postmanUrl.query = url.query.map(q => ({
                key: q.key,
                value: q.value,
                disabled: q.disabled,
            }));
        }

        return postmanUrl;
    }

    /**
     * Transforms internal headers to Postman headers
     */
    private transformHeadersToPostman(headers: HeaderRow[] | undefined): PostmanHeader[] {
        if (!headers) {
            return [];
        }

        return headers.map(h => ({
            key: h.key,
            value: h.value,
            disabled: h.disabled,
        }));
    }

    /**
     * Transforms internal body to Postman body
     */
    private transformBodyToPostman(body: CollectionBody | undefined): PostmanBody | undefined {
        if (!body || body.mode === 'none') {
            return undefined;
        }

        const postmanBody: PostmanBody = {
            mode: this.mapBodyModeToPostman(body.mode),
        };

        switch (body.mode) {
            case 'raw':
                postmanBody.raw = body.raw;
                if (body.options?.raw?.language) {
                    postmanBody.options = {
                        raw: { language: body.options.raw.language },
                    };
                }
                break;

            case 'urlencoded':
                postmanBody.urlencoded = body.urlencoded?.map(p => ({
                    key: p.key,
                    value: p.value || '',
                    disabled: p.disabled,
                }));
                break;

            case 'formdata':
                postmanBody.formdata = body.formdata?.map(p => ({
                    key: p.key,
                    value: typeof p.value === 'string' ? p.value : undefined,
                    disabled: p.disabled,
                    type: p.fieldType === 'file' ? 'file' : 'text',
                }));
                break;
        }

        return postmanBody;
    }

    /**
     * Maps internal body mode to Postman mode
     */
    private mapBodyModeToPostman(mode: CollectionBody['mode']): PostmanBody['mode'] {
        switch (mode) {
            case 'raw': return 'raw';
            case 'urlencoded': return 'urlencoded';
            case 'formdata': return 'formdata';
            case 'file': return 'file';
            default: return 'raw';
        }
    }

    /**
     * Transforms internal response to Postman response
     */
    private transformResponseToPostman(response: CollectionResponse): PostmanResponse {
        return {
            id: response.id,
            originalRequest: response.originalRequest 
                ? this.transformRequestToPostman(response.originalRequest) 
                : undefined,
            status: response.status,
            code: response.code,
            header: this.transformHeadersToPostman(response.header),
            body: response.body,
            responseTime: response.responseTime,
        };
    }
}

// Export singleton instance
export const postmanTransformer = new PostmanCollectionTransformer();
