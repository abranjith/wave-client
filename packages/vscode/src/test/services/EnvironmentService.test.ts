import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EnvironmentService } from '../../services';
import '../../services/SecurityService';

describe('EnvironmentService', () => {
    let service: EnvironmentService;
    let testDir: string;

    beforeEach(() => {
        service = new EnvironmentService();
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-env-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('loadAll', () => {
        it('should load all environments from directory', async () => {
            const envDir = path.join(testDir, 'environments');
            fs.mkdirSync(envDir, { recursive: true });

            const env1 = { id: 'id1', name: 'Development', values: [] };
            const env2 = { id: 'id2', name: 'Production', values: [] };

            fs.writeFileSync(path.join(envDir, 'development.json'), JSON.stringify(env1));
            fs.writeFileSync(path.join(envDir, 'production.json'), JSON.stringify(env2));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            // Should find the 2 environments we created
            const devEnv = result.find((e) => e.name === 'Development');
            const prodEnv = result.find((e) => e.name === 'Production');

            expect(devEnv).toBeDefined();
            expect(prodEnv).toBeDefined();
            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('should return Global environment if file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Global');
        });
    });

    describe('save', () => {
        it('should save a new environment', async () => {
            const environment = {
                id: 'new-env',
                name: 'New Environment',
                values: [{ key: 'API_URL', value: 'https://api.example.com', enabled: true }]
            };

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.save(environment);

            const envDir = path.join(testDir, 'environments');
            const envFile = path.join(envDir, 'New Environment.json');

            expect(fs.existsSync(envFile)).toBe(true);

            const savedEnv = JSON.parse(fs.readFileSync(envFile, 'utf-8'));
            expect(savedEnv.name).toBe('New Environment');
        });

        it('should create directory if it does not exist', async () => {
            const environment = {
                id: 'test-env',
                name: 'Test',
                values: []
            };

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.save(environment);

            const envDir = path.join(testDir, 'environments');
            expect(fs.existsSync(envDir)).toBe(true);
        });
    });

    describe('import', () => {
        it('should import a single environment', async () => {
            const envJson = JSON.stringify({
                id: 'imported',
                name: 'Imported Environment',
                values: []
            });

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.import(envJson);

            const envDir = path.join(testDir, 'environments');
            const envFile = path.join(envDir, 'Imported Environment.json');
            expect(fs.existsSync(envFile)).toBe(true);
        });

        it('should import an array of environments', async () => {
            const envsJson = JSON.stringify([
                { id: 'env1', name: 'Environment 1', values: [] },
                { id: 'env2', name: 'Environment 2', values: [] }
            ]);

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.import(envsJson);

            const envDir = path.join(testDir, 'environments');
            expect(fs.existsSync(path.join(envDir, 'Environment 1.json'))).toBe(true);
            expect(fs.existsSync(path.join(envDir, 'Environment 2.json'))).toBe(true);
        });
    });

    describe('exportAll', () => {
        it('should export all environments', async () => {
            const envDir = path.join(testDir, 'environments');
            fs.mkdirSync(envDir, { recursive: true });

            const env1 = { id: 'id1', name: 'Development', values: [] };
            const env2 = { id: 'id2', name: 'Production', values: [] };

            fs.writeFileSync(path.join(envDir, 'development.json'), JSON.stringify(env1));
            fs.writeFileSync(path.join(envDir, 'production.json'), JSON.stringify(env2));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.exportAll();

            // Should have at least 2 environments (plus Global)
            expect(result.length).toBeGreaterThanOrEqual(2);
            // Result should not have filename property
            expect(result[0]).not.toHaveProperty('filename');
        });
    });
});
