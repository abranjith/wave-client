/**
 * Collection Transformers Index
 * Re-exports all collection transformers and provides factory functions
 */

import { BaseCollectionTransformer, CollectionFormatType, ImportFormatType, ExportFormatType, Result, ok, err } from './BaseCollectionTransformer';
import { WaveCollectionTransformer, waveTransformer } from './WaveCollectionTransformer';
import { PostmanCollectionTransformer, postmanTransformer } from './PostmanCollectionTransformer';
import { HttpFileTransformer, httpFileTransformer } from './HttpFileTransformer';
import { SwaggerTransformer, swaggerTransformer } from './SwaggerTransformer';
import { Collection } from '../../types/collection';

// Re-export types and classes
export { BaseCollectionTransformer, CollectionFormatType, ImportFormatType, ExportFormatType, Result, ok, err };
export { WaveCollectionTransformer, waveTransformer };
export { PostmanCollectionTransformer, postmanTransformer };
export { HttpFileTransformer, httpFileTransformer };
export { SwaggerTransformer, swaggerTransformer };

/**
 * Registry of all available transformers
 * Order matters - more specific formats should come first for auto-detection
 */
const transformerRegistry: BaseCollectionTransformer<unknown>[] = [
    swaggerTransformer,    // Check OpenAPI/Swagger first (has openapi/swagger field)
    postmanTransformer,    // Check Postman second (has _postman_id or postman schema)
    waveTransformer,       // Wave is last for JSON (it's the fallback for valid collections)
    httpFileTransformer,   // HTTP files are strings, checked separately
];

/**
 * Import format options for UI dropdowns
 */
export const IMPORT_FORMAT_OPTIONS: Array<{ value: ImportFormatType; label: string; extensions: string[] }> = [
    { value: 'wave', label: 'Wave JSON', extensions: ['.json'] },
    { value: 'postman', label: 'Postman JSON', extensions: ['.json'] },
    { value: 'http', label: 'HTTP File', extensions: ['.http', '.rest'] },
    { value: 'swagger', label: 'OpenAPI / Swagger', extensions: ['.json', '.yaml', '.yml'] },
];

/**
 * Export format options for UI dropdowns
 */
export const EXPORT_FORMAT_OPTIONS: Array<{ value: ExportFormatType; label: string; extension: string }> = [
    { value: 'wave', label: 'Wave JSON', extension: '.json' },
    { value: 'postman', label: 'Postman JSON', extension: '.postman_collection.json' },
];

/**
 * Gets a transformer by format type
 */
export function getTransformer(formatType: CollectionFormatType): BaseCollectionTransformer<unknown> | undefined {
    return transformerRegistry.find(t => t.formatType === formatType);
}

/**
 * Auto-detects the collection format and returns the appropriate transformer
 * @param data The data to detect format for (JSON object or string for HTTP files)
 */
export function detectTransformer(data: unknown): BaseCollectionTransformer<unknown> | undefined {
    // For string data, check if it's an HTTP file
    if (typeof data === 'string') {
        if (httpFileTransformer.canHandle(data)) {
            return httpFileTransformer;
        }
        return undefined;
    }

    // For object data, check JSON-based formats
    return transformerRegistry.find(t => t.formatType !== 'http' && t.canHandle(data));
}

/**
 * Transforms external collection data to internal Collection format
 * Auto-detects the format if not specified
 * @param data The external data (JSON object or string for HTTP files)
 * @param filename Optional filename for the collection
 * @param formatType Optional format type hint
 */
export function transformCollection(
    data: unknown,
    filename?: string,
    formatType?: CollectionFormatType
): Result<Collection, string> {
    let transformer: BaseCollectionTransformer<unknown> | undefined;

    if (formatType) {
        transformer = getTransformer(formatType);
        if (!transformer) {
            return err(`Unknown collection format: ${formatType}`);
        }
    } else {
        transformer = detectTransformer(data);
        if (!transformer) {
            return err('Unable to detect collection format. Please select the correct format type.');
        }
    }

    if (!transformer.validate(data)) {
        return err(`Invalid ${transformer.formatName} format`);
    }

    return transformer.transformFrom(data, filename);
}

/**
 * Transforms internal Collection to external format
 * @param collection The collection to export
 * @param formatType The target format type
 */
export function exportCollection(
    collection: Collection,
    formatType: ExportFormatType
): Result<unknown, string> {
    const transformer = getTransformer(formatType);
    if (!transformer) {
        return err(`Unknown export format: ${formatType}`);
    }

    return transformer.transformTo(collection);
}

/**
 * Gets all supported import format types
 */
export function getSupportedImportFormats(): ImportFormatType[] {
    return IMPORT_FORMAT_OPTIONS.map(o => o.value);
}

/**
 * Gets all supported export format types
 */
export function getSupportedExportFormats(): ExportFormatType[] {
    return EXPORT_FORMAT_OPTIONS.map(o => o.value);
}

/**
 * Gets human-readable format names for import
 */
export function getSupportedFormatNames(): { type: CollectionFormatType; name: string }[] {
    return transformerRegistry.map(t => ({ type: t.formatType, name: t.formatName }));
}

/**
 * Detects format type from filename extension
 */
export function detectFormatFromFilename(filename: string): ImportFormatType | undefined {
    const lowerFilename = filename.toLowerCase();
    
    // Check for .http or .rest files
    if (lowerFilename.endsWith('.http') || lowerFilename.endsWith('.rest')) {
        return 'http';
    }
    
    // Check for postman collection naming convention
    if (lowerFilename.includes('postman')) {
        return 'postman';
    }
    
    // YAML files are likely OpenAPI/Swagger
    if (lowerFilename.includes('swagger') || lowerFilename.endsWith('.yaml') || lowerFilename.endsWith('.yml')) {
        return 'swagger';
    }
    
    // JSON files need content inspection, return undefined for auto-detection
    return undefined;
}
