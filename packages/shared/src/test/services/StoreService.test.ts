import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreService } from '../../services/StoreService.js';
import { MockFileSystem } from '../mocks/fs.js';
import { setGlobalSettingsProvider, setSecurityServiceInstance } from '../../services/BaseStorageService.js';
import type { AuthEntry, Proxy, Cert, GlobalValidationRule, AppSettings } from '../../types.js';
import { CertType } from '../../types.js';
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

// Mock https module - using a class to support 'new' operator
vi.mock('https', () => ({
  Agent: class MockAgent {
    options: any;
    constructor(options: any) {
      this.options = options;
    }
  },
}));

describe('StoreService', () => {
  let service: StoreService;
  const testStoreDir = '/home/testuser/.waveclient/store';

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

    service = new StoreService();
    mockFs.addDirectory(testStoreDir);
  });

  describe('Auth methods', () => {
    const authFile = path.join(testStoreDir, 'auth.json');

    describe('loadAuths', () => {
      it('should load all auth entries', async () => {
        const auths: AuthEntry[] = [
          {
            id: 'auth-1',
            name: 'API Key Auth',
            type: 'apikey',
            domainFilters: ['api.example.com'],
            enabled: true,
          },
        ];

        mockFs.setFile(authFile, JSON.stringify(auths));

        const result = await service.loadAuths();

        expect(result).toEqual(auths);
      });

      it('should return empty array when no auths exist', async () => {
        const result = await service.loadAuths();

        expect(result).toEqual([]);
      });
    });

    describe('saveAuths', () => {
      it('should save auth entries to file', async () => {
        const auths: AuthEntry[] = [
          {
            id: 'auth-1',
            name: 'Bearer Token',
            type: 'bearer',
            domainFilters: ['api.example.com'],
            enabled: true,
          },
        ];

        await service.saveAuths(auths);

        const saved = mockFs.getFile(authFile);
        expect(JSON.parse(saved!)).toEqual(auths);
      });
    });
  });

  describe('Proxy methods', () => {
    const proxiesFile = path.join(testStoreDir, 'proxies.json');

    describe('loadProxies', () => {
      it('should load all proxy configurations', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'Corporate Proxy',
            url: 'http://proxy.company.com:8080',
            enabled: true,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.loadProxies();

        expect(result).toEqual(proxies);
      });
    });

    describe('saveProxies', () => {
      it('should save proxy configurations', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'Test Proxy',
            url: 'http://localhost:8080',
            enabled: true,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        await service.saveProxies(proxies);

        const saved = mockFs.getFile(proxiesFile);
        expect(JSON.parse(saved!)).toEqual(proxies);
      });
    });

    describe('getProxyForUrl', () => {
      it('should return proxy config for matching URL', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'API Proxy',
            url: 'http://proxy.example.com:8080',
            enabled: true,
            domainFilters: ['api.example.com'],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://api.example.com/data');

        expect(result).toBeDefined();
        expect(result?.host).toBe('proxy.example.com');
        expect(result?.port).toBe(8080);
      });

      it('should return null for non-matching URL', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'API Proxy',
            url: 'http://proxy.example.com:8080',
            enabled: true,
            domainFilters: ['api.example.com'],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://other.example.com/data');

        expect(result).toBeNull();
      });

      it('should skip excluded domains', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'Global Proxy',
            url: 'http://proxy.example.com:8080',
            enabled: true,
            domainFilters: [],
            excludeDomains: ['internal.example.com'],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://internal.example.com/data');

        expect(result).toBeNull();
      });

      it('should apply to all domains when domainFilters is empty', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'Global Proxy',
            url: 'http://proxy.example.com:8080',
            enabled: true,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://any-domain.com/data');

        expect(result).toBeDefined();
        expect(result?.host).toBe('proxy.example.com');
      });

      it('should skip disabled proxies', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'Disabled Proxy',
            url: 'http://proxy.example.com:8080',
            enabled: false,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://api.example.com/data');

        expect(result).toBeNull();
      });

      it('should include proxy authentication', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'Auth Proxy',
            url: 'http://proxy.example.com:8080',
            userName: 'user',
            password: 'pass',
            enabled: true,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://api.example.com/data');

        expect(result?.auth).toBeDefined();
        expect(result?.auth?.username).toBe('user');
        expect(result?.auth?.password).toBe('pass');
      });

      it('should use default port for HTTP', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'HTTP Proxy',
            url: 'http://proxy.example.com',
            enabled: true,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://api.example.com/data');

        expect(result?.port).toBe(80);
      });

      it('should use default port for HTTPS', async () => {
        const proxies: Proxy[] = [
          {
            id: 'proxy-1',
            name: 'HTTPS Proxy',
            url: 'https://proxy.example.com',
            enabled: true,
            domainFilters: [],
            excludeDomains: [],
          },
        ];

        mockFs.setFile(proxiesFile, JSON.stringify(proxies));

        const result = await service.getProxyForUrl('https://api.example.com/data');

        expect(result?.port).toBe(443);
      });
    });
  });

  describe('Certificate methods', () => {
    const certsFile = path.join(testStoreDir, 'certs.json');

    describe('loadCerts', () => {
      it('should load all certificate configurations', async () => {
        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'My Cert',
            type: CertType.CA,
            certFile: 'cert-content',
            domainFilters: ['secure.example.com'],
            enabled: true,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.loadCerts();

        expect(result).toEqual(certs);
      });
    });

    describe('saveCerts', () => {
      it('should save certificate configurations', async () => {
        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'Test Cert',
            type: CertType.SELF_SIGNED,
            certFile: 'cert-data',
            keyFile: 'key-data',
            domainFilters: ['test.example.com'],
            enabled: true,
          },
        ];

        await service.saveCerts(certs);

        const saved = mockFs.getFile(certsFile);
        expect(JSON.parse(saved!)).toEqual(certs);
      });
    });

    describe('getHttpsAgentForUrl', () => {
      it('should return null for HTTP URLs', async () => {
        const result = await service.getHttpsAgentForUrl('http://example.com');

        expect(result).toBeNull();
      });

      it('should return CA agent for matching domain', async () => {
        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'CA Cert',
            type: CertType.CA,
            certFile: 'ca-cert-content',
            domainFilters: ['secure.example.com'],
            enabled: true,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.getHttpsAgentForUrl('https://secure.example.com/api');

        expect(result).toBeDefined();
      });

      it('should return self-signed agent for matching domain', async () => {
        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'Self-Signed Cert',
            type: CertType.SELF_SIGNED,
            certFile: 'cert-content',
            keyFile: 'key-content',
            domainFilters: ['localhost'],
            enabled: true,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.getHttpsAgentForUrl('https://localhost:3000/api');

        expect(result).toBeDefined();
      });

      it('should skip disabled certs', async () => {
        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'Disabled Cert',
            type: CertType.CA,
            certFile: 'cert-content',
            domainFilters: ['example.com'],
            enabled: false,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.getHttpsAgentForUrl('https://example.com');

        expect(result).toBeNull();
      });

      it('should skip expired certs', async () => {
        const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'Expired Cert',
            type: CertType.CA,
            certFile: 'cert-content',
            domainFilters: ['example.com'],
            expiryDate: pastDate,
            enabled: true,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.getHttpsAgentForUrl('https://example.com');

        expect(result).toBeNull();
      });

      it('should include non-expired certs', async () => {
        const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'Valid Cert',
            type: CertType.CA,
            certFile: 'cert-content',
            domainFilters: ['example.com'],
            expiryDate: futureDate,
            enabled: true,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.getHttpsAgentForUrl('https://example.com');

        expect(result).toBeDefined();
      });

      it('should return null for non-matching domain', async () => {
        const certs: Cert[] = [
          {
            id: 'cert-1',
            name: 'Cert',
            type: CertType.CA,
            certFile: 'cert-content',
            domainFilters: ['specific.example.com'],
            enabled: true,
          },
        ];

        mockFs.setFile(certsFile, JSON.stringify(certs));

        const result = await service.getHttpsAgentForUrl('https://other.example.com');

        expect(result).toBeNull();
      });
    });
  });

  describe('Validation Rules methods', () => {
    const validationFile = path.join(testStoreDir, 'validation-rules.json');

    describe('loadValidationRules', () => {
      it('should load all validation rules', async () => {
        const rules: GlobalValidationRule[] = [
          {
            id: 'rule-1',
            name: 'Status Check',
            category: 'status',
            enabled: true,
            config: { operator: 'equals', value: '200' },
          },
        ];

        mockFs.setFile(validationFile, JSON.stringify(rules));

        const result = await service.loadValidationRules();

        expect(result).toEqual(rules);
      });
    });

    describe('saveValidationRules', () => {
      it('should save validation rules', async () => {
        const rules: GlobalValidationRule[] = [
          {
            id: 'rule-1',
            name: 'Body Validation',
            category: 'body',
            enabled: true,
            config: { operator: 'contains', value: 'success' },
          },
        ];

        await service.saveValidationRules(rules);

        const saved = mockFs.getFile(validationFile);
        expect(JSON.parse(saved!)).toEqual(rules);
      });
    });

    describe('getValidationRuleById', () => {
      it('should return rule by ID', async () => {
        const rules: GlobalValidationRule[] = [
          {
            id: 'rule-1',
            name: 'Test Rule',
            category: 'status',
            enabled: true,
            config: { operator: 'equals', value: '200' },
          },
          {
            id: 'rule-2',
            name: 'Another Rule',
            category: 'body',
            enabled: true,
            config: { operator: 'contains', value: 'data' },
          },
        ];

        mockFs.setFile(validationFile, JSON.stringify(rules));

        const result = await service.getValidationRuleById('rule-2');

        expect(result).toMatchObject(rules[1]);
      });

      it('should return null if rule not found', async () => {
        const rules: GlobalValidationRule[] = [];

        mockFs.setFile(validationFile, JSON.stringify(rules));

        const result = await service.getValidationRuleById('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getValidationRulesByIds', () => {
      it('should return multiple rules by IDs', async () => {
        const rules: GlobalValidationRule[] = [
          {
            id: 'rule-1',
            name: 'Rule 1',
            category: 'status',
            enabled: true,
            config: { operator: 'equals', value: '200' },
          },
          {
            id: 'rule-2',
            name: 'Rule 2',
            category: 'body',
            enabled: true,
            config: { operator: 'contains', value: 'data' },
          },
          {
            id: 'rule-3',
            name: 'Rule 3',
            category: 'header',
            enabled: true,
            config: { operator: 'exists', value: 'Content-Type' },
          },
        ];

        mockFs.setFile(validationFile, JSON.stringify(rules));

        const result = await service.getValidationRulesByIds(['rule-1', 'rule-3']);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('rule-1');
        expect(result[1].id).toBe('rule-3');
      });

      it('should return empty array for no matches', async () => {
        const rules: GlobalValidationRule[] = [];

        mockFs.setFile(validationFile, JSON.stringify(rules));

        const result = await service.getValidationRulesByIds(['rule-1', 'rule-2']);

        expect(result).toEqual([]);
      });
    });
  });
});
