/**
 * Collection Transformers Index
 * Re-exports all collection transformers and provides factory functions
 */

import { BaseCollectionTransformer, TransformResult, CollectionFormatType } from './BaseCollectionTransformer';
import { PostmanCollectionTransformer, postmanTransformer } from './PostmanCollectionTransformer';
import { Collection } from '../../types/collection';

export { BaseCollectionTransformer, TransformResult, CollectionFormatType };
export { PostmanCollectionTransformer, postmanTransformer };

/**
 * Registry of all available transformers
 */
const transformerRegistry: BaseCollectionTransformer<unknown>[] = [
    postmanTransformer,
    // Add more transformers here as they are implemented
    // e.g., insomniaTransformer, openapiTransformer
];

/**
 * Gets a transformer by format type
 */
export function getTransformer(formatType: CollectionFormatType): BaseCollectionTransformer<unknown> | undefined {
    return transformerRegistry.find(t => t.formatType === formatType);
}

/**
 * Auto-detects the collection format and returns the appropriate transformer
 */
export function detectTransformer(data: unknown): BaseCollectionTransformer<unknown> | undefined {
    return transformerRegistry.find(t => t.canHandle(data));
}

/**
 * Transforms external collection data to internal Collection format
 * Auto-detects the format if not specified
 */
export function transformCollection(
    data: unknown,
    filename?: string,
    formatType?: CollectionFormatType
): TransformResult<Collection> {
    let transformer: BaseCollectionTransformer<unknown> | undefined;

    if (formatType) {
        transformer = getTransformer(formatType);
        if (!transformer) {
            return { success: false, error: `Unknown collection format: ${formatType}` };
        }
    } else {
        transformer = detectTransformer(data);
        if (!transformer) {
            return { success: false, error: 'Unable to detect collection format' };
        }
    }

    if (!transformer.validate(data)) {
        return { success: false, error: `Invalid ${transformer.formatName} format` };
    }

    return transformer.transformFrom(data, filename);
}

/**
 * Gets all supported format types
 */
export function getSupportedFormats(): CollectionFormatType[] {
    return transformerRegistry.map(t => t.formatType);
}

/**
 * Gets human-readable format names
 */
export function getSupportedFormatNames(): { type: CollectionFormatType; name: string }[] {
    return transformerRegistry.map(t => ({ type: t.formatType, name: t.formatName }));
}
