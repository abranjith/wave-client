import { describe, it, expect } from 'vitest';
import { resolveParameterizedValue, isUrlInDomains } from '../../utils/common.js';

describe('common utils', () => {
  describe('resolveParameterizedValue', () => {
    it('resolves environment variables in string', () => {
      const envVars = new Map([
        ['baseUrl', 'https://api.example.com'],
        ['apiKey', 'secret123'],
      ]);

      const result = resolveParameterizedValue(
        '{{baseUrl}}/users?key={{apiKey}}',
        envVars
      );

      expect(result.resolved).toBe('https://api.example.com/users?key=secret123');
      expect(result.unresolved).toEqual([]);
    });

    it('handles case-insensitive variable names', () => {
      const envVars = new Map([['API_KEY', 'secret123']]);

      const result = resolveParameterizedValue('{{api_key}}', envVars);

      expect(result.resolved).toBe('secret123');
      expect(result.unresolved).toEqual([]);
    });

    it('keeps original placeholder for unresolved variables', () => {
      const envVars = new Map([['baseUrl', 'https://api.example.com']]);

      const result = resolveParameterizedValue(
        '{{baseUrl}}/users/{{userId}}',
        envVars
      );

      expect(result.resolved).toBe('https://api.example.com/users/{{userId}}');
      expect(result.unresolved).toEqual(['userId']);
    });

    it('handles multiple unresolved variables', () => {
      const envVars = new Map();

      const result = resolveParameterizedValue(
        '{{baseUrl}}/{{resource}}/{{id}}',
        envVars
      );

      expect(result.resolved).toBe('{{baseUrl}}/{{resource}}/{{id}}');
      expect(result.unresolved).toEqual(['baseUrl', 'resource', 'id']);
    });

    it('handles whitespace in variable names', () => {
      const envVars = new Map([['myVar', 'value123']]);

      const result = resolveParameterizedValue('{{ myVar }}', envVars);

      expect(result.resolved).toBe('value123');
      expect(result.unresolved).toEqual([]);
    });

    it('handles empty environment variables map', () => {
      const result = resolveParameterizedValue('{{test}}', new Map());

      expect(result.resolved).toBe('{{test}}');
      expect(result.unresolved).toEqual(['test']);
    });

    it('handles string without placeholders', () => {
      const envVars = new Map([['key', 'value']]);
      const result = resolveParameterizedValue('plain string', envVars);

      expect(result.resolved).toBe('plain string');
      expect(result.unresolved).toEqual([]);
    });

    it('resolves multiple occurrences of same variable', () => {
      const envVars = new Map([['id', '123']]);

      const result = resolveParameterizedValue(
        '{{id}}/details/{{id}}/{{id}}',
        envVars
      );

      expect(result.resolved).toBe('123/details/123/123');
      expect(result.unresolved).toEqual([]);
    });

    it('handles nested braces gracefully', () => {
      const envVars = new Map([['var', 'value']]);

      // This tests edge case - won't match nested braces
      const result = resolveParameterizedValue('{{var}} {not a var}', envVars);

      expect(result.resolved).toBe('value {not a var}');
    });
  });

  describe('isUrlInDomains', () => {
    it('matches exact domain', () => {
      const result = isUrlInDomains('https://api.example.com/path', [
        'api.example.com',
      ]);

      expect(result).toBe(true);
    });

    it('matches wildcard subdomain', () => {
      const result = isUrlInDomains('https://api.example.com/path', [
        '*.example.com',
      ]);

      expect(result).toBe(true);
    });

    it('matches dot-prefix domain', () => {
      const result = isUrlInDomains('https://api.example.com/path', [
        '.example.com',
      ]);

      expect(result).toBe(true);
    });

    it('does not match different domain', () => {
      const result = isUrlInDomains('https://api.example.com/path', [
        'other.com',
      ]);

      expect(result).toBe(false);
    });

    it('does not match partial domain', () => {
      const result = isUrlInDomains('https://api.example.com/path', [
        'example.com',
      ]);

      // Should NOT match because api.example.com !== example.com
      expect(result).toBe(false);
    });

    it('matches against multiple domains', () => {
      const result = isUrlInDomains('https://api.example.com/path', [
        'other.com',
        '*.example.com',
        'test.com',
      ]);

      expect(result).toBe(true);
    });

    it('handles empty domain list', () => {
      const result = isUrlInDomains('https://api.example.com/path', []);

      expect(result).toBe(false);
    });

    it('handles invalid URL gracefully', () => {
      const result = isUrlInDomains('not-a-url', ['example.com']);

      // Should handle error and return false
      expect(result).toBe(false);
    });

    it('matches with different protocols', () => {
      const domains = ['api.example.com'];

      expect(isUrlInDomains('http://api.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://api.example.com', domains)).toBe(true);
    });

    it('wildcard matches multiple subdomains', () => {
      const domains = ['*.example.com'];

      expect(isUrlInDomains('https://api.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://www.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://dev.api.example.com', domains)).toBe(
        true
      );
    });

    it('dot-prefix matches subdomains', () => {
      const domains = ['.example.com'];

      expect(isUrlInDomains('https://api.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://www.example.com', domains)).toBe(true);
      expect(isUrlInDomains('https://example.com', domains)).toBe(true); // Also matches base domain
    });

    it('handles case-insensitive domain matching', () => {
      const result = isUrlInDomains('https://API.EXAMPLE.COM/path', [
        'api.example.com',
      ]);

      expect(result).toBe(true);
    });
  });
});
