import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HistoryService } from '../../services';
import '../../services/SecurityService';

describe('HistoryService', () => {
    let service: HistoryService;
    let testDir: string;

    beforeEach(() => {
        service = new HistoryService();
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-history-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('loadAll', () => {
        it('should load all history items from directory', async () => {
            const historyDir = path.join(testDir, 'history');
            fs.mkdirSync(historyDir, { recursive: true });

            const request1 = { method: 'GET', url: 'https://api.example.com/users', headers: [], params: [] };
            const request2 = { method: 'POST', url: 'https://api.example.com/users', headers: [], params: [] };

            fs.writeFileSync(path.join(historyDir, '1_request1.json'), JSON.stringify(request1));
            fs.writeFileSync(path.join(historyDir, '2_request2.json'), JSON.stringify(request2));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('should return empty array if directory does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toEqual([]);
        });

        it('should sort history chronologically', async () => {
            const historyDir = path.join(testDir, 'history');
            fs.mkdirSync(historyDir, { recursive: true });

            const older = { method: 'GET', url: 'https://api.example.com/old', headers: [], params: [] };
            const newer = { method: 'GET', url: 'https://api.example.com/new', headers: [], params: [] };

            // Create files with different timestamps (file naming includes timestamp)
            fs.writeFileSync(path.join(historyDir, '1000_old.json'), JSON.stringify(older));
            fs.writeFileSync(path.join(historyDir, '2000_new.json'), JSON.stringify(newer));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result.length).toBeGreaterThanOrEqual(2);
            // Most recent should be first
            expect(result[0].url).toBe('https://api.example.com/new');
        });
    });

    describe('save', () => {
        it('should save a request to history', async () => {
            const request = {
                id: 'req-123',
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: [],
                params: [],
                body: { type: 'none' as const }
            };

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.save(JSON.stringify(request));

            const historyDir = path.join(testDir, 'history');
            expect(fs.existsSync(historyDir)).toBe(true);

            const files = fs.readdirSync(historyDir);
            expect(files.length).toBe(1);
            expect(files[0]).toBe('1.json');
        });

        it('should remove duplicates', async () => {
            const request = {
                id: 'req-123',
                method: 'GET',
                url: 'https://api.example.com/test',
                headers: [],
                params: [],
                body: { type: 'none' as const }
            };

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            // Save same request twice
            await service.save(JSON.stringify(request));
            await service.save(JSON.stringify(request));

            const historyDir = path.join(testDir, 'history');
            const files = fs.readdirSync(historyDir);
            // Should only have 1 file (duplicate removed)
            expect(files.length).toBe(1);
        });

        it('should maintain maximum history items', async () => {
            const historyDir = path.join(testDir, 'history');
            fs.mkdirSync(historyDir, { recursive: true });

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);
            vi.spyOn(service as any, 'getMaxHistoryItems').mockResolvedValue(3);

            // Add 4 requests to exceed limit
            for (let i = 1; i <= 4; i++) {
                const request = {
                    id: `req-${i}`,
                    method: 'GET',
                    url: `https://api.example.com/test${i}`,
                    headers: [],
                    params: [],
                    body: { type: 'none' as const }
                };
                await service.save(JSON.stringify(request));
            }

            const files = fs.readdirSync(historyDir);
            // Should only keep 3 items (max limit)
            expect(files.length).toBe(3);
        });
    });
});
