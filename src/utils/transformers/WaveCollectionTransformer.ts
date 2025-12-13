/**
 * Wave Collection Transformer
 * Identity transformer for Wave's native JSON format.
 * Handles validation and ensures the collection structure is correct.
 */

import { BaseCollectionTransformer, CollectionFormatType, Result, ok, err } from './BaseCollectionTransformer';
import { Collection, CollectionItem, CollectionInfo } from '../../types/collection';

/**
 * Transformer for Wave's native collection format.
 * Since Wave JSON is the internal format, this is essentially an identity
 * transformer with validation.
 */
export class WaveCollectionTransformer extends BaseCollectionTransformer<Collection> {
    readonly formatType: CollectionFormatType = 'wave';
    readonly formatName = 'Wave JSON';
    readonly fileExtensions = ['.json'];

    /**
     * Validates if the data is a valid Wave collection
     */
    validate(data: unknown): data is Collection {
        if (!data || typeof data !== 'object') {
            return false;
        }

        const obj = data as Record<string, unknown>;

        // Must have info object with name
        if (!obj.info || typeof obj.info !== 'object') {
            return false;
        }

        const info = obj.info as Record<string, unknown>;
        if (typeof info.name !== 'string') {
            return false;
        }

        // Must have item array
        if (!Array.isArray(obj.item)) {
            return false;
        }

        return true;
    }

    /**
     * Detects if data is a Wave collection (vs Postman or other formats)
     * Wave collections are identified by NOT having Postman-specific markers
     */
    canHandle(data: unknown): boolean {
        if (!this.validate(data)) {
            return false;
        }

        const obj = data as { info: { _postman_id?: unknown; schema?: unknown } };

        // Postman collections have _postman_id or schema containing 'postman'
        // Wave collections don't have these markers
        if (obj.info._postman_id) {
            return false;
        }

        if (typeof obj.info.schema === 'string' && obj.info.schema.includes('postman')) {
            return false;
        }

        return true;
    }

    /**
     * Transforms Wave JSON to Collection (identity transform with validation)
     */
    transformFrom(external: Collection, filename?: string): Result<Collection, string> {
        try {
            // Deep clone to avoid mutations
            const collection: Collection = JSON.parse(JSON.stringify(external));

            // Ensure info is properly structured
            if (!collection.info) {
                collection.info = {
                    name: filename?.replace(/\.json$/i, '') || 'Imported Collection'
                };
            }

            // Ensure item array exists
            if (!collection.item) {
                collection.item = [];
            }

            // Recursively ensure all items have IDs
            this.ensureItemIds(collection.item);

            return ok(collection);
        } catch (error) {
            return err(`Failed to parse Wave collection: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Transforms Collection to Wave JSON (identity transform)
     */
    transformTo(collection: Collection): Result<Collection, string> {
        try {
            // Deep clone to avoid mutations
            const exported: Collection = JSON.parse(JSON.stringify(collection));

            // Remove internal-only fields if any
            this.cleanExportData(exported);

            return ok(exported);
        } catch (error) {
            return err(`Failed to export Wave collection: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Recursively ensures all items have unique IDs
     */
    private ensureItemIds(items: CollectionItem[]): void {
        for (const item of items) {
            if (!item.id) {
                item.id = this.generateId();
            }
            if (item.item) {
                this.ensureItemIds(item.item);
            }
        }
    }

    /**
     * Cleans the collection data for export (removes internal-only fields)
     */
    private cleanExportData(collection: Collection): void {
        // Remove filename if present (internal use only)
        delete (collection as any).filename;

        // Recursively clean items if any by calling cleanItems
        // this.cleanItems(collection.item);
    }

    /**
     * Recursively cleans items for export
     */
    private cleanItems(items: CollectionItem[]): void {
        for (const item of items) {
            // Remove any internal-only fields from items
            // Currently none, but this is where they would be removed

            if (item.item) {
                this.cleanItems(item.item);
            }
        }
    }
}

/**
 * Singleton instance of the Wave transformer
 */
export const waveTransformer = new WaveCollectionTransformer();
