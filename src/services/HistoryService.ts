import * as path from 'path';
import * as crypto from 'crypto';
import { BaseStorageService } from './BaseStorageService';
import { ParsedRequest } from '../types/collection';

/**
 * Service for managing request history.
 * Maintains a rolling history of recently executed requests.
 */
export class HistoryService extends BaseStorageService {
    private readonly subDir = 'history';

    /**
     * Gets the history directory path using current settings.
     */
    private async getHistoryDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    /**
     * Gets the max history items from settings.
     */
    private async getMaxHistoryItems(): Promise<number> {
        const settings = await this.getSettings();
        return settings.maxHistoryItems || 10;
    }

    /**
     * Loads all history items, sorted by most recent first.
     * @returns Array of parsed requests from history
     */
    async loadAll(): Promise<ParsedRequest[]> {
        const historyDir = await this.getHistoryDir();
        this.ensureDirectoryExists(historyDir);

        const history: (ParsedRequest & { baseFileName: string })[] = [];
        const files = this.listJsonFiles(historyDir);

        for (const file of files) {
            try {
                const filePath = path.join(historyDir, file);
                const requestData = await this.readJsonFileSecure<ParsedRequest | null>(filePath, null);
                if (requestData) {
                    const baseFileName = path.basename(file, '.json');
                    history.push({ ...requestData, baseFileName });
                }
            } catch (error: any) {
                console.error(`Error loading history file ${file}:`, error.message);
            }
        }

        // Sort by filename number (descending - most recent first)
        history.sort((a, b) => {
            const aNum = parseInt(a.baseFileName);
            const bNum = parseInt(b.baseFileName);
            return bNum - aNum;
        });

        return history;
    }

    /**
     * Saves a request to history.
     * - Removes duplicates based on request content
     * - Maintains maximum history items limit
     * - Uses sequential numbering for files
     * @param requestContent The JSON content of the request to save
     */
    async save(requestContent: string): Promise<void> {
        const request = JSON.parse(requestContent) as ParsedRequest;
        const historyDir = await this.getHistoryDir();
        const maxHistoryItems = await this.getMaxHistoryItems();
        this.ensureDirectoryExists(historyDir);

        // Get all existing history files
        const files = this.listJsonFiles(historyDir)
            .map(file => {
                const num = parseInt(path.basename(file, '.json'));
                return { file, num };
            })
            .filter(item => !isNaN(item.num))
            .sort((a, b) => a.num - b.num);

        // Check for duplicate content
        const incomingContent = this.getRequestSignature(request);
        let duplicateIndex = -1;

        for (let i = 0; i < files.length; i++) {
            try {
                const filePath = path.join(historyDir, files[i].file);
                const existingRequest = await this.readJsonFileSecure<ParsedRequest | null>(filePath, null);
                if (existingRequest) {
                    const existingContent = this.getRequestSignature(existingRequest);
                    if (incomingContent === existingContent) {
                        duplicateIndex = i;
                        break;
                    }
                }
            } catch (error: any) {
                console.error(`Error reading history file ${files[i].file}:`, error.message);
            }
        }

        // Remove duplicate file if found
        if (duplicateIndex !== -1) {
            const duplicateFile = path.join(historyDir, files[duplicateIndex].file);
            this.deleteFile(duplicateFile);
            files.splice(duplicateIndex, 1);
        }

        // Enforce maximum history items - remove oldest if at limit
        if (files.length >= maxHistoryItems) {
            const oldestFile = path.join(historyDir, files[0].file);
            this.deleteFile(oldestFile);
            files.shift();
        }

        // Renumber all files to maintain sequence (1.json, 2.json, etc.)
        await this.renumberHistoryFiles(historyDir, files);

        // Save the new request with the next available number
        const nextNum = files.length + 1;
        const newFilePath = path.join(historyDir, `${nextNum}.json`);
        
        // Change request id to new id for uniqueness
        request.id = `${request.id}_${Date.now()}_hist_${Math.random().toString(36).substring(2, 8)}`;
        await this.writeJsonFileSecure(newFilePath, request);
    }

    /**
     * Creates a signature string for a request to check for duplicates.
     * @param request The request to create a signature for
     * @returns A JSON string representing the request's unique content
     */
    private getRequestSignature(request: ParsedRequest): string {
        return JSON.stringify({
            method: request.method,
            url: request.url,
            params: request.params,
            headers: request.headers,
            body: request.body
        });
    }

    /**
     * Renumbers history files to maintain sequential ordering.
     * Uses temporary files to avoid conflicts during renaming.
     * @param historyDir The history directory path
     * @param files The current file list
     */
    private async renumberHistoryFiles(
        historyDir: string,
        files: { file: string; num: number }[]
    ): Promise<void> {
        const tempFiles: { oldPath: string; newNum: number }[] = [];
        
        for (let i = 0; i < files.length; i++) {
            const oldPath = path.join(historyDir, files[i].file);
            const newNum = i + 1;
            if (files[i].num !== newNum) {
                tempFiles.push({ oldPath, newNum });
            }
        }

        // Rename files to temporary names first to avoid conflicts
        const tempRenamed: { tempPath: string; finalPath: string }[] = [];
        for (const item of tempFiles) {
            const tempPath = path.join(historyDir, `temp_${crypto.randomUUID()}_${item.newNum}.json`);
            this.renameFile(item.oldPath, tempPath);
            tempRenamed.push({
                tempPath,
                finalPath: path.join(historyDir, `${item.newNum}.json`)
            });
        }

        // Rename from temporary names to final sequential names
        for (const item of tempRenamed) {
            this.renameFile(item.tempPath, item.finalPath);
        }
    }
}

// Export singleton instance for convenience
export const historyService = new HistoryService();
