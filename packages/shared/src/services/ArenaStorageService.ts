import * as path from 'path';

import { BaseStorageService } from './BaseStorageService.js';
import type {
    ArenaSession,
    ArenaMessage,
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

/** Flat JSON file holding all ArenaSession records. */
const SESSIONS_FILE = 'sessions.json';

/**
 * Persistent, on-disk storage backend for all Arena AI chat data.
 *
 * Storage layout (relative to `{saveFilesLocation}/arena/`):
 * ```
 * sessions.json                 — ArenaSession[] (messages stored separately)
 * messages/{sessionId}.json     — ArenaMessage[] per session
 * references.json               — user-added ArenaReference[]
 * provider-settings.json        — ArenaProviderSettingsMap
 * settings.json                 — ArenaSettings
 * ```
 *
 * Error handling: missing files return documented defaults; unexpected FS
 * errors (permissions, disk full) are logged then re-thrown.
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
}

/** Singleton instance of {@link ArenaStorageService}. */
export const arenaStorageService = new ArenaStorageService();
