import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockExecute = vi.fn();
const mockCancel = vi.fn();

vi.mock('@wave-client/shared', () => ({
    httpService: {
        execute: mockExecute,
        cancel: mockCancel,
    },
}));

describe('registerHttpRoutes — cancel', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        const { registerHttpRoutes } = await import('../../routes/http.js');
        app = Fastify();
        await registerHttpRoutes(app);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    it('cancels the request and forwards the param id to httpService.cancel', async () => {
        mockCancel.mockReturnValue(true);

        const response = await app.inject({
            method: 'POST',
            url: '/api/http/tab-42/cancel',
        });

        expect(mockCancel).toHaveBeenCalledWith('tab-42');
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ isOk: true, value: { cancelled: true } });
    });

    it('returns cancelled:false (still ok) when no in-flight request matches', async () => {
        mockCancel.mockReturnValue(false);

        const response = await app.inject({
            method: 'POST',
            url: '/api/http/unknown/cancel',
        });

        expect(mockCancel).toHaveBeenCalledWith('unknown');
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ isOk: true, value: { cancelled: false } });
    });

    it('returns 500 when httpService.cancel throws', async () => {
        mockCancel.mockImplementation(() => {
            throw new Error('boom');
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/http/tab-err/cancel',
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ isOk: false, error: 'boom' });
    });
});
