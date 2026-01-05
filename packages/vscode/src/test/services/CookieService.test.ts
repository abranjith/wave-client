import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CookieService } from '../../services';
import '../../services/SecurityService';

describe('CookieService', () => {
    let service: CookieService;
    let testDir: string;

    beforeEach(() => {
        service = new CookieService();
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-cookies-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('loadAll', () => {
        it('should load all cookies from storage', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const cookies = [
                { id: 'c1', name: 'cookie1', value: 'value1', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false },
                { id: 'c2', name: 'cookie2', value: 'value2', domain: 'test.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            fs.writeFileSync(path.join(storeDir, 'cookies.json'), JSON.stringify(cookies));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('cookie1');
            expect(result[1].name).toBe('cookie2');
        });

        it('should return empty array if file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAll();

            expect(result).toEqual([]);
        });
    });

    describe('saveAll', () => {
        it('should save cookies to storage', async () => {
            const cookies = [
                { id: 'c1', name: 'cookie1', value: 'value1', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            await service.saveAll(cookies);

            const storeDir = path.join(testDir, 'store');
            const cookiesFile = path.join(storeDir, 'cookies.json');

            expect(fs.existsSync(cookiesFile)).toBe(true);

            const savedCookies = JSON.parse(fs.readFileSync(cookiesFile, 'utf-8'));
            expect(savedCookies).toHaveLength(1);
            expect(savedCookies[0].name).toBe('cookie1');
        });
    });

    describe('getCookiesForUrl', () => {
        it('should return cookies matching the domain', () => {
            const cookies = [
                { id: 'c1', name: 'cookie1', value: 'value1', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false },
                { id: 'c2', name: 'cookie2', value: 'value2', domain: 'test.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const result = service.getCookiesForUrl(cookies, 'https://example.com/api');

            expect(result).toContain('cookie1=value1');
            expect(result).not.toContain('cookie2=value2');
        });

        it('should return empty string for non-matching domains', () => {
            const cookies = [
                { id: 'c1', name: 'cookie1', value: 'value1', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const result = service.getCookiesForUrl(cookies, 'https://different.com/');

            expect(result).toBe('');
        });

        it('should exclude disabled cookies', () => {
            const cookies = [
                { id: 'c1', name: 'enabled', value: 'value1', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false },
                { id: 'c2', name: 'disabled', value: 'value2', domain: 'example.com', path: '/', enabled: false, httpOnly: false, secure: false }
            ];

            const result = service.getCookiesForUrl(cookies, 'https://example.com/');

            expect(result).toContain('enabled=value1');
            expect(result).not.toContain('disabled=value2');
        });
    });

    describe('parseSetCookie', () => {
        it('should parse a basic Set-Cookie header', () => {
            const setCookieHeader = 'session=abc123; Domain=example.com; Path=/';

            const result = service.parseSetCookie(setCookieHeader, 'example.com');

            expect(result).not.toBeNull();
            expect(result!.name).toBe('session');
            expect(result!.value).toBe('abc123');
            expect(result!.domain).toBe('example.com');
            expect(result!.path).toBe('/');
        });

        it('should parse Set-Cookie with Max-Age', () => {
            const setCookieHeader = 'id=123; Max-Age=3600';

            const result = service.parseSetCookie(setCookieHeader, 'example.com');

            expect(result).not.toBeNull();
            expect(result!.name).toBe('id');
            expect(result!.expires).toBeDefined();
        });

        it('should parse Set-Cookie with Secure and HttpOnly flags', () => {
            const setCookieHeader = 'secure=value; Secure; HttpOnly';

            const result = service.parseSetCookie(setCookieHeader, 'example.com');

            expect(result).not.toBeNull();
            expect(result!.secure).toBe(true);
            expect(result!.httpOnly).toBe(true);
        });

        it('should use default domain if not specified', () => {
            const setCookieHeader = 'cookie=value';

            const result = service.parseSetCookie(setCookieHeader, 'api.example.com');

            expect(result).not.toBeNull();
            expect(result!.domain).toBe('api.example.com');
        });

        it('should use default path "/" if not specified', () => {
            const setCookieHeader = 'cookie=value';

            const result = service.parseSetCookie(setCookieHeader, 'example.com');

            expect(result).not.toBeNull();
            expect(result!.path).toBe('/');
        });
    });

    describe('mergeCookies', () => {
        it('should merge new cookies with existing ones', () => {
            const existingCookies = [
                { id: 'c1', name: 'existing', value: 'old', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const newCookies = [
                { id: 'c2', name: 'new', value: 'fresh', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const result = service.mergeCookies(existingCookies, newCookies);

            expect(result).toHaveLength(2);
            expect(result.some(c => c.name === 'existing')).toBe(true);
            expect(result.some(c => c.name === 'new')).toBe(true);
        });

        it('should update existing cookies', () => {
            const existingCookies = [
                { id: 'c1', name: 'cookie', value: 'old', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const newCookies = [
                { id: 'c2', name: 'cookie', value: 'new', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const result = service.mergeCookies(existingCookies, newCookies);

            expect(result).toHaveLength(1);
            expect(result[0].value).toBe('new');
        });

        it('should include expired cookies in merge (filtering happens in getCookiesForUrl)', () => {
            const existingCookies = [
                { id: 'c1', name: 'valid', value: 'value', domain: 'example.com', path: '/', enabled: true, httpOnly: false, secure: false }
            ];

            const expiredDate = new Date(Date.now() - 86400000).toISOString();
            const newCookies = [
                { id: 'c2', name: 'expired', value: 'value', domain: 'example.com', path: '/', expires: expiredDate, enabled: true, httpOnly: false, secure: false }
            ];

            const result = service.mergeCookies(existingCookies, newCookies);

            // mergeCookies doesn't filter - it just merges
            // Expired cookies are filtered in getCookiesForUrl
            expect(result).toHaveLength(2);
            expect(result.some(c => c.name === 'valid')).toBe(true);
            expect(result.some(c => c.name === 'expired')).toBe(true);
        });
    });
});
