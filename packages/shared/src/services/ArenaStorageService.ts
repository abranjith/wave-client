import * as fs from 'fs';
import * as path from 'path';

import { BaseStorageService } from './BaseStorageService.js';
import type {
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaReference,
    ArenaSettings,
    ArenaProviderSettingsMap,
} from '@wave-client/core';
import {
    ARENA_DIR,
    ARENA_REFERENCES_FILE,
    ARENA_PROVIDER_SETTINGS_FILE,
    DEFAULT_ARENA_SETTINGS,
    getDefaultProviderSettings,
} from '@wave-client/core';

/** Local constant for the settings file name (not yet in arenaConfig.ts). */
const ARENA_SETTINGS_FILE = 'settings.json';

/** Sub-directory name for per-session message files. */
const MESSAGES_SUBDIR = 'messages';

/** Sub-directory name for raw document binary content. */
const DOCUMENTS_SUBDIR = 'documents';

/** Flat JSON file holding all ArenaDocument metadata. */
const DOCUMENTS_FILE = 'documents.json';

/** Flat JSON file holding all ArenaSession records. */
const SESSIONS_FILE = 'sessions.json';

/**
 * Persistent, on-disk storage backend for all Arena AI chat data.
 *
 * Storage layout (relative to `{saveFilesLocation}/arena/`):
 * ```
 * sessions.json                 — ArenaSession[] (messages stored separately)
 * messages/{sessionId}.json     — ArenaMessage[] per session
 * documents.json                — ArenaDocument[] metadata (deprecated)
 * documents/{documentId}        — raw binary content (Buffer)
 * references.json               — user-added ArenaReference[]
 * provider-settings.json        — ArenaProviderSettingsMap
 * settings.json                 — ArenaSettings
 * ```
 *
 * Error handling: missing files return documented defaults; unexpected FS
 * errors (permissions, disk full) are logged then re-thrown.
 *
 * @remarks ArenaDocument-related methods are `@deprecated` — they exist only
 * to satisfy `IArenaAdapter` and will be removed when the adapter interface
 * is cleaned up.
 */
export class ArenaStorageService extends BaseStorageService {
    private readonly subDir = ARENA_DIR;

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Resolves the arena root directory from current settings.
     */
    private async getArenaDir(): Promise<string> {
        const appDir = await this.getAppDirFromSettings();
        return path.join(appDir, this.subDir);
    }

    // =========================================================================
    // TASK-001: Session persistence
    // =========================================================================

    /**
     * Loads all sessions from `sessions.json`.
     *
     * @returns Parsed `ArenaSession[]`, or `[]` when the file does not exist.
     */
    async loadSessions(): Promise<ArenaSession[]> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, SESSIONS_FILE);
        return this.readJsonFileSecure<ArenaSession[]>(filePath, []);
    }

    /**
     * Saves (upserts) a session into `sessions.json`.
     *
     * If a session with the same `id` already exists it is replaced in-place;
     * otherwise the session is appended.
     *
     * @param session The session to persist.
     */
    async saveSession(session: ArenaSession): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, SESSIONS_FILE);

        const sessions = await this.readJsonFileSecure<ArenaSession[]>(filePath, []);
        const index = sessions.findIndex((s) => s.id === session.id);

        if (index !== -1) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }

        await this.writeJsonFileSecure(filePath, sessions);
    }

    /**
     * Deletes a session from `sessions.json` and removes the associated
     * messages file (`messages/{sessionId}.json`) if it exists.
     *
     * No-op when `sessionId` does not exist in the list.
     *
     * @param sessionId The ID of the session to delete.
     */
    async deleteSession(sessionId: string): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const sessionsPath = path.join(arenaDir, SESSIONS_FILE);

        const sessions = await this.readJsonFileSecure<ArenaSession[]>(sessionsPath, []);
        const filtered = sessions.filter((s) => s.id !== sessionId);
        await this.writeJsonFileSecure(sessionsPath, filtered);

        // Also remove the associated messages file
        const messagesPath = path.join(arenaDir, MESSAGES_SUBDIR, `${sessionId}.json`);
        this.deleteFile(messagesPath);
    }

    // =========================================================================
    // TASK-002: Message persistence
    // =========================================================================

    /**
     * Loads all messages for a given session from `messages/{sessionId}.json`.
     *
     * @param sessionId The ID of the parent session.
     * @returns `ArenaMessage[]`, or `[]` when the file does not exist.
     */
    async loadMessages(sessionId: string): Promise<ArenaMessage[]> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, MESSAGES_SUBDIR, `${sessionId}.json`);
        return this.readJsonFileSecure<ArenaMessage[]>(filePath, []);
    }

    /**
     * Writes the full messages array for a session to `messages/{sessionId}.json`.
     *
     * @param sessionId The ID of the parent session.
     * @param messages  The complete messages array to persist.
     */
    async saveMessages(sessionId: string, messages: ArenaMessage[]): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const messagesDir = path.join(arenaDir, MESSAGES_SUBDIR);
        this.ensureDirectoryExists(messagesDir);
        const filePath = path.join(messagesDir, `${sessionId}.json`);
        await this.writeJsonFileSecure(filePath, messages);
    }

    /**
     * Deletes the messages file for a session (`messages/{sessionId}.json`).
     *
     * No-op when the file does not exist.
     *
     * @param sessionId The ID of the session whose messages should be cleared.
     */
    async clearSessionMessages(sessionId: string): Promise<void> {
        const arenaDir = await this.getArenaDir();
        const filePath = path.join(arenaDir, MESSAGES_SUBDIR, `${sessionId}.json`);
        this.deleteFile(filePath);
    }

    // =========================================================================
    // TASK-003: Settings, provider settings, and references persistence
    // =========================================================================

    /**
     * Loads arena settings from `settings.json`.
     *
     * Returns a shallow merge of `DEFAULT_ARENA_SETTINGS` with the persisted
     * values, so missing keys always fall back to defaults.
     *
     * @returns The current `ArenaSettings`.
     */
    async loadSettings(): Promise<ArenaSettings> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, ARENA_SETTINGS_FILE);
        const persisted = await this.readJsonFileSecure<Partial<ArenaSettings>>(filePath, {});
        return { ...DEFAULT_ARENA_SETTINGS, ...persisted };
    }

    /**
     * Persists arena settings to `settings.json`.
     *
     * @param settings The settings object to save.
     */
    async saveSettings(settings: ArenaSettings): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, ARENA_SETTINGS_FILE);
        await this.writeJsonFileSecure(filePath, settings);
    }

    /**
     * Loads provider settings from `provider-settings.json`.
     *
     * Falls back to `getDefaultProviderSettings()` when the file does not exist.
     * Uses secure I/O because this file may contain API keys.
     *
     * @returns The current `ArenaProviderSettingsMap`.
     */
    async loadProviderSettings(): Promise<ArenaProviderSettingsMap> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, ARENA_PROVIDER_SETTINGS_FILE);
        return this.readJsonFileSecure<ArenaProviderSettingsMap>(filePath, getDefaultProviderSettings());
    }

    /**
     * Persists provider settings to `provider-settings.json`.
     *
     * Uses secure I/O because this file may contain API keys.
     * Never logged — do not add logging for this method's data.
     *
     * @param settings The provider settings map to save.
     */
    async saveProviderSettings(settings: ArenaProviderSettingsMap): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, ARENA_PROVIDER_SETTINGS_FILE);
        await this.writeJsonFileSecure(filePath, settings);
    }

    /**
     * Loads user-added references from `references.json`.
     *
     * Only the user-added (non-default) references are stored here.
     * Merging with built-in defaults is the caller's responsibility.
     *
     * @returns `ArenaReference[]`, or `[]` when the file does not exist.
     */
    async loadReferences(): Promise<ArenaReference[]> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, ARENA_REFERENCES_FILE);
        return this.readJsonFileSecure<ArenaReference[]>(filePath, []);
    }

    /**
     * Persists user-added references to `references.json`.
     *
     * @param references The references array to save.
     */
    async saveReferences(references: ArenaReference[]): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, ARENA_REFERENCES_FILE);
        await this.writeJsonFileSecure(filePath, references);
    }

    // =========================================================================
    // TASK-004: Document metadata and binary content storage (deprecated)
    // =========================================================================

    /**
     * Loads all document metadata records from `documents.json`.
     *
     * @returns `ArenaDocument[]`, or `[]` when the file does not exist.
     * @deprecated `ArenaDocument` is deprecated. Will be removed when
     * `IArenaAdapter.uploadDocument` / `loadDocuments` / `deleteDocument`
     * are cleaned up from the adapter interface.
     */
    async loadDocuments(): Promise<ArenaDocument[]> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, DOCUMENTS_FILE);
        return this.readJsonFileSecure<ArenaDocument[]>(filePath, []);
    }

    /**
     * Upserts a document metadata record in `documents.json`.
     *
     * Finds by `id` and replaces if found; appends otherwise.
     *
     * @param document The document metadata to persist.
     * @deprecated See {@link loadDocuments}.
     */
    async saveDocumentMetadata(document: ArenaDocument): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const filePath = path.join(arenaDir, DOCUMENTS_FILE);

        const documents = await this.readJsonFileSecure<ArenaDocument[]>(filePath, []);
        const index = documents.findIndex((d) => d.id === document.id);

        if (index !== -1) {
            documents[index] = document;
        } else {
            documents.push(document);
        }

        await this.writeJsonFileSecure(filePath, documents);
    }

    /**
     * Removes a document metadata record from `documents.json` and deletes
     * its binary file at `documents/{documentId}` if it exists.
     *
     * No-op when the document `id` is not found in the metadata list.
     *
     * @param documentId The ID of the document to delete.
     * @deprecated See {@link loadDocuments}.
     */
    async deleteDocument(documentId: string): Promise<void> {
        const arenaDir = await this.getArenaDir();
        this.ensureDirectoryExists(arenaDir);
        const metaPath = path.join(arenaDir, DOCUMENTS_FILE);

        const documents = await this.readJsonFileSecure<ArenaDocument[]>(metaPath, []);
        const filtered = documents.filter((d) => d.id !== documentId);
        await this.writeJsonFileSecure(metaPath, filtered);

        // Remove the binary file if it exists
        const binaryPath = path.join(arenaDir, DOCUMENTS_SUBDIR, documentId);
        this.deleteFile(binaryPath);
    }

    /**
     * Reads the raw binary content of a document from `documents/{documentId}`.
     *
     * @param documentId The ID of the document whose content to retrieve.
     * @returns The raw file content as a `Buffer`.
     * @throws `Error` (ENOENT) if the binary file does not exist.
     * @deprecated See {@link loadDocuments}.
     */
    async loadDocumentContent(documentId: string): Promise<Buffer> {
        const arenaDir = await this.getArenaDir();
        const filePath = path.join(arenaDir, DOCUMENTS_SUBDIR, documentId);
        try {
            return fs.readFileSync(filePath) as Buffer;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error reading document content ${filePath}:`, message);
            throw error;
        }
    }

    /**
     * Writes raw binary content for a document to `documents/{documentId}`.
     *
     * @param documentId The ID of the document.
     * @param content    The binary content to write.
     * @deprecated See {@link loadDocuments}.
     */
    async saveDocumentContent(documentId: string, content: Buffer): Promise<void> {
        const arenaDir = await this.getArenaDir();
        const documentsDir = path.join(arenaDir, DOCUMENTS_SUBDIR);
        this.ensureDirectoryExists(documentsDir);
        const filePath = path.join(documentsDir, documentId);
        try {
            fs.writeFileSync(filePath, content);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error writing document content ${filePath}:`, message);
            throw error;
        }
    }
}

/** Singleton instance of {@link ArenaStorageService}. */
export const arenaStorageService = new ArenaStorageService();
