import { describe, it, expect } from 'vitest';
import {
  buildEnvVarsMap,
  getDictFromHeaderRows,
  getURLSearchParamsFromParamRows,
  convertBodyToRequestBody,
  getAuthForRequest,
  buildHttpRequest,
  type CollectionRequestInput,
} from '../../utils/requestBuilder';
import type { Environment, HeaderRow, ParamRow, MultiPartFormField, CollectionRequest } from '../../types/collection';
import type { RequestBody } from '../../types/tab';
import { type Auth, AuthType } from '../../types/auth';
import { generateUniqueId } from '../../utils/collectionParser';

// Helper to create EnvironmentVariable with default type
const envVar = (key: string, value: string, enabled: boolean = true) => ({
  key,
  value,
  type: 'default' as const,
  enabled,
});

// Helper to create HeaderRow with id
const headerRow = (key: string, value: string, disabled: boolean = false): HeaderRow => ({
  id: generateUniqueId(),
  key,
  value,
  disabled,
});

// Helper to create ParamRow with id
const paramRow = (key: string, value: string, disabled: boolean = false): ParamRow => ({
  id: generateUniqueId(),
  key,
  value,
  disabled,
});

// Helper to create MultiPartFormField
const multiPartField = (key: string, value: string, disabled: boolean = false): MultiPartFormField => ({
  id: generateUniqueId(),
  key,
  value,
  fieldType: 'text',
  disabled,
});

describe('requestBuilder', () => {
  describe('buildEnvVarsMap', () => {
    it('should create an empty map when no environments exist', () => {
      const result = buildEnvVarsMap([], null);
      expect(result.size).toBe(0);
    });

    it('should include enabled global variables', () => {
      const environments: Environment[] = [
        {
          id: 'global-env',
          name: 'Global',
          values: [
            envVar('API_URL', 'https://api.example.com'),
            envVar('API_KEY', 'secret'),
          ],
        },
      ];

      const result = buildEnvVarsMap(environments, null);

      expect(result.get('API_URL')).toBe('https://api.example.com');
      expect(result.get('API_KEY')).toBe('secret');
    });

    it('should exclude disabled global variables', () => {
      const environments: Environment[] = [
        {
          id: 'global-env',
          name: 'Global',
          values: [
            envVar('ENABLED', 'yes', true),
            envVar('DISABLED', 'no', false),
          ],
        },
      ];

      const result = buildEnvVarsMap(environments, null);

      expect(result.get('ENABLED')).toBe('yes');
      expect(result.has('DISABLED')).toBe(false);
    });

    it('should override global variables with active environment variables', () => {
      const environments: Environment[] = [
        {
          id: 'global-env',
          name: 'Global',
          values: [
            envVar('API_URL', 'https://api.example.com'),
            envVar('ENV', 'global'),
          ],
        },
        {
          id: 'dev-env',
          name: 'Development',
          values: [
            envVar('API_URL', 'https://dev.example.com'),
            envVar('DEBUG', 'true'),
          ],
        },
      ];

      const result = buildEnvVarsMap(environments, 'dev-env');

      expect(result.get('API_URL')).toBe('https://dev.example.com'); // Overridden
      expect(result.get('ENV')).toBe('global'); // From global
      expect(result.get('DEBUG')).toBe('true'); // From dev
    });

    it('should handle case-insensitive "global" environment name', () => {
      const environments: Environment[] = [
        {
          id: 'global-env',
          name: 'GLOBAL',
          values: [envVar('TEST', 'value')],
        },
      ];

      const result = buildEnvVarsMap(environments, null);

      expect(result.get('TEST')).toBe('value');
    });
  });

  describe('getDictFromHeaderRows', () => {
    it('should return empty object for empty header rows', () => {
      const result = getDictFromHeaderRows([], new Map(), new Set());
      expect(result).toEqual({});
    });

    it('should convert enabled headers to dictionary', () => {
      const headers: HeaderRow[] = [
        headerRow('Content-Type', 'application/json'),
        headerRow('Authorization', 'Bearer token'),
      ];

      const result = getDictFromHeaderRows(headers, new Map(), new Set());

      expect(result).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      });
    });

    it('should skip disabled headers', () => {
      const headers: HeaderRow[] = [
        headerRow('Enabled', 'yes', false),
        headerRow('Disabled', 'no', true),
      ];

      const result = getDictFromHeaderRows(headers, new Map(), new Set());

      expect(result).toEqual({
        Enabled: 'yes',
      });
    });

    it('should skip headers with empty keys', () => {
      const headers: HeaderRow[] = [
        headerRow('', 'value1'),
        headerRow('  ', 'value2'),
        headerRow('Valid', 'value3'),
      ];

      const result = getDictFromHeaderRows(headers, new Map(), new Set());

      expect(result).toEqual({
        Valid: 'value3',
      });
    });

    it('should resolve environment variables in headers', () => {
      const headers: HeaderRow[] = [
        headerRow('Authorization', 'Bearer {{TOKEN}}'),
        headerRow('X-API-Key', '{{API_KEY}}'),
      ];

      const envVars = new Map([
        ['TOKEN', 'abc123'],
        ['API_KEY', 'xyz789'],
      ]);

      const result = getDictFromHeaderRows(headers, envVars, new Set());

      expect(result).toEqual({
        Authorization: 'Bearer abc123',
        'X-API-Key': 'xyz789',
      });
    });

    it('should track unresolved variables', () => {
      const headers: HeaderRow[] = [
        headerRow('Authorization', 'Bearer {{MISSING}}'),
      ];

      const unresolved = new Set<string>();
      getDictFromHeaderRows(headers, new Map(), unresolved);

      expect(unresolved.has('MISSING')).toBe(true);
    });

    it('should handle duplicate header keys by creating arrays', () => {
      const headers: HeaderRow[] = [
        headerRow('Set-Cookie', 'session=abc'),
        headerRow('Set-Cookie', 'user=xyz'),
      ];

      const result = getDictFromHeaderRows(headers, new Map(), new Set());

      expect(result['Set-Cookie']).toEqual(['session=abc', 'user=xyz']);
    });

    it('should handle multiple duplicate headers', () => {
      const headers: HeaderRow[] = [
        headerRow('X-Custom', 'first'),
        headerRow('X-Custom', 'second'),
        headerRow('X-Custom', 'third'),
      ];

      const result = getDictFromHeaderRows(headers, new Map(), new Set());

      expect(result['X-Custom']).toEqual(['first', 'second', 'third']);
    });
  });

  describe('getURLSearchParamsFromParamRows', () => {
    it('should return empty URLSearchParams for empty param rows', () => {
      const result = getURLSearchParamsFromParamRows([], new Map(), new Set());
      expect(result.toString()).toBe('');
    });

    it('should convert enabled params to URLSearchParams', () => {
      const params: ParamRow[] = [
        paramRow('page', '1'),
        paramRow('limit', '10'),
      ];

      const result = getURLSearchParamsFromParamRows(params, new Map(), new Set());

      expect(result.get('page')).toBe('1');
      expect(result.get('limit')).toBe('10');
    });

    it('should skip disabled params', () => {
      const params: ParamRow[] = [
        paramRow('enabled', 'yes', false),
        paramRow('disabled', 'no', true),
      ];

      const result = getURLSearchParamsFromParamRows(params, new Map(), new Set());

      expect(result.has('enabled')).toBe(true);
      expect(result.has('disabled')).toBe(false);
    });

    it('should resolve environment variables in params', () => {
      const params: ParamRow[] = [
        paramRow('userId', '{{USER_ID}}'),
        paramRow('token', '{{TOKEN}}'),
      ];

      const envVars = new Map([
        ['USER_ID', '12345'],
        ['TOKEN', 'secret'],
      ]);

      const result = getURLSearchParamsFromParamRows(params, envVars, new Set());

      expect(result.get('userId')).toBe('12345');
      expect(result.get('token')).toBe('secret');
    });

    it('should handle duplicate param keys', () => {
      const params: ParamRow[] = [
        paramRow('tag', 'javascript'),
        paramRow('tag', 'react'),
      ];

      const result = getURLSearchParamsFromParamRows(params, new Map(), new Set());

      expect(result.getAll('tag')).toEqual(['javascript', 'react']);
    });

    it('should track unresolved variables', () => {
      const params: ParamRow[] = [
        paramRow('id', '{{MISSING_ID}}'),
      ];

      const unresolved = new Set<string>();
      getURLSearchParamsFromParamRows(params, new Map(), unresolved);

      expect(unresolved.has('MISSING_ID')).toBe(true);
    });
  });

  describe('convertBodyToRequestBody', () => {
    it('should return null for "none" body type', async () => {
      const body: RequestBody = {
        textData: null,
        binaryData: null,
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'none',
      };
      const result = await convertBodyToRequestBody(body, 'none', new Map(), new Set());

      expect(result).toBeNull();
    });

    it('should return text body as string', async () => {
      const body: RequestBody = {
        textData: { data: 'Hello, World!', textType: 'text' },
        binaryData: null,
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'text',
      };

      const result = await convertBodyToRequestBody(body, 'text', new Map(), new Set());

      expect(result).toBe('Hello, World!');
    });

    it('should resolve variables in text body', async () => {
      const body: RequestBody = {
        textData: { data: 'User ID: {{USER_ID}}', textType: 'text' },
        binaryData: null,
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'text',
      };

      const envVars = new Map([['USER_ID', '12345']]);
      const result = await convertBodyToRequestBody(body, 'text', envVars, new Set());

      expect(result).toBe('User ID: 12345');
    });

    it('should return null for text body with no data', async () => {
      const body: RequestBody = {
        textData: { data: '', textType: 'text' },
        binaryData: null,
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'text',
      };

      const result = await convertBodyToRequestBody(body, 'text', new Map(), new Set());

      expect(result).toBeNull();
    });

    it.skip('should handle binary body with File', async () => {
      // Skip: File.arrayBuffer() not available in jsdom
      const file = new File(['binary content'], 'test.bin', {
        type: 'application/octet-stream',
      });
      const body: RequestBody = {
        textData: null,
        binaryData: { data: { file, id: generateUniqueId() }, fileName: 'test.bin' },
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'binary',
      };

      const result = await convertBodyToRequestBody(body, 'binary', new Map(), new Set());

      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('should return null for binary body without file', async () => {
      const body: RequestBody = {
        textData: null,
        binaryData: null,
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'binary',
      };

      const result = await convertBodyToRequestBody(body, 'binary', new Map(), new Set());

      expect(result).toBeNull();
    });

    it('should handle multipart form data with text fields', async () => {
      const body: RequestBody = {
        textData: null,
        binaryData: null,
        formData: null,
        multiPartFormData: {
          data: [
            multiPartField('name', 'John'),
            multiPartField('email', 'john@example.com'),
          ],
        },
        currentBodyType: 'multipart',
      };

      const result = await convertBodyToRequestBody(
        body,
        'multipart',
        new Map(),
        new Set()
      );

      expect(result).toBeInstanceOf(FormData);
      const formData = result as FormData;
      expect(formData.get('name')).toBe('John');
      expect(formData.get('email')).toBe('john@example.com');
    });

    it('should skip disabled multipart fields', async () => {
      const body: RequestBody = {
        textData: null,
        binaryData: null,
        formData: null,
        multiPartFormData: {
          data: [
            multiPartField('enabled', 'yes', false),
            multiPartField('disabled', 'no', true),
          ],
        },
        currentBodyType: 'multipart',
      };

      const result = await convertBodyToRequestBody(
        body,
        'multipart',
        new Map(),
        new Set()
      );

      const formData = result as FormData;
      expect(formData.has('enabled')).toBe(true);
      expect(formData.has('disabled')).toBe(false);
    });

    it('should resolve variables in multipart fields', async () => {
      const body: RequestBody = {
        textData: null,
        binaryData: null,
        formData: null,
        multiPartFormData: {
          data: [multiPartField('userId', '{{USER_ID}}')],
        },
        currentBodyType: 'multipart',
      };

      const envVars = new Map([['USER_ID', '12345']]);
      const result = await convertBodyToRequestBody(body, 'multipart', envVars, new Set());

      const formData = result as FormData;
      expect(formData.get('userId')).toBe('12345');
    });

    it('should track unresolved variables in text body', async () => {
      const body: RequestBody = {
        textData: { data: '{{MISSING}}', textType: 'text' },
        binaryData: null,
        formData: null,
        multiPartFormData: null,
        currentBodyType: 'text',
      };

      const unresolved = new Set<string>();
      await convertBodyToRequestBody(body, 'text', new Map(), unresolved);

      expect(unresolved.has('MISSING')).toBe(true);
    });

    it('should track unresolved variables in multipart body', async () => {
      const body: RequestBody = {
        textData: null,
        binaryData: null,
        formData: null,
        multiPartFormData: {
          data: [multiPartField('field', '{{MISSING}}')],
        },
        currentBodyType: 'multipart',
      };

      const unresolved = new Set<string>();
      await convertBodyToRequestBody(body, 'multipart', new Map(), unresolved);

      expect(unresolved.has('MISSING')).toBe(true);
    });

    it('should handle multipart with disabled fields', async () => {
      const formFields = [
        multiPartField('enabled', 'value1'),
        { ...multiPartField('disabled', 'value2'), disabled: true },
      ];
      const body: RequestBody = {
        currentBodyType: 'multipart',
        multiPartFormData: { data: formFields },
        textData: null,
        binaryData: null,
        formData: null,
      };
      const envVars = new Map<string, string>();
      const unresolved = new Set<string>();

      const result = await convertBodyToRequestBody(body, 'multipart', envVars, unresolved);

      expect(result).toBeInstanceOf(FormData);
      const formData = result as FormData;
      expect(formData.has('enabled')).toBe(true);
      expect(formData.has('disabled')).toBe(false);
    });

    it('should handle multipart with file value', async () => {
      const file = new File(['content'], 'upload.pdf', { type: 'application/pdf' });
      const formFields = [
        { id: generateUniqueId(), key: 'file', value: file, fieldType: 'file' as const, disabled: false },
      ];
      const body: RequestBody = {
        currentBodyType: 'multipart',
        multiPartFormData: { data: formFields },
        textData: null,
        binaryData: null,
        formData: null,
      };
      const envVars = new Map<string, string>();
      const unresolved = new Set<string>();

      const result = await convertBodyToRequestBody(body, 'multipart', envVars, unresolved);

      expect(result).toBeInstanceOf(FormData);
    });

    it('should handle form urlencoded body', async () => {
      const formFields = [
        { id: '1', key: 'username', value: 'john', enabled: true, disabled: false },
        { id: '2', key: 'password', value: 'secret', enabled: true, disabled: false },
      ];
      const body: RequestBody = {
        currentBodyType: 'form',
        formData: { data: formFields },
        textData: null,
        binaryData: null,
        multiPartFormData: null,
      };
      const envVars = new Map<string, string>();
      const unresolved = new Set<string>();

      const result = await convertBodyToRequestBody(body, 'form', envVars, unresolved);

      expect(result).toEqual({ username: 'john', password: 'secret' });
    });

    it('should handle form urlencoded with disabled fields', async () => {
      const formFields = [
        { id: '1', key: 'enabled', value: 'yes', enabled: true, disabled: false },
        { id: '2', key: 'disabled', value: 'no', enabled: false, disabled: true },
      ];
      const body: RequestBody = {
        currentBodyType: 'form',
        formData: { data: formFields },
        textData: null,
        binaryData: null,
        multiPartFormData: null,
      };
      const envVars = new Map<string, string>();
      const unresolved = new Set<string>();

      const result = await convertBodyToRequestBody(body, 'form', envVars, unresolved);

      expect(result).toEqual({ enabled: 'yes' });
    });

    it('should handle form urlencoded with env vars', async () => {
      const formFields = [
        { id: '1', key: 'api_key', value: '{{API_KEY}}', enabled: true, disabled: false },
      ];
      const body: RequestBody = {
        currentBodyType: 'form',
        formData: { data: formFields },
        textData: null,
        binaryData: null,
        multiPartFormData: null,
      };
      const envVars = new Map([['API_KEY', 'secret123']]);
      const unresolved = new Set<string>();

      const result = await convertBodyToRequestBody(body, 'form', envVars, unresolved);

      expect(result).toEqual({ api_key: 'secret123' });
    });

    it('should handle default body type fallback', async () => {
      const body: RequestBody = {
        currentBodyType: 'text',
        textData: { data: 'default text', textType: 'text' },
        binaryData: null,
        formData: null,
        multiPartFormData: null,
      };
      const envVars = new Map<string, string>();
      const unresolved = new Set<string>();

      const result = await convertBodyToRequestBody(body, 'text', envVars, unresolved);

      expect(result).toBe('default text');
    });
  });

  describe('getAuthForRequest', () => {
    it('should return null for disabled auth', () => {
      const auth: Auth = {
        id: '1',
        name: 'Disabled Auth',
        type: AuthType.API_KEY,
        enabled: false,
        key: 'Authorization',
        value: 'token123',
        sendIn: 'header',
        domainFilters: [],
        base64Encode: false,
      };

      const result = getAuthForRequest(auth, 'https://api.example.com');

      expect(result).toBeNull();
    });

    it('should return null for expired auth', () => {
      const auth: Auth = {
        id: '1',
        name: 'Expired Auth',
        type: AuthType.API_KEY,
        enabled: true,
        key: 'Authorization',
        value: 'token123',
        sendIn: 'header',
        domainFilters: [],
        base64Encode: false,
        expiryDate: new Date(Date.now() - 1000).toISOString(),
      };

      const result = getAuthForRequest(auth, 'https://api.example.com');

      expect(result).toBeNull();
    });

    it('should return null for auth with non-matching domain filter', () => {
      const auth: Auth = {
        id: '1',
        name: 'Domain Filtered Auth',
        type: AuthType.API_KEY,
        enabled: true,
        key: 'Authorization',
        value: 'token123',
        sendIn: 'header',
        domainFilters: ['allowed-domain.com'],
        base64Encode: false,
      };

      const result = getAuthForRequest(auth, 'https://not-allowed.com/api');

      expect(result).toBeNull();
    });

    it('should return auth for matching domain filter', () => {
      const auth: Auth = {
        id: '1',
        name: 'Domain Filtered Auth',
        type: AuthType.API_KEY,
        enabled: true,
        key: 'Authorization',
        value: 'token123',
        sendIn: 'header',
        domainFilters: ['api.example.com'],
        base64Encode: false,
      };

      const result = getAuthForRequest(auth, 'https://api.example.com/v1/users');

      expect(result).toBe(auth);
    });

    it('should return auth when no domain filters', () => {
      const auth: Auth = {
        id: '1',
        name: 'No Filter Auth',
        type: AuthType.BASIC,
        enabled: true,
        username: 'user',
        password: 'pass',
        domainFilters: [],
        base64Encode: false,
      };

      const result = getAuthForRequest(auth, 'https://any-domain.com');

      expect(result).toBe(auth);
    });

    it('should return null for null auth', () => {
      const result = getAuthForRequest(null, 'https://example.com');
      expect(result).toBeNull();
    });

    it('should return null for undefined auth', () => {
      const result = getAuthForRequest(undefined, 'https://example.com');
      expect(result).toBeNull();
    });
  });

  describe('buildHttpRequest', () => {
    it('should build basic GET request', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: [headerRow('Accept', 'application/json')],
        params: [paramRow('page', '1')],
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request).toBeDefined();
      expect(result.request?.method).toBe('GET');
      expect(result.request?.url).toBe('https://api.example.com/users');
      expect(result.request?.params).toBe('page=1');
      expect(result.request?.headers).toHaveProperty('Accept', 'application/json');
      expect(result.error).toBeUndefined();
    });

    it('should resolve environment variables in URL', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: '{{BASE_URL}}/users',
      };
      const environments: Environment[] = [
        {
          id: 'env1',
          name: 'Development',
          values: [envVar('BASE_URL', 'https://dev.api.com')],
        },
      ];

      const result = await buildHttpRequest(input, 'env1', environments, [], null);

      expect(result.request?.url).toBe('https://dev.api.com/users');
    });

    it('should add default protocol when missing', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'api.example.com/users',
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.url).toBe('https://api.example.com/users');
    });

    it('should use custom protocol', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'api.example.com/users',
        protocol: 'http',
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.url).toBe('http://api.example.com/users');
    });

    it('should apply request-level auth over default auth', async () => {
      const requestAuth: Auth = {
        id: 'auth1',
        name: 'Request Auth',
        type: AuthType.API_KEY,
        enabled: true,
        key: 'Authorization',
        value: 'req-token',
        sendIn: 'header',
        domainFilters: [],
        base64Encode: false,
      };
      const defaultAuth: Auth = {
        id: 'auth2',
        name: 'Default Auth',
        type: AuthType.API_KEY,
        enabled: true,
        key: 'Authorization',
        value: 'default-token',
        sendIn: 'header',
        domainFilters: [],
        base64Encode: false,
      };
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://api.example.com',
        authId: 'auth1',
      };

      const result = await buildHttpRequest(input, null, [], [requestAuth, defaultAuth], 'auth2');

      expect(result.request?.auth?.id).toBe('auth1');
    });

    it('should use default auth when no request-level auth', async () => {
      const defaultAuth: Auth = {
        id: 'auth1',
        name: 'Default Auth',
        type: AuthType.API_KEY,
        enabled: true,
        key: 'Authorization',
        value: 'default-token',
        sendIn: 'header',
        domainFilters: [],
        base64Encode: false,
      };
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://api.example.com',
      };

      const result = await buildHttpRequest(input, null, [], [defaultAuth], 'auth1');

      expect(result.request?.auth?.id).toBe('auth1');
    });

    it('should return error for unresolved placeholders', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: '{{MISSING_VAR}}/users',
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.error).toContain('Unresolved placeholders');
      expect(result.unresolved).toContain('MISSING_VAR');
    });

    it('should build request with text body', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com/users',
        body: {
          currentBodyType: 'text',
          textData: { data: '{"name":"John"}', textType: 'json' },
          binaryData: null,
          formData: null,
          multiPartFormData: null,
        },
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.body).toBe('{"name":"John"}');
      expect(result.request?.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it.skip('should build request with binary body', async () => {
      const file = new File(['binary content'], 'data.bin', { type: 'application/octet-stream' });
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com/upload',
        body: {
          currentBodyType: 'binary',
          binaryData: { data: { id: '1', file }, fileName: 'data.bin' },
          textData: null,
          formData: null,
          multiPartFormData: null,
        },
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.body).toBeInstanceOf(ArrayBuffer);
    });

    it('should build request with collection request format', async () => {
      const collectionReq: CollectionRequest = {
        url: 'https://api.example.com/test',
        method: 'POST',
        header: [],
        body: {
          mode: 'raw',
          raw: '{"test":true}',
          options: {
            raw: {
              language: 'json',
            },
          },
        },
      };
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com/test',
        request: collectionReq,
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.body).toBe('{"test":true}');
      expect(result.request?.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should build request with urlencoded collection body', async () => {
      const collectionReq: CollectionRequest = {
        url: 'https://api.example.com/test',
        method: 'POST',
        header: [],
        body: {
          mode: 'urlencoded',
          urlencoded: [
            { id: '1', key: 'field1', value: 'value1', disabled: false },
            { id: '2', key: 'field2', value: 'value2', disabled: false },
          ],
        },
      };
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com/test',
        request: collectionReq,
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.body).toBe('field1=value1&field2=value2');
      expect(result.request?.headers).toHaveProperty('Content-Type', 'application/x-www-form-urlencoded');
    });

    it('should build request with simple string body', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'POST',
        url: 'https://api.example.com/test',
        body: 'plain text body',
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.body).toBe('plain text body');
    });

    it('should remove query params from URL', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://api.example.com/users?existing=param',
        params: [paramRow('page', '1')],
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request?.url).toBe('https://api.example.com/users');
      expect(result.request?.params).toContain('page=1');
    });

    it('should handle global and environment variable override', async () => {
      const environments: Environment[] = [
        {
          id: 'global',
          name: 'global',
          values: [envVar('API_KEY', 'global-key')],
        },
        {
          id: 'env1',
          name: 'Development',
          values: [envVar('API_KEY', 'dev-key')],
        },
      ];
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'https://api.example.com',
        headers: [headerRow('X-API-Key', '{{API_KEY}}')],
      };

      const result = await buildHttpRequest(input, 'env1', environments, [], null);

      expect(result.request?.headers).toHaveProperty('X-API-Key', 'dev-key');
    });

    it('should handle invalid URL gracefully', async () => {
      const input: CollectionRequestInput = {
        id: '1',
        name: 'Test Request',
        method: 'GET',
        url: 'not a valid url format',
      };

      const result = await buildHttpRequest(input, null, [], [], null);

      expect(result.request).toBeDefined();
    });
  });
});
