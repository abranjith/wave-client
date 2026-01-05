import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpService, setAuthServiceFactory } from '../../services/HttpService.js';
import type { HttpRequestConfig, SendConfig, HttpAuth } from '../../services/HttpService.js';
import type { AppSettings, Cookie } from '../../types.js';

// Mock axios
vi.mock('axios', () => ({
    default: vi.fn(),
}));

// Mock https module
vi.mock('https', () => ({
    Agent: vi.fn((options) => ({ options })),
}));

// Mock services
vi.mock('../../services/CookieService.js', () => ({
    cookieService: {
        loadAll: vi.fn(),
        saveAll: vi.fn(),
        getCookiesForUrl: vi.fn(),
        parseSetCookie: vi.fn(),
        mergeCookies: vi.fn(),
    },
}));

vi.mock('../../services/StoreService.js', () => ({
    storeService: {
        getProxyForUrl: vi.fn(),
        getHttpsAgentForUrl: vi.fn(),
    },
}));

vi.mock('../../services/BaseStorageService.js', () => ({
    getGlobalSettings: vi.fn(),
    BaseStorageService: class {},
}));

vi.mock('../utils.js', () => ({
    convertToBase64: (data: unknown) => {
        if (Buffer.isBuffer(data)) {
            return data.toString('base64');
        }
        if (typeof data === 'string') {
            return Buffer.from(data, 'utf8').toString('base64');
        }
        return Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
    },
}));

// Import mocked modules to get mock instances
import axios from 'axios';
import * as https from 'https';
import { cookieService } from '../../services/CookieService.js';
import { storeService } from '../../services/StoreService.js';
import { getGlobalSettings } from '../../services/BaseStorageService.js';

const mockAxios = axios as unknown as ReturnType<typeof vi.fn>;
const mockHttpsAgent = https.Agent as unknown as ReturnType<typeof vi.fn>;
const mockCookieService = cookieService as unknown as {
    loadAll: ReturnType<typeof vi.fn>;
    saveAll: ReturnType<typeof vi.fn>;
    getCookiesForUrl: ReturnType<typeof vi.fn>;
    parseSetCookie: ReturnType<typeof vi.fn>;
    mergeCookies: ReturnType<typeof vi.fn>;
};
const mockStoreService = storeService as unknown as {
    getProxyForUrl: ReturnType<typeof vi.fn>;
    getHttpsAgentForUrl: ReturnType<typeof vi.fn>;
};
const mockGetGlobalSettings = getGlobalSettings as unknown as ReturnType<typeof vi.fn>;

describe('HttpService', () => {
    let service: HttpService;
    let defaultSettings: AppSettings;

    beforeEach(() => {
        service = new HttpService();

        defaultSettings = {
            saveFilesLocation: '/test',
            maxRedirects: 5,
            requestTimeoutSeconds: 30,
            maxHistoryItems: 10,
            commonHeaderNames: [],
            encryptionKeyEnvVar: '',
            encryptionKeyValidationStatus: 'none',
            ignoreCertificateValidation: false,
        };

        // Reset all mocks
        vi.clearAllMocks();

        // Default mock implementations
        mockGetGlobalSettings.mockResolvedValue(defaultSettings);
        mockCookieService.loadAll.mockResolvedValue([]);
        mockCookieService.getCookiesForUrl.mockReturnValue('');
        mockCookieService.mergeCookies.mockReturnValue([]);
        mockStoreService.getProxyForUrl.mockResolvedValue(null);
        mockStoreService.getHttpsAgentForUrl.mockResolvedValue(null);
        mockHttpsAgent.mockImplementation((options) => ({ options }));
    });

    describe('send', () => {
        it('should execute a basic HTTP request', async () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                data: Buffer.from('{"result":"success"}'),
            };

            mockAxios.mockResolvedValue(mockResponse);

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: { 'User-Agent': 'Test' },
            };

            const result = await service.send(config);

            expect(result.response.status).toBe(200);
            expect(result.response.statusText).toBe('OK');
            expect(result.error).toBeUndefined();
        });

        it('should append params to URL', async () => {
            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/search',
                headers: {},
                params: 'q=test&limit=10',
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'https://api.example.com/search?q=test&limit=10',
                })
            );
        });

        it('should use & separator if URL already has query params', async () => {
            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/search?existing=param',
                headers: {},
                params: 'new=param',
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'https://api.example.com/search?existing=param&new=param',
                })
            );
        });

        it('should apply proxy configuration', async () => {
            mockStoreService.getProxyForUrl.mockResolvedValue({
                host: 'proxy.example.com',
                port: 8080,
                protocol: 'http',
            });

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    proxy: {
                        host: 'proxy.example.com',
                        port: 8080,
                        protocol: 'http',
                    },
                })
            );
        });

        it('should apply custom HTTPS agent for certificates', async () => {
            const customAgent = { options: { ca: 'cert-data' } };
            mockStoreService.getHttpsAgentForUrl.mockResolvedValue(customAgent);

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://secure.example.com/api',
                headers: {},
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: customAgent,
                })
            );
        });

        it('should disable certificate validation when ignoreCertificateValidation is true', async () => {
            mockGetGlobalSettings.mockResolvedValue({
                ...defaultSettings,
                ignoreCertificateValidation: true,
            });

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://untrusted.example.com/api',
                headers: {},
            };

            await service.send(config);

            expect(mockHttpsAgent).toHaveBeenCalledWith(
                expect.objectContaining({
                    rejectUnauthorized: false,
                })
            );
        });

        it('should apply request timeout from settings', async () => {
            mockGetGlobalSettings.mockResolvedValue({
                ...defaultSettings,
                requestTimeoutSeconds: 60,
            });

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/slow',
                headers: {},
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    timeout: 60000, // 60 seconds in milliseconds
                })
            );
        });

        it('should use 0 timeout when requestTimeoutSeconds is 0', async () => {
            mockGetGlobalSettings.mockResolvedValue({
                ...defaultSettings,
                requestTimeoutSeconds: 0,
            });

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    timeout: 0, // No timeout
                })
            );
        });

        it('should handle request errors and return error response', async () => {
            mockAxios.mockRejectedValue({
                response: {
                    status: 404,
                    statusText: 'Not Found',
                    headers: {},
                    data: Buffer.from('Not found'),
                },
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/missing',
                headers: {},
            };

            const result = await service.send(config);

            expect(result.response.status).toBe(404);
            expect(result.response.statusText).toBe('Not Found');
            expect(result.error).toContain('Not Found');
        });

        it('should handle network errors', async () => {
            mockAxios.mockRejectedValue({
                message: 'Network Error',
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://offline.example.com/api',
                headers: {},
            };

            const result = await service.send(config);

            expect(result.response.status).toBe(0);
            expect(result.error).toBe('Network Error');
        });

        it('should validate status when validateStatus option is true', async () => {
            mockAxios.mockResolvedValue({
                status: 401,
                statusText: 'Unauthorized',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/secure',
                headers: {},
                validateStatus: true,
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    validateStatus: expect.any(Function),
                })
            );
        });

        it('should support different response types', async () => {
            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const config: SendConfig = {
                method: 'GET',
                url: 'https://api.example.com/json',
                headers: {},
                responseType: 'json',
            };

            await service.send(config);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    responseType: 'json',
                })
            );
        });
    });

    describe('execute', () => {
        it('should execute a basic request with cookie handling', async () => {
            const mockResponse = {
                status: 200,
                statusText: 'OK',
                headers: {
                    'content-type': 'application/json',
                    'set-cookie': ['session=abc123; Path=/'],
                },
                data: Buffer.from('{"result":"success"}'),
            };

            mockAxios.mockResolvedValue(mockResponse);

            const cookie: Cookie = {
                id: 'cookie-1',
                name: 'session',
                value: 'abc123',
                domain: 'api.example.com',
                path: '/',
                httpOnly: false,
                secure: false,
                enabled: true,
            };

            mockCookieService.parseSetCookie.mockReturnValue(cookie);
            mockCookieService.mergeCookies.mockReturnValue([cookie]);

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
            };

            const result = await service.execute(request);

            expect(result.response.status).toBe(200);
            expect(result.newCookies).toHaveLength(1);
            expect(result.newCookies[0].name).toBe('session');
            expect(mockCookieService.saveAll).toHaveBeenCalledWith([cookie]);
        });

        it('should send existing cookies with request', async () => {
            mockCookieService.getCookiesForUrl.mockReturnValue('session=abc123; token=xyz789');

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
            };

            await service.execute(request);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Cookie: 'session=abc123; token=xyz789',
                    }),
                })
            );
        });

        it('should append params as string when provided', async () => {
            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/search',
                headers: {},
                params: 'q=test&page=1',
            };

            await service.execute(request);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: 'https://api.example.com/search?q=test&page=1',
                })
            );
        });

        it('should convert params object to query string', async () => {
            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/search',
                headers: {},
                params: { q: 'test', page: '1' },
            };

            await service.execute(request);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: expect.stringContaining('q=test'),
                })
            );
        });

        it('should apply authentication headers when auth is provided', async () => {
            const mockAuthService = {
                applyAuth: vi.fn().mockResolvedValue({
                    isOk: true,
                    isErr: false,
                    value: {
                        headers: { Authorization: 'Bearer token123' },
                    },
                }),
            };

            const mockAuthFactory = {
                getService: vi.fn().mockReturnValue(mockAuthService),
            };

            setAuthServiceFactory(mockAuthFactory);

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const auth: HttpAuth = {
                id: 'auth-1',
                enabled: true,
                type: 'bearer',
                name: 'Test Auth',
                token: 'token123',
            };

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/secure',
                headers: {},
                auth,
            };

            await service.execute(request);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer token123',
                    }),
                })
            );
        });

        it('should apply authentication query params when auth provides them', async () => {
            const mockAuthService = {
                applyAuth: vi.fn().mockResolvedValue({
                    isOk: true,
                    isErr: false,
                    value: {
                        queryParams: { api_key: 'key123', token: 'abc' },
                    },
                }),
            };

            const mockAuthFactory = {
                getService: vi.fn().mockReturnValue(mockAuthService),
            };

            setAuthServiceFactory(mockAuthFactory);

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const auth: HttpAuth = {
                id: 'auth-1',
                enabled: true,
                type: 'apikey',
                name: 'API Key Auth',
                apiKey: 'key123',
            };

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
                auth,
            };

            await service.execute(request);

            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: expect.stringContaining('api_key=key123'),
                })
            );
        });

        it('should handle internally processed auth (like Digest)', async () => {
            const mockInternalResponse = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                data: Buffer.from('{"result":"authenticated"}'),
            };

            const mockAuthService = {
                applyAuth: vi.fn().mockResolvedValue({
                    isOk: true,
                    isErr: false,
                    value: {
                        handledInternally: true,
                        response: mockInternalResponse,
                    },
                }),
            };

            const mockAuthFactory = {
                getService: vi.fn().mockReturnValue(mockAuthService),
            };

            setAuthServiceFactory(mockAuthFactory);

            const auth: HttpAuth = {
                id: 'auth-1',
                enabled: true,
                type: 'digest',
                name: 'Digest Auth',
                username: 'user',
                password: 'pass',
            };

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/secure',
                headers: {},
                auth,
            };

            const result = await service.execute(request);

            // Should not call axios (auth handled internally)
            expect(mockAxios).not.toHaveBeenCalled();

            // Should return the internal response
            expect(result.response.status).toBe(200);
            expect(result.response.statusText).toBe('OK');
        });

        it('should throw error when auth fails', async () => {
            const mockAuthService = {
                applyAuth: vi.fn().mockResolvedValue({
                    isOk: false,
                    isErr: true,
                    error: 'Invalid credentials',
                }),
            };

            const mockAuthFactory = {
                getService: vi.fn().mockReturnValue(mockAuthService),
            };

            setAuthServiceFactory(mockAuthFactory);

            const auth: HttpAuth = {
                id: 'auth-1',
                enabled: true,
                type: 'basic',
                name: 'Basic Auth',
                username: 'user',
                password: 'wrong',
            };

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/secure',
                headers: {},
                auth,
            };

            const result = await service.execute(request);

            // Should return error response
            expect(result.response.status).toBe(0);
            // Body is base64 encoded - decode it to check
            const decodedBody = Buffer.from(result.response.body, 'base64').toString('utf8');
            expect(decodedBody).toContain('Invalid credentials');
        });

        it('should handle errors and return error response', async () => {
            mockAxios.mockRejectedValue({
                response: {
                    status: 500,
                    statusText: 'Internal Server Error',
                    headers: { 'content-type': 'text/plain' },
                    data: Buffer.from('Server error'),
                },
            });

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'POST',
                url: 'https://api.example.com/create',
                headers: {},
                body: { name: 'test' },
            };

            const result = await service.execute(request);

            expect(result.response.status).toBe(500);
            expect(result.response.statusText).toBe('Internal Server Error');
            expect(result.newCookies).toHaveLength(0);
        });

        it('should calculate elapsed time', async () => {
            mockAxios.mockImplementation(() => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        resolve({
                            status: 200,
                            statusText: 'OK',
                            headers: {},
                            data: Buffer.from(''),
                        });
                    }, 100);
                });
            });

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/slow',
                headers: {},
            };

            const result = await service.execute(request);

            expect(result.response.elapsedTime).toBeGreaterThanOrEqual(100);
        });

        it('should calculate response size', async () => {
            const responseData = Buffer.from('This is a test response');

            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: responseData,
            });

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
            };

            const result = await service.execute(request);

            expect(result.response.size).toBe(responseData.byteLength);
        });

        it('should skip auth when auth is disabled', async () => {
            mockAxios.mockResolvedValue({
                status: 200,
                statusText: 'OK',
                headers: {},
                data: Buffer.from(''),
            });

            const auth: HttpAuth = {
                id: 'auth-1',
                enabled: false, // Disabled
                type: 'basic',
                name: 'Basic Auth',
                username: 'user',
                password: 'pass',
            };

            const request: HttpRequestConfig = {
                id: 'req-1',
                method: 'GET',
                url: 'https://api.example.com/data',
                headers: {},
                auth,
            };

            await service.execute(request);

            // Should not have Authorization header
            expect(mockAxios).toHaveBeenCalledWith(
                expect.objectContaining({
                    headers: expect.not.objectContaining({
                        Authorization: expect.anything(),
                    }),
                })
            );
        });
    });
});
