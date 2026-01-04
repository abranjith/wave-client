import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CookieService } from '../../services/CookieService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { Cookie, AppSettings } from '../../types.js';
import * as path from 'path';

// Create mock instance
const mockFs = new MockFileSystem();

// Mock fs module
vi.mock('fs', () => {
  return {
    existsSync: vi.fn((path: string) => mockFs.hasFile(path) || mockFs.hasDirectory(path)),
    readFileSync: vi.fn((path: string) => {
      const content = mockFs.getFile(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    }),
    writeFileSync: vi.fn((path: string, data: string) => mockFs.setFile(path, data)),
    mkdirSync: vi.fn((path: string) => mockFs.addDirectory(path)),
    unlinkSync: vi.fn((path: string) => {
      if (!mockFs.hasFile(path)) {
        throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
      }
      mockFs.deleteFile(path);
    }),
    readdirSync: vi.fn((path: string) => mockFs.getFilesInDirectory(path)),
  };
});

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-123'),
}));

describe('CookieService', () => {
  let service: CookieService;
  const testStoreDir = '/home/testuser/.waveclient/store';
  const cookiesFile = path.join(testStoreDir, 'cookies.json');

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
      readEncryptedFile: vi.fn(async (filePath: string, defaultValue: any): Promise<any> => {
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
      writeEncryptedFile: vi.fn(async (filePath: string, data: any): Promise<void> => {
        mockFs.setFile(filePath, JSON.stringify(data, null, 2));
      }),
    };

    setSecurityServiceInstance(mockSecurityService as any);

    service = new CookieService();
    mockFs.addDirectory(testStoreDir);
  });

  describe('loadAll', () => {
    it('should load all cookies', async () => {
      const cookies: Cookie[] = [
        {
          id: 'cookie-1',
          name: 'session',
          value: 'abc123',
          domain: 'example.com',
          path: '/',
          httpOnly: false,
          secure: false,
          enabled: true,
        },
      ];

      mockFs.setFile(cookiesFile, JSON.stringify(cookies));

      const result = await service.loadAll();

      expect(result).toEqual(cookies);
    });

    it('should return empty array when no cookies exist', async () => {
      const result = await service.loadAll();

      expect(result).toEqual([]);
    });
  });

  describe('saveAll', () => {
    it('should save cookies to file', async () => {
      const cookies: Cookie[] = [
        {
          id: 'cookie-1',
          name: 'token',
          value: 'xyz789',
          domain: 'api.example.com',
          path: '/',
          httpOnly: true,
          secure: true,
          enabled: true,
        },
      ];

      await service.saveAll(cookies);

      const saved = mockFs.getFile(cookiesFile);
      expect(JSON.parse(saved!)).toEqual(cookies);
    });
  });

  describe('getCookiesForUrl', () => {
    const baseCookies: Cookie[] = [
      {
        id: '1',
        name: 'session',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        httpOnly: false,
        secure: false,
        enabled: true,
      },
      {
        id: '2',
        name: 'tracking',
        value: 'xyz789',
        domain: 'api.example.com',
        path: '/v1',
        httpOnly: false,
        secure: false,
        enabled: true,
      },
      {
        id: '3',
        name: 'secure-token',
        value: 'secret',
        domain: 'example.com',
        path: '/',
        httpOnly: true,
        secure: true,
        enabled: true,
      },
    ];

    it('should return cookies matching domain', () => {
      const result = service.getCookiesForUrl(baseCookies, 'https://example.com/page');

      expect(result).toContain('session=abc123');
      expect(result).toContain('secure-token=secret');
      expect(result).not.toContain('tracking');
    });

    it('should filter by path', () => {
      const result = service.getCookiesForUrl(baseCookies, 'https://api.example.com/v1/users');

      expect(result).toBe('tracking=xyz789');
    });

    it('should not include path-mismatched cookies', () => {
      const result = service.getCookiesForUrl(baseCookies, 'https://api.example.com/v2/posts');

      expect(result).toBe('');
    });

    it('should respect secure flag', () => {
      const result = service.getCookiesForUrl(baseCookies, 'http://example.com/page');

      expect(result).toContain('session=abc123');
      expect(result).not.toContain('secure-token');
    });

    it('should filter out disabled cookies', () => {
      const cookies = [
        { ...baseCookies[0], enabled: false },
        baseCookies[1],
      ];

      const result = service.getCookiesForUrl(cookies, 'https://example.com');

      expect(result).not.toContain('session');
    });

    it('should filter out expired cookies', () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000 * 60 * 60).toISOString(); // 1 hour ago

      const cookies = [
        { ...baseCookies[0], expires: pastDate },
      ];

      const result = service.getCookiesForUrl(cookies, 'https://example.com');

      expect(result).toBe('');
    });

    it('should include non-expired cookies', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 1000 * 60 * 60).toISOString(); // 1 hour from now

      const cookies = [
        { ...baseCookies[0], expires: futureDate },
      ];

      const result = service.getCookiesForUrl(cookies, 'https://example.com');

      expect(result).toBe('session=abc123');
    });

    it('should return empty string for invalid URL', () => {
      const result = service.getCookiesForUrl(baseCookies, 'not-a-valid-url');

      expect(result).toBe('');
    });
  });

  describe('parseSetCookie', () => {
    it('should parse basic Set-Cookie header', () => {
      const cookie = service.parseSetCookie('sessionId=abc123', 'example.com');

      expect(cookie).toMatchObject({
        name: 'sessionId',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        httpOnly: false,
        secure: false,
        enabled: true,
      });
    });

    it('should parse Set-Cookie with domain attribute', () => {
      const cookie = service.parseSetCookie('token=xyz; Domain=api.example.com', 'example.com');

      expect(cookie?.domain).toBe('api.example.com');
    });

    it('should parse Set-Cookie with path attribute', () => {
      const cookie = service.parseSetCookie('token=xyz; Path=/api', 'example.com');

      expect(cookie?.path).toBe('/api');
    });

    it('should parse Set-Cookie with Expires attribute', () => {
      const cookie = service.parseSetCookie(
        'token=xyz; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
        'example.com'
      );

      expect(cookie?.expires).toBeDefined();
    });

    it('should parse Set-Cookie with Max-Age attribute', () => {
      const cookie = service.parseSetCookie('token=xyz; Max-Age=3600', 'example.com');

      expect(cookie?.expires).toBeDefined();
    });

    it('should parse Set-Cookie with Secure flag', () => {
      const cookie = service.parseSetCookie('token=xyz; Secure', 'example.com');

      expect(cookie?.secure).toBe(true);
    });

    it('should parse Set-Cookie with HttpOnly flag', () => {
      const cookie = service.parseSetCookie('token=xyz; HttpOnly', 'example.com');

      expect(cookie?.httpOnly).toBe(true);
    });

    it('should parse Set-Cookie with SameSite attribute', () => {
      const cookie = service.parseSetCookie('token=xyz; SameSite=Strict', 'example.com');

      expect(cookie?.sameSite).toBe('Strict');
    });

    it('should parse complex Set-Cookie header', () => {
      const cookie = service.parseSetCookie(
        'session=abc123; Domain=example.com; Path=/; Secure; HttpOnly; SameSite=Lax',
        'example.com'
      );

      expect(cookie).toMatchObject({
        name: 'session',
        value: 'abc123',
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'Lax',
      });
    });

    it('should return null for invalid Set-Cookie header', () => {
      const cookie = service.parseSetCookie('invalid', 'example.com');

      expect(cookie).toBeNull();
    });

    it('should return null for empty header', () => {
      const cookie = service.parseSetCookie('', 'example.com');

      expect(cookie).toBeNull();
    });
  });

  describe('mergeCookies', () => {
    it('should merge new cookies with existing ones', () => {
      const existing: Cookie[] = [
        {
          id: '1',
          name: 'cookie1',
          value: 'old',
          domain: 'example.com',
          path: '/',
          httpOnly: false,
          secure: false,
          enabled: true,
        },
      ];

      const newCookies: Cookie[] = [
        {
          id: '2',
          name: 'cookie2',
          value: 'new',
          domain: 'example.com',
          path: '/',
          httpOnly: false,
          secure: false,
          enabled: true,
        },
      ];

      const result = service.mergeCookies(existing, newCookies);

      expect(result).toHaveLength(2);
      expect(result.find(c => c.name === 'cookie1')).toBeDefined();
      expect(result.find(c => c.name === 'cookie2')).toBeDefined();
    });

    it('should update existing cookie with same domain and name', () => {
      const existing: Cookie[] = [
        {
          id: '1',
          name: 'session',
          value: 'old-value',
          domain: 'example.com',
          path: '/',
          httpOnly: false,
          secure: false,
          enabled: true,
        },
      ];

      const newCookies: Cookie[] = [
        {
          id: '2',
          name: 'session',
          value: 'new-value',
          domain: 'example.com',
          path: '/api',
          httpOnly: true,
          secure: true,
          enabled: true,
        },
      ];

      const result = service.mergeCookies(existing, newCookies);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('new-value');
      expect(result[0].path).toBe('/api');
      expect(result[0].httpOnly).toBe(true);
      expect(result[0].secure).toBe(true);
    });

    it('should not merge cookies with different domains', () => {
      const existing: Cookie[] = [
        {
          id: '1',
          name: 'session',
          value: 'value1',
          domain: 'example.com',
          path: '/',
          httpOnly: false,
          secure: false,
          enabled: true,
        },
      ];

      const newCookies: Cookie[] = [
        {
          id: '2',
          name: 'session',
          value: 'value2',
          domain: 'api.example.com',
          path: '/',
          httpOnly: false,
          secure: false,
          enabled: true,
        },
      ];

      const result = service.mergeCookies(existing, newCookies);

      expect(result).toHaveLength(2);
    });
  });
});
