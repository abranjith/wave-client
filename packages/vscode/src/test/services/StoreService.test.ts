import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StoreService, type AuthEntry, type AxiosProxyConfig, CertType, type Proxy, type Cert, type GlobalValidationRule } from '../../services';
import '../../services/SecurityService';

describe('StoreService', () => {
    let service: StoreService;
    let testDir: string;

    beforeEach(() => {
        service = new StoreService();
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-store-test-'));
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    // ==================== Auth Tests ====================

    describe('loadAuths', () => {
        it('should load auth configurations from storage', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const auths: AuthEntry[] = [
                { id: 'auth1', name: 'Basic Auth', type: 'basic', username: 'user1', password: 'pass1' },
                { id: 'auth2', name: 'Bearer Token', type: 'bearer', token: 'token123' },
            ];

            fs.writeFileSync(path.join(storeDir, 'auth.json'), JSON.stringify(auths));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAuths();

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('auth1');
            expect(result[0].type).toBe('basic');
            expect(result[1].id).toBe('auth2');
            expect(result[1].type).toBe('bearer');
        });

        it('should return empty array if auth file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadAuths();

            expect(result).toEqual([]);
        });
    });

    describe('saveAuths', () => {
        it('should save auth configurations to storage', async () => {
            const storeDir = path.join(testDir, 'store');
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const auths: AuthEntry[] = [
                { id: 'auth1', name: 'API Key', type: 'apikey', key: 'api-key-123' },
            ];

            await service.saveAuths(auths);

            const savedFile = path.join(storeDir, 'auth.json');
            expect(fs.existsSync(savedFile)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(savedFile, 'utf-8'));
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('auth1');
            expect(savedData[0].type).toBe('apikey');
        });
    });

    // ==================== Proxy Tests ====================

    describe('loadProxies', () => {
        it('should load proxy configurations from storage', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Corporate Proxy',
                    url: 'http://proxy.corp.com:8080',
                    enabled: true,
                    domainFilters: ['*.corp.com'],
                    excludeDomains: [],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadProxies();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('proxy1');
            expect(result[0].url).toBe('http://proxy.corp.com:8080');
        });

        it('should return empty array if proxies file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadProxies();

            expect(result).toEqual([]);
        });
    });

    describe('saveProxies', () => {
        it('should save proxy configurations to storage', async () => {
            const storeDir = path.join(testDir, 'store');
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Test Proxy',
                    url: 'http://localhost:8888',
                    enabled: true,
                    domainFilters: [],
                    excludeDomains: [],
                },
            ];

            await service.saveProxies(proxies);

            const savedFile = path.join(storeDir, 'proxies.json');
            expect(fs.existsSync(savedFile)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(savedFile, 'utf-8'));
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('proxy1');
        });
    });

    describe('getProxyForUrl', () => {
        it('should return proxy config for matching URL', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Corporate Proxy',
                    url: 'http://proxy.corp.com:8080',
                    enabled: true,
                    domainFilters: ['*.corp.com'],
                    excludeDomains: [],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getProxyForUrl('https://api.corp.com/endpoint');

            expect(result).not.toBeNull();
            expect(result?.protocol).toBe('http');
            expect(result?.host).toBe('proxy.corp.com');
            expect(result?.port).toBe(8080);
        });

        it('should return null if proxy is disabled', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Disabled Proxy',
                    url: 'http://proxy.com:8080',
                    enabled: false,
                    domainFilters: ['*.example.com'],
                    excludeDomains: [],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getProxyForUrl('https://api.example.com/endpoint');

            expect(result).toBeNull();
        });

        it('should return null if URL is in exclude list', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Proxy with Excludes',
                    url: 'http://proxy.com:8080',
                    enabled: true,
                    domainFilters: [],
                    excludeDomains: ['*.excluded.com'],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getProxyForUrl('https://api.excluded.com/endpoint');

            expect(result).toBeNull();
        });

        it('should return proxy for URL when domain filters are empty', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Universal Proxy',
                    url: 'http://proxy.com:8080',
                    enabled: true,
                    domainFilters: [],
                    excludeDomains: [],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getProxyForUrl('https://any.domain.com/endpoint');

            expect(result).not.toBeNull();
            expect(result?.host).toBe('proxy.com');
        });

        it('should include auth in proxy config when credentials are provided', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'Authenticated Proxy',
                    url: 'http://proxy.com:8080',
                    enabled: true,
                    userName: 'proxyuser',
                    password: 'proxypass',
                    domainFilters: [],
                    excludeDomains: [],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getProxyForUrl('https://api.example.com/endpoint');

            expect(result).not.toBeNull();
            expect(result?.auth).toBeDefined();
            expect(result?.auth?.username).toBe('proxyuser');
            expect(result?.auth?.password).toBe('proxypass');
        });

        it('should use default port 443 for HTTPS proxies', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const proxies: Proxy[] = [
                {
                    id: 'proxy1',
                    name: 'HTTPS Proxy',
                    url: 'https://proxy.com',
                    enabled: true,
                    domainFilters: [],
                    excludeDomains: [],
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'proxies.json'), JSON.stringify(proxies));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getProxyForUrl('https://api.example.com/endpoint');

            expect(result).not.toBeNull();
            expect(result?.port).toBe(443);
        });

        it('should return null on error', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(service as any, 'getAppDirFromSettings').mockRejectedValue(new Error('Test error'));

            const result = await service.getProxyForUrl('https://api.example.com/endpoint');

            expect(result).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    // ==================== Certificate Tests ====================

    describe('loadCerts', () => {
        it('should load certificate configurations from storage', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'CA Cert',
                    type: CertType.CA,
                    enabled: true,
                    domainFilters: ['*.secure.com'],
                    certFile: 'ca-cert-content',
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadCerts();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('cert1');
            expect(result[0].type).toBe(CertType.CA);
        });

        it('should return empty array if certs file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadCerts();

            expect(result).toEqual([]);
        });
    });

    describe('saveCerts', () => {
        it('should save certificate configurations to storage', async () => {
            const storeDir = path.join(testDir, 'store');
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'Test Cert',
                    type: CertType.CA,
                    enabled: true,
                    domainFilters: ['*.test.com'],
                    certFile: 'cert-content',
                },
            ];

            await service.saveCerts(certs);

            const savedFile = path.join(storeDir, 'certs.json');
            expect(fs.existsSync(savedFile)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(savedFile, 'utf-8'));
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('cert1');
        });
    });

    describe('getHttpsAgentForUrl', () => {
        it('should return null for non-HTTPS URLs', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('http://api.example.com/endpoint');

            expect(result).toBeNull();
        });

        it('should return HTTPS agent for matching CA certificate', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'CA Cert',
                    type: CertType.CA,
                    enabled: true,
                    domainFilters: ['*.secure.com'],
                    certFile: 'ca-cert-content',
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('https://api.secure.com/endpoint');

            expect(result).not.toBeNull();
            expect(result).toBeDefined();
        });

        it('should return HTTPS agent for matching self-signed certificate', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'Self-Signed Cert',
                    type: CertType.SELF_SIGNED,
                    enabled: true,
                    domainFilters: ['*.myapp.com'],
                    certFile: 'cert-content',
                    keyFile: 'key-content',
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('https://api.myapp.com/endpoint');

            expect(result).not.toBeNull();
            expect(result).toBeDefined();
        });

        it('should skip disabled certificates', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'Disabled Cert',
                    type: CertType.CA,
                    enabled: false,
                    domainFilters: ['*.secure.com'],
                    certFile: 'ca-cert-content',
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('https://api.secure.com/endpoint');

            expect(result).toBeNull();
        });

        it('should skip certificates with non-matching domains', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'Cert',
                    type: CertType.CA,
                    enabled: true,
                    domainFilters: ['*.secure.com'],
                    certFile: 'ca-cert-content',
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('https://api.other.com/endpoint');

            expect(result).toBeNull();
        });

        it('should skip expired certificates', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'Expired Cert',
                    type: CertType.CA,
                    enabled: true,
                    domainFilters: ['*.secure.com'],
                    certFile: 'ca-cert-content',
                    expiryDate: yesterday.toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('https://api.secure.com/endpoint');

            expect(result).toBeNull();
        });

        it('should use valid certificates that have not expired', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            const certs: Cert[] = [
                {
                    id: 'cert1',
                    name: 'Valid Cert',
                    type: CertType.CA,
                    enabled: true,
                    domainFilters: ['*.secure.com'],
                    certFile: 'ca-cert-content',
                    expiryDate: tomorrow.toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'certs.json'), JSON.stringify(certs));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getHttpsAgentForUrl('https://api.secure.com/endpoint');

            expect(result).not.toBeNull();
        });

        it('should return null on error', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(service as any, 'getAppDirFromSettings').mockRejectedValue(new Error('Test error'));

            const result = await service.getHttpsAgentForUrl('https://api.example.com/endpoint');

            expect(result).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    // ==================== Validation Rules Tests ====================

    describe('loadValidationRules', () => {
        it('should load validation rules from storage', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Response Time Check',
                    enabled: true,
                    category: 'time',
                    operator: 'less_than',
                    value: 500,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'validation-rules.json'), JSON.stringify(rules));

            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadValidationRules();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('rule1');
            expect(result[0].name).toBe('Response Time Check');
        });

        it('should return empty array if validation rules file does not exist', async () => {
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.loadValidationRules();

            expect(result).toEqual([]);
        });
    });

    describe('saveValidationRules', () => {
        it('should save validation rules to storage', async () => {
            const storeDir = path.join(testDir, 'store');
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Status Code Check',
                    enabled: true,
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            await service.saveValidationRules(rules);

            const savedFile = path.join(storeDir, 'validation-rules.json');
            expect(fs.existsSync(savedFile)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(savedFile, 'utf-8'));
            expect(savedData).toHaveLength(1);
            expect(savedData[0].id).toBe('rule1');
        });
    });

    describe('getValidationRuleById', () => {
        it('should return validation rule by ID', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Rule 1',
                    enabled: true,
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    id: 'rule2',
                    name: 'Rule 2',
                    enabled: true,
                    category: 'time',
                    operator: 'less_than',
                    value: 1000,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'validation-rules.json'), JSON.stringify(rules));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getValidationRuleById('rule2');

            expect(result).not.toBeNull();
            expect(result?.id).toBe('rule2');
            expect(result?.name).toBe('Rule 2');
        });

        it('should return null if rule ID is not found', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Rule 1',
                    enabled: true,
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'validation-rules.json'), JSON.stringify(rules));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getValidationRuleById('non-existent');

            expect(result).toBeNull();
        });
    });

    describe('getValidationRulesByIds', () => {
        it('should return multiple validation rules by IDs', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Rule 1',
                    enabled: true,
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    id: 'rule2',
                    name: 'Rule 2',
                    enabled: true,
                    category: 'time',
                    operator: 'less_than',
                    value: 1000,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    id: 'rule3',
                    name: 'Rule 3',
                    enabled: true,
                    category: 'header',
                    operator: 'contains',
                    value: 'application/json',
                    headerName: 'Content-Type',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'validation-rules.json'), JSON.stringify(rules));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getValidationRulesByIds(['rule1', 'rule3']);

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('rule1');
            expect(result[1].id).toBe('rule3');
        });

        it('should omit missing rule IDs from results', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Rule 1',
                    enabled: true,
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'validation-rules.json'), JSON.stringify(rules));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getValidationRulesByIds(['rule1', 'non-existent', 'also-missing']);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('rule1');
        });

        it('should return empty array if no IDs match', async () => {
            const storeDir = path.join(testDir, 'store');
            fs.mkdirSync(storeDir, { recursive: true });

            const rules: GlobalValidationRule[] = [
                {
                    id: 'rule1',
                    name: 'Rule 1',
                    enabled: true,
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            fs.writeFileSync(path.join(storeDir, 'validation-rules.json'), JSON.stringify(rules));
            vi.spyOn(service as any, 'getAppDirFromSettings').mockResolvedValue(testDir);

            const result = await service.getValidationRulesByIds(['non-existent', 'also-missing']);

            expect(result).toEqual([]);
        });
    });
});
