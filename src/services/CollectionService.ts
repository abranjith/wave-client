import * as fs from 'fs';
import * as path from 'path';
import { BaseStorageService } from './BaseStorageService';
import { Collection, CollectionRequest } from '../types/collection';

/**
 * Service for managing collections (groups of API requests).
 */
export class CollectionService extends BaseStorageService {
    private readonly subDir = 'collections';

    /**
     * Gets the collections directory path using current settings.
     */
    private async getCollectionsDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    /**
     * Loads all collections from the collections directory.
     * @returns Array of collections with their filenames
     */
    async loadAll(): Promise<(Collection & { filename: string })[]> {
        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        const collections: (Collection & { filename: string })[] = [];
        const files = this.listJsonFiles(collectionsDir);

        for (const file of files) {
            const collection = await this.loadOne(file);
            if (collection) {
                collections.push({
                    ...collection,
                    filename: file
                });
            }
        }

        return collections;
    }

    /**
     * Loads a single collection by filename.
     * @param fileName The collection filename
     * @returns The collection or null if not found
     */
    async loadOne(fileName: string): Promise<Collection | null> {
        const collectionsDir = await this.getCollectionsDir();
        const filePath = path.join(collectionsDir, fileName);

        if (!this.fileExists(filePath)) {
            return null;
        }

        return await this.readJsonFileSecure<Collection | null>(filePath, null);
    }

    /**
     * Saves a collection to the collections directory.
     * @param collection The collection to save
     * @param fileName The filename to save as
     * @returns The saved collection
     */
    async save(collection: Collection, fileName: string): Promise<Collection> {
        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        const filePath = path.join(collectionsDir, fileName);
        await this.writeJsonFileSecure(filePath, collection);
        return collection;
    }

    /**
     * Saves a collection from JSON string content.
     * @param fileContent The JSON content of the collection
     * @param fileName The filename to save as
     * @returns The saved collection
     */
    async saveFromContent(fileContent: string, fileName: string): Promise<Collection> {
        const collection = JSON.parse(fileContent) as Collection;
        return this.save(collection, fileName);
    }

    /**
     * Saves or updates a request in a collection file under the specified folder path.
     * @param requestContent The JSON content of the request to save
     * @param requestName The name of the request
     * @param collectionFileName The collection file to save to
     * @param folderPath The folder path within the collection to save the request under
     * @param newCollectionName Optional name for a new collection if creating new
     * @returns The filename of the collection that was saved to
     */
    async saveRequest(
        requestContent: string,
        requestName: string,
        collectionFileName: string,
        folderPath: string[],
        newCollectionName?: string
    ): Promise<string> {
        let collection: Collection | null = null;
        let finalCollectionFileName = collectionFileName;

        if (newCollectionName) {
            // Create a new collection
            finalCollectionFileName = await this.generateUniqueFileName(newCollectionName);
            collection = this.createNewCollection(newCollectionName);
        } else if (collectionFileName) {
            // Load existing collection
            collection = await this.loadOne(collectionFileName);
        }

        if (!collection) {
            throw new Error(`Collection file ${collectionFileName} does not exist and no new collection name provided.`);
        }

        // Parse the request JSON
        const request = JSON.parse(requestContent) as CollectionRequest;

        // Navigate to the correct folder, creating it if necessary
        let items = collection.item;
        for (const folderName of folderPath) {
            let folder = items.find(i => i.name === folderName && i.item);
            if (!folder) {
                // Create the folder if it doesn't exist
                folder = {
                    name: folderName,
                    item: []
                };
                items.push(folder);
            }
            items = folder.item!;
        }

        // Check if a request with the same name exists in the target folder
        const existingRequestIndex = items.findIndex(i => i.name === requestName && i.request);
        if (existingRequestIndex !== -1) {
            // Overwrite existing request
            items[existingRequestIndex].request = request;
        } else {
            // Add new request
            items.push({
                name: requestName,
                request: request
            });
        }

        // Save the updated collection
        await this.save(collection, finalCollectionFileName);

        return finalCollectionFileName;
    }

    /**
     * Imports a collection from file content.
     * @param fileName The filename to save as
     * @param fileContent The JSON content of the collection
     * @returns The imported collection with filename
     */
    async import(fileName: string, fileContent: string): Promise<Collection & { filename: string }> {
        const collectionsDir = await this.getCollectionsDir();
        this.ensureDirectoryExists(collectionsDir);

        const filePath = path.join(collectionsDir, fileName);
        fs.writeFileSync(filePath, fileContent, 'utf8');

        const collection = JSON.parse(fileContent) as Collection;
        return { ...collection, filename: fileName };
    }

    /**
     * Creates a new empty collection with the given name.
     * @param name The name of the collection
     * @returns A new Collection object
     */
    private createNewCollection(name: string): Collection {
        return {
            info: {
                name: name || 'New Collection',
                schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
            },
            item: []
        };
    }

    /**
     * Generates a unique filename for a collection.
     * @param collectionName The desired collection name
     * @returns A unique filename
     */
    private async generateUniqueFileName(collectionName: string): Promise<string> {
        const collectionsDir = await this.getCollectionsDir();
        let baseFileName = collectionName || 'New Collection';
        baseFileName = baseFileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        let fileName = `${baseFileName}.json`;
        let counter = 1;
        
        while (this.fileExists(path.join(collectionsDir, fileName))) {
            fileName = `${baseFileName}_${counter}.json`;
            counter++;
            // Limit to 100 to prevent infinite loops
            if (counter > 100) {
                throw new Error('Unable to generate unique collection filename, please provide a unique name.');
            }
        }
        
        return fileName;
    }
}

// Export singleton instance for convenience
export const collectionService = new CollectionService();
