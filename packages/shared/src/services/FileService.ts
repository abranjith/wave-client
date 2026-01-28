import * as fs from 'fs';
import * as path from 'path';

import { BaseStorageService } from './BaseStorageService';
import type { FileReference } from '@wave-client/core';

/**
 * Result type for file operations
 */
export interface FileResult<T> {
    isOk: boolean;
    value?: T;
    error?: string;
}

/**
 * Service for reading files referenced in request bodies.
 * Handles both absolute and relative paths, with relative paths resolved
 * against the app's data directory.
 */
export class FileService extends BaseStorageService {
    private readonly filesDir = 'files';

    /**
     * Gets the files directory path using current settings.
     * Used for storing uploaded files with relative paths.
     */
    private async getFilesDirectory(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.filesDir);
    }

    /**
     * Resolves a file path based on its path type.
     * Relative paths are resolved against the app's files directory.
     * @param filePath The file path to resolve
     * @param pathType Whether the path is absolute or relative
     * @returns The resolved absolute path
     */
    async resolvePath(filePath: string, pathType: 'absolute' | 'relative'): Promise<string> {
        if (pathType === 'absolute') {
            return filePath;
        }
        const filesDir = await this.getFilesDirectory();
        return path.join(filesDir, filePath);
    }

    /**
     * Resolves a FileReference to its full path.
     * @param ref The FileReference to resolve
     * @returns The resolved absolute path
     */
    async resolveFileReference(ref: FileReference): Promise<string> {
        return this.resolvePath(ref.path, ref.pathType);
    }

    /**
     * Reads a file as text.
     * @param filePath The file path (absolute or relative)
     * @param pathType Whether the path is absolute or relative
     * @returns Result with file contents or error message
     */
    async readFile(filePath: string, pathType: 'absolute' | 'relative' = 'absolute'): Promise<FileResult<string>> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            
            if (!fs.existsSync(resolvedPath)) {
                return {
                    isOk: false,
                    error: `File not found: ${resolvedPath}`
                };
            }

            const content = fs.readFileSync(resolvedPath, 'utf8');
            return {
                isOk: true,
                value: content
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isOk: false,
                error: `Failed to read file: ${message}`
            };
        }
    }

    /**
     * Reads a file as binary data.
     * @param filePath The file path (absolute or relative)
     * @param pathType Whether the path is absolute or relative
     * @returns Result with file contents as Uint8Array or error message
     */
    async readFileAsBinary(filePath: string, pathType: 'absolute' | 'relative' = 'absolute'): Promise<FileResult<Uint8Array>> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            
            if (!fs.existsSync(resolvedPath)) {
                return {
                    isOk: false,
                    error: `File not found: ${resolvedPath}`
                };
            }

            const buffer = fs.readFileSync(resolvedPath);
            return {
                isOk: true,
                value: new Uint8Array(buffer)
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isOk: false,
                error: `Failed to read file: ${message}`
            };
        }
    }

    /**
     * Reads a FileReference and returns its binary content.
     * This is the primary method used by request execution.
     * @param ref The FileReference to read
     * @returns Result with file contents as Uint8Array or error message
     */
    async readFileReference(ref: FileReference): Promise<FileResult<Uint8Array>> {
        return this.readFileAsBinary(ref.path, ref.pathType);
    }

    /**
     * Writes binary data to a file.
     * @param filePath The file path (absolute or relative)
     * @param data The binary data to write
     * @param pathType Whether the path is absolute or relative
     * @returns Result indicating success or error
     */
    async writeBinaryFile(
        filePath: string, 
        data: Uint8Array, 
        pathType: 'absolute' | 'relative' = 'absolute'
    ): Promise<FileResult<void>> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            const dir = path.dirname(resolvedPath);
            
            this.ensureDirectoryExists(dir);
            fs.writeFileSync(resolvedPath, Buffer.from(data));
            
            return {
                isOk: true,
                value: undefined
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isOk: false,
                error: `Failed to write file: ${message}`
            };
        }
    }

    /**
     * Writes text content to a file.
     * @param filePath The file path (absolute or relative)
     * @param content The text content to write
     * @param pathType Whether the path is absolute or relative
     * @returns Result indicating success or error
     */
    async writeFile(
        filePath: string, 
        content: string, 
        pathType: 'absolute' | 'relative' = 'absolute'
    ): Promise<FileResult<void>> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            const dir = path.dirname(resolvedPath);
            
            this.ensureDirectoryExists(dir);
            fs.writeFileSync(resolvedPath, content, 'utf8');
            
            return {
                isOk: true,
                value: undefined
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isOk: false,
                error: `Failed to write file: ${message}`
            };
        }
    }

    /**
     * Checks if a file exists.
     * @param filePath The file path (absolute or relative)
     * @param pathType Whether the path is absolute or relative
     * @returns True if file exists, false otherwise
     */
    async exists(filePath: string, pathType: 'absolute' | 'relative' = 'absolute'): Promise<boolean> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            return fs.existsSync(resolvedPath);
        } catch {
            return false;
        }
    }

    /**
     * Gets file stats (size, modified time, etc.).
     * @param filePath The file path (absolute or relative)
     * @param pathType Whether the path is absolute or relative
     * @returns Result with file stats or error
     */
    async getFileStats(
        filePath: string, 
        pathType: 'absolute' | 'relative' = 'absolute'
    ): Promise<FileResult<{ size: number; modifiedTime: Date; isDirectory: boolean }>> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            
            if (!fs.existsSync(resolvedPath)) {
                return {
                    isOk: false,
                    error: `File not found: ${resolvedPath}`
                };
            }

            const stats = fs.statSync(resolvedPath);
            return {
                isOk: true,
                value: {
                    size: stats.size,
                    modifiedTime: stats.mtime,
                    isDirectory: stats.isDirectory()
                }
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isOk: false,
                error: `Failed to get file stats: ${message}`
            };
        }
    }

    /**
     * Deletes a file.
     * @param filePath The file path (absolute or relative)
     * @param pathType Whether the path is absolute or relative
     * @returns Result indicating success or error
     */
    async deleteFile(
        filePath: string, 
        pathType: 'absolute' | 'relative' = 'absolute'
    ): Promise<FileResult<void>> {
        try {
            const resolvedPath = await this.resolvePath(filePath, pathType);
            
            if (!fs.existsSync(resolvedPath)) {
                // File doesn't exist, consider it a success
                return {
                    isOk: true,
                    value: undefined
                };
            }

            fs.unlinkSync(resolvedPath);
            return {
                isOk: true,
                value: undefined
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                isOk: false,
                error: `Failed to delete file: ${message}`
            };
        }
    }
}

// Export singleton instance for convenience
export const fileService = new FileService();
