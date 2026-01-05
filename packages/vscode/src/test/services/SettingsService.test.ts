import { describe, it, expect, beforeEach } from 'vitest';
import { SettingsService } from '../../services';
import '../../services/SecurityService';

describe('SettingsService', () => {
    let service: SettingsService;

    beforeEach(() => {
        service = new SettingsService();
    });

    describe('getDefaultSettings', () => {
        it('should return default settings object', () => {
            const defaults = service.getDefaultSettings();

            expect(defaults).toBeDefined();
            expect(defaults.saveFilesLocation).toBeDefined();
            expect(defaults.maxRedirects).toBe(5);
            expect(defaults.requestTimeoutSeconds).toBe(0);
            expect(defaults.maxHistoryItems).toBe(10);
        });
    });

    describe('getCached', () => {
        it('should load settings if cache is empty', async () => {
            const cached = await service.getCached();

            expect(cached).toBeDefined();
            expect(cached.saveFilesLocation).toBeDefined();
        });
    });
});

