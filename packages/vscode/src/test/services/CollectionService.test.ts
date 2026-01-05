import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CollectionService } from '../../services';
import '../../services/SecurityService';

describe('CollectionService', () => {
    let service: CollectionService;
    let testDir: string;

    beforeEach(() => {
        service = new CollectionService();
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-collections-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('loadAll', () => {
        it('should load all collections from directory', async () => {
            const collectionsDir = path.join(testDir, 'collections');
            fs.mkdirSync(collectionsDir, { recursive: true });

            const collection1 = { info: { name: 'Collection 1', waveId: 'id1', version: '0.0.1' }, item: [] };
            const collection2 = { info: { name: 'Collection 2', waveId: 'id2', version: '0.0.1' }, item: [] };

            fs.writeFileSync(path.join(collectionsDir, 'collection1.json'), JSON.stringify(collection1));
            fs.writeFileSync(path.join(collectionsDir, 'collection2.json'), JSON.stringify(collection2));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toHaveLength(2);
            expect(result[0].filename).toBe('collection1.json');
            expect(result[1].filename).toBe('collection2.json');
        });

        it('should return empty array if directory does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toEqual([]);
        });

        it('should ensure items have IDs', async () => {
            const collectionsDir = path.join(testDir, 'collections');
            fs.mkdirSync(collectionsDir, { recursive: true });

            const collectionWithoutIds = {
                info: { name: 'Test', waveId: 'test-id', version: '0.0.1' },
                item: [
                    {
                        name: 'Request 1',
                        request: {
                            method: 'GET',
                            url: { raw: 'https://example.com' },
                            header: []
                        }
                    }
                ]
            };

            fs.writeFileSync(path.join(collectionsDir, 'test.json'), JSON.stringify(collectionWithoutIds));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toHaveLength(1);
            expect(result[0].item[0].id).toBeDefined();
        });
    });

    describe('loadOne', () => {
        it('should load a single collection by filename', async () => {
            const collectionsDir = path.join(testDir, 'collections');
            fs.mkdirSync(collectionsDir, { recursive: true });

            const collection = { info: { name: 'Test Collection', waveId: 'test-id', version: '0.0.1' }, item: [] };
            fs.writeFileSync(path.join(collectionsDir, 'test.json'), JSON.stringify(collection));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadOne('test.json');

            expect(result).toBeDefined();
            expect(result?.info.name).toBe('Test Collection');
        });

        it('should return null if file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadOne('non-existent.json');

            expect(result).toBeNull();
        });
    });

    describe('save', () => {
        it('should save a collection to file', async () => {
            const collection = {
                info: { name: 'New Collection', waveId: 'new-id', version: '0.0.1' },
                item: []
            };

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.save(collection, 'new.json');

            const collectionsDir = path.join(testDir, 'collections');
            const savedFile = path.join(collectionsDir, 'new.json');

            expect(fs.existsSync(savedFile)).toBe(true);

            const savedContent = JSON.parse(fs.readFileSync(savedFile, 'utf-8'));
            expect(savedContent.info.name).toBe('New Collection');
        });

        it('should create directory if it does not exist', async () => {
            const collection = {
                info: { name: 'Test', waveId: 'test-id', version: '0.0.1' },
                item: []
            };

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.save(collection, 'test.json');

            const collectionsDir = path.join(testDir, 'collections');
            expect(fs.existsSync(collectionsDir)).toBe(true);
        });
    });

    describe('import', () => {
        it('should import a collection from JSON content', async () => {
            const collectionJson = JSON.stringify({
                info: { name: 'Imported Collection', waveId: 'import-id', version: '0.0.1' },
                item: []
            });

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.import('imported.json', collectionJson);

            expect(result.filename).toBe('imported.json');
            expect(result.info.name).toBe('Imported Collection');

            const collectionsDir = path.join(testDir, 'collections');
            const importedFile = path.join(collectionsDir, 'imported.json');
            expect(fs.existsSync(importedFile)).toBe(true);
        });

        it('should throw error for invalid JSON', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await expect(service.import('invalid.json', 'not valid json')).rejects.toThrow();
        });

        it('should add IDs to items without IDs', async () => {
            const collectionJson = JSON.stringify({
                info: { name: 'Test', waveId: 'test-id', version: '0.0.1' },
                item: [
                    {
                        name: 'Request',
                        request: { method: 'GET', url: { raw: 'https://example.com' }, header: [] }
                    }
                ]
            });

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.import('test.json', collectionJson);

            expect(result.item[0].id).toBeDefined();
        });
    });

    describe('export', () => {
        it('should export collection to JSON string', async () => {
            const collection = {
                info: { name: 'Export Test', waveId: 'export-id', version: '0.0.1' },
                item: []
            };

            const result = await service.export(collection);

            expect(result.content).toContain('Export Test');
            expect(result.suggestedFilename).toContain('export_test');
        });

        it('should sanitize filename', async () => {
            const collection = {
                info: { name: 'Test Collection!!!', waveId: 'test-id', version: '0.0.1' },
                item: []
            };

            const result = await service.export(collection);

            expect(result.suggestedFilename).toBe('test_collection___.json');
        });
    });
});
