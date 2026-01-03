import { describe, it, expect } from 'vitest';
import {
  cn,
  getContentTypeFromFileName,
  getExtensionFromContentType,
  getResponseContentType,
  getResponseLanguage,
  formatFileSize,
  isUrlEncoded,
  parseUrlQueryParams,
  getContentTypeFromBody,
  resolveParameterizedValue,
  getHttpMethodColor,
  getUrlWithoutProtocol,
  isUrlInDomains,
  getCommonHeaderNames,
} from '../../utils/common';

describe('common', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });
  });

  describe('getContentTypeFromFileName', () => {
    it('should return correct MIME type for common image formats', () => {
      expect(getContentTypeFromFileName('image.jpg')).toBe('image/jpeg');
      expect(getContentTypeFromFileName('image.png')).toBe('image/png');
      expect(getContentTypeFromFileName('image.gif')).toBe('image/gif');
      expect(getContentTypeFromFileName('image.webp')).toBe('image/webp');
      expect(getContentTypeFromFileName('icon.svg')).toBe('image/svg+xml');
    });

    it('should return correct MIME type for documents', () => {
      expect(getContentTypeFromFileName('document.pdf')).toBe('application/pdf');
      expect(getContentTypeFromFileName('document.doc')).toBe('application/msword');
      expect(getContentTypeFromFileName('document.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(getContentTypeFromFileName('spreadsheet.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should return correct MIME type for text files', () => {
      expect(getContentTypeFromFileName('data.json')).toBe('application/json');
      expect(getContentTypeFromFileName('data.xml')).toBe('application/xml');
      expect(getContentTypeFromFileName('page.html')).toBe('text/html');
      expect(getContentTypeFromFileName('style.css')).toBe('text/css');
      expect(getContentTypeFromFileName('script.js')).toBe('application/javascript');
    });

    it('should be case-insensitive', () => {
      expect(getContentTypeFromFileName('IMAGE.JPG')).toBe('image/jpeg');
      expect(getContentTypeFromFileName('Document.PDF')).toBe('application/pdf');
    });

    it('should return default for unknown extensions', () => {
      expect(getContentTypeFromFileName('file.xyz')).toBe('application/octet-stream');
      expect(getContentTypeFromFileName('unknown')).toBe('application/octet-stream');
    });

    it('should handle files without extension', () => {
      expect(getContentTypeFromFileName('README')).toBe('application/octet-stream');
    });

    it('should handle multiple dots in filename', () => {
      expect(getContentTypeFromFileName('my.file.name.json')).toBe('application/json');
    });
  });

  describe('getExtensionFromContentType', () => {
    it('should return correct extension for common MIME types', () => {
      expect(getExtensionFromContentType('application/json')).toBe('.json');
      expect(getExtensionFromContentType('image/png')).toBe('.png');
      expect(getExtensionFromContentType('text/html')).toBe('.html');
      expect(getExtensionFromContentType('application/pdf')).toBe('.pdf');
    });

    it('should handle content type with charset', () => {
      expect(getExtensionFromContentType('application/json; charset=utf-8')).toBe('.json');
      expect(getExtensionFromContentType('text/html; charset=UTF-8')).toBe('.html');
    });

    it('should return .bin for unknown content types', () => {
      expect(getExtensionFromContentType('application/x-unknown')).toBe('.bin');
      expect(getExtensionFromContentType('unknown/type')).toBe('.bin');
    });

    it('should be case-insensitive', () => {
      expect(getExtensionFromContentType('APPLICATION/JSON')).toBe('.json');
      expect(getExtensionFromContentType('Image/PNG')).toBe('.png');
    });
  });

  describe('getResponseContentType', () => {
    it('should extract content-type from headers', () => {
      const headers = { 'content-type': 'application/json' };
      expect(getResponseContentType(headers)).toBe('application/json');
    });

    it('should be case-insensitive for header names', () => {
      const headers = { 'Content-Type': 'text/html' };
      expect(getResponseContentType(headers)).toBe('text/html');
    });

    it('should return empty string if content-type not found', () => {
      const headers = { 'other-header': 'value' };
      expect(getResponseContentType(headers)).toBe('');
    });
  });

  describe('getResponseLanguage', () => {
    it('should detect JSON content', () => {
      const headers = { 'content-type': 'application/json' };
      expect(getResponseLanguage(headers)).toBe('json');
    });

    it('should detect XML content', () => {
      const headers = { 'content-type': 'application/xml' };
      expect(getResponseLanguage(headers)).toBe('xml');
    });

    it('should detect HTML content', () => {
      const headers = { 'content-type': 'text/html' };
      expect(getResponseLanguage(headers)).toBe('html');
    });

    it('should detect plain text', () => {
      const headers = { 'content-type': 'text/plain' };
      expect(getResponseLanguage(headers)).toBe('text');
    });

    it('should default to binary for unknown types', () => {
      const headers = { 'content-type': 'application/octet-stream' };
      expect(getResponseLanguage(headers)).toBe('binary');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format KB correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should format MB correctly', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
      expect(formatFileSize(5242880)).toBe('5 MB');
    });

    it('should format GB correctly', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB');
      expect(formatFileSize(2147483648)).toBe('2 GB');
    });
  });

  describe('isUrlEncoded', () => {
    it('should detect URL-encoded strings', () => {
      expect(isUrlEncoded('hello%20world')).toBe(true);
      expect(isUrlEncoded('test%2Fpath')).toBe(true);
      expect(isUrlEncoded('%3D%26%3F')).toBe(true);
    });

    it('should return false for non-encoded strings', () => {
      expect(isUrlEncoded('hello world')).toBe(false);
      expect(isUrlEncoded('simple-path')).toBe(false);
      expect(isUrlEncoded('test')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isUrlEncoded('')).toBe(false);
      expect(isUrlEncoded('%')).toBe(false);
      expect(isUrlEncoded('%%')).toBe(false);
    });
  });

  describe('parseUrlQueryParams', () => {
    it('should parse simple query parameters', () => {
      const params = parseUrlQueryParams('https://example.com?page=1&limit=10');

      expect(params).toHaveLength(2);
      expect(params[0].key).toBe('page');
      expect(params[0].value).toBe('1');
      expect(params[1].key).toBe('limit');
      expect(params[1].value).toBe('10');
    });

    it('should handle URL-encoded values', () => {
      const params = parseUrlQueryParams('https://example.com?name=John%20Doe');

      expect(params).toHaveLength(1);
      expect(params[0].key).toBe('name');
      expect(params[0].value).toBe('John Doe');
    });

    it('should handle empty values', () => {
      const params = parseUrlQueryParams('https://example.com?key=&other=value');

      expect(params).toHaveLength(2);
      expect(params[0].key).toBe('key');
      expect(params[0].value).toBe('');
    });

    it('should return empty array for URL without query params', () => {
      const params = parseUrlQueryParams('https://example.com/path');
      expect(params).toEqual([]);
    });

    it('should include id and disabled properties', () => {
      const params = parseUrlQueryParams('https://example.com?test=value');

      expect(params[0]).toHaveProperty('id');
      expect(params[0]).toHaveProperty('disabled');
      expect(params[0].disabled).toBe(false);
    });
  });

  describe('getContentTypeFromBody', () => {
    it('should return null for none body type', () => {
      expect(getContentTypeFromBody('none')).toBeNull();
    });

    it('should return correct content type for text types', () => {
      expect(getContentTypeFromBody('text', null, 'text')).toBe('text/plain');
      expect(getContentTypeFromBody('text', null, 'json')).toBe('application/json');
      expect(getContentTypeFromBody('text', null, 'xml')).toBe('application/xml');
      expect(getContentTypeFromBody('text', null, 'html')).toBe('text/html');
    });

    it('should return form-urlencoded for form body', () => {
      expect(getContentTypeFromBody('form')).toBe('application/x-www-form-urlencoded');
    });

    it('should return multipart for multipart body', () => {
      expect(getContentTypeFromBody('multipart')).toBe('multipart/form-data');
    });

    it('should determine binary content type from filename', () => {
      expect(getContentTypeFromBody('binary', 'image.png')).toBe('image/png');
      expect(getContentTypeFromBody('binary', 'document.pdf')).toBe('application/pdf');
    });

    it('should default to octet-stream for binary without filename', () => {
      expect(getContentTypeFromBody('binary', null)).toBe('application/octet-stream');
    });
  });

  describe('resolveParameterizedValue', () => {
    it('should resolve single variable', () => {
      const envVars = new Map([['USER_ID', '12345']]);
      const result = resolveParameterizedValue('User: {{USER_ID}}', envVars);

      expect(result.resolved).toBe('User: 12345');
      expect(result.unresolved).toEqual([]);
    });

    it('should resolve multiple variables', () => {
      const envVars = new Map([
        ['NAME', 'John'],
        ['AGE', '30'],
      ]);
      const result = resolveParameterizedValue('{{NAME}} is {{AGE}} years old', envVars);

      expect(result.resolved).toBe('John is 30 years old');
      expect(result.unresolved).toEqual([]);
    });

    it('should track unresolved variables', () => {
      const envVars = new Map([['KNOWN', 'value']]);
      const result = resolveParameterizedValue('{{KNOWN}} and {{UNKNOWN}}', envVars);

      expect(result.resolved).toBe('value and {{UNKNOWN}}');
      expect(result.unresolved).toEqual(['UNKNOWN']);
    });

    it('should handle empty variable map', () => {
      const envVars = new Map();
      const result = resolveParameterizedValue('{{VAR}}', envVars);

      expect(result.resolved).toBe('{{VAR}}');
      expect(result.unresolved).toEqual(['VAR']);
    });

    it('should handle text without variables', () => {
      const envVars = new Map();
      const result = resolveParameterizedValue('plain text', envVars);

      expect(result.resolved).toBe('plain text');
      expect(result.unresolved).toEqual([]);
    });
  });

  describe('getHttpMethodColor', () => {
    it('should return correct color for GET', () => {
      const color = getHttpMethodColor('GET');
      expect(color).toContain('green');
    });

    it('should return correct color for POST', () => {
      const color = getHttpMethodColor('POST');
      expect(color).toContain('blue');
    });

    it('should return correct color for PUT', () => {
      const color = getHttpMethodColor('PUT');
      expect(color).toContain('yellow');
    });

    it('should return correct color for DELETE', () => {
      const color = getHttpMethodColor('DELETE');
      expect(color).toContain('red');
    });

    it('should handle case-insensitive method names', () => {
      const color = getHttpMethodColor('get');
      expect(color).toContain('green');
    });
  });

  describe('getUrlWithoutProtocol', () => {
    it('should remove http protocol', () => {
      expect(getUrlWithoutProtocol('http://example.com')).toBe('example.com');
    });

    it('should remove https protocol', () => {
      expect(getUrlWithoutProtocol('https://example.com/path')).toBe('example.com/path');
    });

    it('should handle URL without protocol', () => {
      expect(getUrlWithoutProtocol('example.com')).toBe('example.com');
    });

    it('should return empty string for protocol-only input', () => {
      expect(getUrlWithoutProtocol('https://')).toBe('');
    });

    it('should preserve path and query params', () => {
      expect(getUrlWithoutProtocol('https://example.com/path?query=value')).toBe('example.com/path?query=value');
    });
  });

  describe('isUrlInDomains', () => {
    it('should match exact domain', () => {
      const domains = ['example.com'];
      expect(isUrlInDomains('https://example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://other.com', domains)).toBe(false);
    });

    it('should match wildcard subdomains', () => {
      const domains = ['*.example.com'];
      expect(isUrlInDomains('https://api.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://www.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://example.com', domains)).toBe(false);
    });

    it('should match dot-prefix domains', () => {
      const domains = ['.example.com'];
      expect(isUrlInDomains('https://api.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://www.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://example.com', domains)).toBe(true);
    });

    it('should handle multiple domains', () => {
      const domains = ['example.com', 'test.com', '*.api.com'];
      expect(isUrlInDomains('https://example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://test.com', domains)).toBe(true);
      expect(isUrlInDomains('https://v1.api.com', domains)).toBe(true);
      expect(isUrlInDomains('https://other.com', domains)).toBe(false);
    });

    it('should return false for invalid URLs', () => {
      const domains = ['example.com'];
      expect(isUrlInDomains('not-a-url', domains)).toBe(false);
    });

    it('should return false for empty domains list', () => {
      expect(isUrlInDomains('https://example.com', [])).toBe(false);
    });
  });

  describe('getCommonHeaderNames', () => {
    it('should return an array of header names', () => {
      const headers = getCommonHeaderNames();

      expect(Array.isArray(headers)).toBe(true);
      expect(headers.length).toBeGreaterThan(0);
    });

    it('should include common headers', () => {
      const headers = getCommonHeaderNames();

      expect(headers).toContain('Content-Type');
      expect(headers).toContain('Authorization');
      expect(headers).toContain('Accept');
      expect(headers).toContain('User-Agent');
    });

    it('should not contain duplicates', () => {
      const headers = getCommonHeaderNames();
      const uniqueHeaders = new Set(headers);

      expect(headers.length).toBe(uniqueHeaders.size);
    });
  });
});
