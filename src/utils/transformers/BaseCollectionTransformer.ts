/**
 * Base Collection Transformer
 * Abstract class that defines the interface for transforming between
 * external collection formats and the internal Collection type.
 */

import { Collection } from '../../types/collection';

/**
 * Result of a transformation operation
 */
export interface TransformResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * Supported collection format types
 */
export type CollectionFormatType = 'postman' | 'insomnia' | 'openapi' | 'curl';

/**
 * Abstract base class for collection transformers.
 * Each supported external format should implement this class.
 */
export abstract class BaseCollectionTransformer<TExternal> {
    /**
     * The format type this transformer handles
     */
    abstract readonly formatType: CollectionFormatType;

    /**
     * Human-readable name for the format
     */
    abstract readonly formatName: string;

    /**
     * File extensions associated with this format
     */
    abstract readonly fileExtensions: string[];

    /**
     * Transforms an external collection format to the internal Collection type.
     * @param external The external collection data
     * @param filename Optional filename for the collection
     * @returns TransformResult containing the internal Collection or an error
     */
    abstract transformFrom(external: TExternal, filename?: string): TransformResult<Collection>;

    /**
     * Transforms the internal Collection type to an external format.
     * @param collection The internal Collection to transform
     * @returns TransformResult containing the external format or an error
     */
    abstract transformTo(collection: Collection): TransformResult<TExternal>;

    /**
     * Validates if the given data is a valid external collection format.
     * @param data The data to validate
     * @returns True if valid, false otherwise
     */
    abstract validate(data: unknown): data is TExternal;

    /**
     * Detects if the given JSON data matches this transformer's format.
     * Used for auto-detection of collection format during import.
     * @param data The JSON data to check
     * @returns True if this transformer can handle the data
     */
    abstract canHandle(data: unknown): boolean;

    /**
     * Generates a unique ID for collection items
     */
    protected generateId(): string {
        return crypto.randomUUID();
    }

    /**
     * Safely extracts a string from a value that could be string or object
     */
    protected extractString(value: string | { content?: string } | undefined | null): string {
        if (!value) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        return value.content || '';
    }
}
