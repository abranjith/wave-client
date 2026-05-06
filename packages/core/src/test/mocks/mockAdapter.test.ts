import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockAdapter } from './mockAdapter';

describe('createMockAdapter — exportFile', () => {
    let storage: ReturnType<typeof createMockAdapter>['adapter']['storage'];

    beforeEach(() => {
        const { adapter } = createMockAdapter();
        storage = adapter.storage;
        vi.clearAllMocks();
    });

    it('default success path returns isOk with filePath and fileName', async () => {
        const result = await storage.exportFile('report.html', '<html/>', 'text/html');

        expect(result.isOk).toBe(true);
        if (result.isOk) {
            expect(result.value.fileName).toBe('report.html');
            expect(result.value.filePath).toBe('/mock/path/report.html');
        }
    });

    it('records the exact fileName / content / mimeType triple', async () => {
        const fileName = 'run-report.html';
        const content = '<html><body>results</body></html>';
        const mimeType = 'text/html';

        await storage.exportFile(fileName, content, mimeType);

        expect(storage.exportFile).toHaveBeenCalledWith(fileName, content, mimeType);
        expect(storage.exportFile).toHaveBeenCalledTimes(1);
    });

    it('configurable error path returns isErr with the supplied message', async () => {
        (storage.exportFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            isOk: false,
            error: 'Export cancelled by user',
        });

        const result = await storage.exportFile('report.html', 'content', 'text/html');

        expect(result.isOk).toBe(false);
        if (!result.isOk) {
            expect(result.error).toBe('Export cancelled by user');
        }
    });

    it('can be configured to return arbitrary error messages', async () => {
        const customError = 'Disk write permission denied';
        (storage.exportFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            isOk: false,
            error: customError,
        });

        const result = await storage.exportFile('data.json', '{}', 'application/json');

        expect(result.isOk).toBe(false);
        if (!result.isOk) {
            expect(result.error).toBe(customError);
        }
    });

    it('records calls when invoked multiple times', async () => {
        await storage.exportFile('a.html', 'content-a', 'text/html');
        await storage.exportFile('b.json', '{}', 'application/json');

        expect(storage.exportFile).toHaveBeenCalledTimes(2);
        expect(storage.exportFile).toHaveBeenNthCalledWith(1, 'a.html', 'content-a', 'text/html');
        expect(storage.exportFile).toHaveBeenNthCalledWith(2, 'b.json', '{}', 'application/json');
    });
});
