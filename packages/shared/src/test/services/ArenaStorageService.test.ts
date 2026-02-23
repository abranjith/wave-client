import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';

import { ArenaStorageService } from '../../services/ArenaStorageService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { AppSettings } from '../../types.js';
import type {
    ArenaSession,
    ArenaMessage,
    ArenaDocument,
    ArenaReference,
    ArenaSettings,
    ArenaProviderSettingsMap,
} from '@wave-client/core';
import { DEFAULT_ARENA_SETTINGS, getDefaultProviderSettings } from '@wave-client/core';

// ---------------------------------------------------------------------------
// Mock file system
// ---------------------------------------------------------------------------

const mockFs = new MockFileSystem();

vi.mock('fs', () => ({
    existsSync: vi.fn((filePath: string) => mockFs.hasFile(filePath) || mockFs.hasDirectory(filePath)),

    readFileSync: vi.fn((filePath: string, encoding?: string) => {
        if (encoding === undefined) {
            // Binary read (Buffer)
            const content = mockFs.getFile(filePath);
            if (content === undefined) {
                throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
            }
            // Return as Buffer-like (Uint8Array) for binary reads
            return Buffer.from(content, 'binary');
        }
        const content = mockFs.getFile(filePath);
        if (content === undefined) {
            throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
        }
        return content;
    }),

    writeFileSync: vi.fn((filePath: string, data: string | Buffer) => {
        if (Buffer.isBuffer(data)) {
            mockFs.setFile(filePath, data.toString('binary'));
        } else {
            mockFs.setFile(filePath, data);
        }
    }),

    mkdirSync: vi.fn((dirPath: string) => {
        mockFs.addDirectory(dirPath);
    }),

    unlinkSync: vi.fn((filePath: string) => {
        if (!mockFs.hasFile(filePath)) {
            throw new Error(`ENOENT: no such file or directory, unlink '${filePath}'`);
        }
        mockFs.deleteFile(filePath);
    }),

    readdirSync: vi.fn((dirPath: string) => mockFs.getFilesInDirectory(dirPath)),
}));

vi.mock('os', () => ({
    homedir: vi.fn(() => '/home/testuser'),
}));

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const ARENA_ROOT = '/home/testuser/.waveclient/arena';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('ArenaStorageService', () => {
    let service: ArenaStorageService;

    beforeEach(() => {
        mockFs.reset();
        vi.clearAllMocks();

        const mockSettings: AppSettings = {
            saveFilesLocation: '/home/testuser/.waveclient',
            maxRedirects: 5,
            requestTimeoutSeconds: 30,
            maxHistoryItems: 10,
            commonHeaderNames: [],
            encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
            encryptionKeyValidationStatus: 'none',
            ignoreCertificateValidation: false,
        };

        setGlobalSettingsProvider(async () => mockSettings);

        const mockSecurityService = {
            readEncryptedFile: vi.fn(async (filePath: string, defaultValue: unknown): Promise<unknown> => {
                const content = mockFs.getFile(filePath);
                if (content === undefined) {
                    return defaultValue;
                }
                try {
                    return JSON.parse(content);
                } catch {
                    return defaultValue;
                }
            }),
            writeEncryptedFile: vi.fn(async (filePath: string, data: unknown): Promise<void> => {
                mockFs.setFile(filePath, JSON.stringify(data, null, 2));
            }),
        };

        setSecurityServiceInstance(mockSecurityService);

        service = new ArenaStorageService();
        mockFs.addDirectory(ARENA_ROOT);
    });

    // =========================================================================
    // TASK-001: Session Persistence
    // =========================================================================

    describe('Session Persistence', () => {
        const session1: ArenaSession = {
            id: 'session-1',
            title: 'Alpha',
            agent: 'wave-client',
            createdAt: 1_000,
            updatedAt: 1_000,
            messageCount: 0,
        };

        const session2: ArenaSession = {
            id: 'session-2',
            title: 'Beta',
            agent: 'web-expert',
            createdAt: 2_000,
            updatedAt: 2_000,
            messageCount: 3,
        };

        it('returns [] when sessions.json does not exist (first run)', async () => {
            const result = await service.loadSessions();
            expect(result).toEqual([]);
        });

        it('creates sessions.json with the new session on first saveSession call', async () => {
            await service.saveSession(session1);
            const result = await service.loadSessions();
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(session1);
        });

        it('appends a new session when no session with that id exists', async () => {
            await service.saveSession(session1);
            await service.saveSession(session2);
            const result = await service.loadSessions();
            expect(result).toHaveLength(2);
            expect(result.find((s) => s.id === 'session-1')).toEqual(session1);
            expect(result.find((s) => s.id === 'session-2')).toEqual(session2);
        });

        it('upserts (replaces) an existing session with the same id', async () => {
            await service.saveSession(session1);
            const updated: ArenaSession = { ...session1, title: 'Updated Alpha', messageCount: 5 };
            await service.saveSession(updated);
            const result = await service.loadSessions();
            expect(result).toHaveLength(1);
            expect(result[0].title).toBe('Updated Alpha');
            expect(result[0].messageCount).toBe(5);
        });

        it('removes the session from sessions.json on deleteSession', async () => {
            await service.saveSession(session1);
            await service.saveSession(session2);
            await service.deleteSession('session-1');
            const result = await service.loadSessions();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('session-2');
        });

        it('also removes messages/{sessionId}.json on deleteSession when it exists', async () => {
            const messagesPath = path.join(ARENA_ROOT, 'messages', 'session-1.json');
            mockFs.addDirectory(path.join(ARENA_ROOT, 'messages'));
            mockFs.setFile(messagesPath, '[]');

            await service.saveSession(session1);
            await service.deleteSession('session-1');

            expect(mockFs.hasFile(messagesPath)).toBe(false);
        });

        it('is a no-op (does not throw) when sessionId does not exist', async () => {
            await service.saveSession(session1);
            await expect(service.deleteSession('non-existent')).resolves.not.toThrow();
            const result = await service.loadSessions();
            expect(result).toHaveLength(1);
        });
    });

    // =========================================================================
    // TASK-002: Message Persistence
    // =========================================================================

    describe('Message Persistence', () => {
        const sessionId = 'msg-session-1';

        const msg1: ArenaMessage = {
            id: 'msg-1',
            sessionId,
            role: 'user',
            content: 'Hello',
            status: 'complete',
            timestamp: 1_000,
        };

        const msg2: ArenaMessage = {
            id: 'msg-2',
            sessionId,
            role: 'assistant',
            content: 'Hi there',
            status: 'complete',
            timestamp: 2_000,
        };

        it('returns [] when messages file does not exist', async () => {
            const result = await service.loadMessages(sessionId);
            expect(result).toEqual([]);
        });

        it('creates messages/{sessionId}.json with the provided array on saveMessages', async () => {
            await service.saveMessages(sessionId, [msg1]);
            const result = await service.loadMessages(sessionId);
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(msg1);
        });

        it('overwrites the existing messages file with the new array', async () => {
            await service.saveMessages(sessionId, [msg1]);
            await service.saveMessages(sessionId, [msg1, msg2]);
            const result = await service.loadMessages(sessionId);
            expect(result).toHaveLength(2);
        });

        it('returns saved messages after saveMessages', async () => {
            await service.saveMessages(sessionId, [msg1, msg2]);
            const result = await service.loadMessages(sessionId);
            expect(result).toEqual([msg1, msg2]);
        });

        it('deletes the messages file on clearSessionMessages', async () => {
            await service.saveMessages(sessionId, [msg1]);
            await service.clearSessionMessages(sessionId);
            // After clearing, loadMessages should return []
            const result = await service.loadMessages(sessionId);
            expect(result).toEqual([]);
        });

        it('clearSessionMessages is a no-op when file does not exist (no throw)', async () => {
            await expect(service.clearSessionMessages('non-existent-session')).resolves.not.toThrow();
        });
    });

    // =========================================================================
    // TASK-003: Settings Persistence
    // =========================================================================

    describe('Settings Persistence', () => {
        it('returns DEFAULT_ARENA_SETTINGS when settings.json is missing', async () => {
            const result = await service.loadSettings();
            expect(result).toEqual(DEFAULT_ARENA_SETTINGS);
        });

        it('round-trips settings correctly (data survives serialisation)', async () => {
            const custom: ArenaSettings = {
                ...DEFAULT_ARENA_SETTINGS,
                maxSessions: 20,
                enableStreaming: false,
            };
            await service.saveSettings(custom);
            const result = await service.loadSettings();
            expect(result).toEqual(custom);
        });

        it('merges persisted partial settings with DEFAULT_ARENA_SETTINGS as base', async () => {
            // Simulate a file that only stores a subset of keys (e.g., older format)
            const partial: Partial<ArenaSettings> = { maxSessions: 99 };
            const filePath = path.join(ARENA_ROOT, 'settings.json');
            mockFs.setFile(filePath, JSON.stringify(partial, null, 2));

            const result = await service.loadSettings();
            expect(result.maxSessions).toBe(99);
            // Other keys should fall back to defaults
            expect(result.enableStreaming).toBe(DEFAULT_ARENA_SETTINGS.enableStreaming);
            expect(result.maxMessagesPerSession).toBe(DEFAULT_ARENA_SETTINGS.maxMessagesPerSession);
        });
    });

    // =========================================================================
    // TASK-003: Provider Settings Persistence
    // =========================================================================

    describe('Provider Settings Persistence', () => {
        it('returns getDefaultProviderSettings() when file is missing', async () => {
            const result = await service.loadProviderSettings();
            expect(result).toEqual(getDefaultProviderSettings());
        });

        it('round-trips provider settings correctly', async () => {
            const defaults = getDefaultProviderSettings();
            // Mutate a provider entry to simulate user configuration
            const first = Object.keys(defaults)[0] as keyof ArenaProviderSettingsMap;
            const custom: ArenaProviderSettingsMap = {
                ...defaults,
                [first]: { ...defaults[first], enabled: !defaults[first].enabled },
            };
            await service.saveProviderSettings(custom);
            const result = await service.loadProviderSettings();
            expect(result[first].enabled).toBe(!defaults[first].enabled);
        });

        it('API key survives the round-trip (is not stripped or redacted)', async () => {
            const defaults = getDefaultProviderSettings();
            const first = Object.keys(defaults)[0] as keyof ArenaProviderSettingsMap;
            const custom: ArenaProviderSettingsMap = {
                ...defaults,
                [first]: { ...defaults[first], apiKey: 'sk-super-secret-key' },
            };
            await service.saveProviderSettings(custom);
            const result = await service.loadProviderSettings();
            expect(result[first].apiKey).toBe('sk-super-secret-key');
        });
    });

    // =========================================================================
    // TASK-003: References Persistence
    // =========================================================================

    describe('References Persistence', () => {
        const ref1: ArenaReference = {
            id: 'ref-1',
            name: 'MDN Web Docs',
            url: 'https://developer.mozilla.org',
            type: 'web',
            isDefault: false,
            enabled: true,
        };

        const ref2: ArenaReference = {
            id: 'ref-2',
            name: 'caniuse',
            url: 'https://caniuse.com',
            type: 'web',
            isDefault: false,
            enabled: true,
        };

        it('returns [] when references.json is missing', async () => {
            const result = await service.loadReferences();
            expect(result).toEqual([]);
        });

        it('round-trips references correctly', async () => {
            await service.saveReferences([ref1, ref2]);
            const result = await service.loadReferences();
            expect(result).toHaveLength(2);
            expect(result).toEqual([ref1, ref2]);
        });
    });

    // =========================================================================
    // TASK-004: Document Storage (deprecated)
    // =========================================================================

    describe('Document Storage', () => {
        const doc1: ArenaDocument = {
            id: 'doc-1',
            filename: 'report.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            uploadedAt: 3_000,
            processed: true,
        };

        const doc2: ArenaDocument = {
            id: 'doc-2',
            filename: 'notes.txt',
            mimeType: 'text/plain',
            size: 512,
            uploadedAt: 4_000,
            processed: false,
        };

        it('returns [] when documents.json is missing', async () => {
            const result = await service.loadDocuments();
            expect(result).toEqual([]);
        });

        it('saveDocumentMetadata upserts — appends new document', async () => {
            await service.saveDocumentMetadata(doc1);
            const result = await service.loadDocuments();
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(doc1);
        });

        it('saveDocumentMetadata upserts — replaces by id', async () => {
            await service.saveDocumentMetadata(doc1);
            const updated: ArenaDocument = { ...doc1, filename: 'report-v2.pdf', processed: true };
            await service.saveDocumentMetadata(updated);
            const result = await service.loadDocuments();
            expect(result).toHaveLength(1);
            expect(result[0].filename).toBe('report-v2.pdf');
        });

        it('deleteDocument removes document from metadata list', async () => {
            await service.saveDocumentMetadata(doc1);
            await service.saveDocumentMetadata(doc2);
            await service.deleteDocument('doc-1');
            const result = await service.loadDocuments();
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('doc-2');
        });

        it('deleteDocument deletes the binary file if it exists', async () => {
            const binaryPath = path.join(ARENA_ROOT, 'documents', 'doc-1');
            mockFs.addDirectory(path.join(ARENA_ROOT, 'documents'));
            mockFs.setFile(binaryPath, 'binary-data');

            await service.saveDocumentMetadata(doc1);
            await service.deleteDocument('doc-1');

            expect(mockFs.hasFile(binaryPath)).toBe(false);
        });

        it('deleteDocument does not throw when document is not in the list', async () => {
            await expect(service.deleteDocument('non-existent-doc')).resolves.not.toThrow();
        });

        it('saveDocumentContent writes binary data to documents/{id}', async () => {
            mockFs.addDirectory(path.join(ARENA_ROOT, 'documents'));
            const content = Buffer.from('hello binary world');
            await service.saveDocumentContent('doc-1', content);
            const binaryPath = path.join(ARENA_ROOT, 'documents', 'doc-1');
            expect(mockFs.hasFile(binaryPath)).toBe(true);
        });

        it('loadDocumentContent reads and returns the same buffer that was saved', async () => {
            mockFs.addDirectory(path.join(ARENA_ROOT, 'documents'));
            const content = Buffer.from('hello binary world');
            await service.saveDocumentContent('doc-1', content);
            const loaded = await service.loadDocumentContent('doc-1');
            expect(Buffer.isBuffer(loaded)).toBe(true);
            expect(loaded.toString()).toBe('hello binary world');
        });
    });
});
