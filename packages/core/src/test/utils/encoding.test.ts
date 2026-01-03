import { describe, it, expect } from 'vitest';
import {
  base64ToText,
  base64ToArrayBuffer,
  base64ToJson,
  convertToBase64,
} from '../../utils/encoding';

describe('encoding', () => {
  describe('base64ToText', () => {
    it('should decode simple ASCII text', () => {
      const base64 = btoa('Hello, World!');
      const result = base64ToText(base64);

      expect(result).toBe('Hello, World!');
    });

    it('should decode UTF-8 text with special characters', () => {
      const text = 'Hello, 世界! 🌍';
      const encoder = new TextEncoder();
      const bytes = encoder.encode(text);
      const base64 = btoa(String.fromCharCode(...bytes));

      const result = base64ToText(base64);
      expect(result).toBe(text);
    });

    it('should decode empty string', () => {
      const base64 = btoa('');
      const result = base64ToText(base64);

      expect(result).toBe('');
    });

    it('should handle invalid base64 gracefully', () => {
      const result = base64ToText('invalid!!!base64');

      expect(result).toBe('');
    });

    it('should decode JSON string', () => {
      const json = JSON.stringify({ name: 'test', value: 123 });
      const base64 = btoa(json);
      const result = base64ToText(base64);

      expect(result).toBe(json);
      expect(JSON.parse(result)).toEqual({ name: 'test', value: 123 });
    });
  });

  describe('base64ToArrayBuffer', () => {
    it('should convert base64 to ArrayBuffer', () => {
      const text = 'Hello, World!';
      const base64 = btoa(text);
      const buffer = base64ToArrayBuffer(base64);

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(text.length);

      const view = new Uint8Array(buffer);
      const decoded = String.fromCharCode(...view);
      expect(decoded).toBe(text);
    });

    it('should handle empty base64 string', () => {
      const base64 = btoa('');
      const buffer = base64ToArrayBuffer(base64);

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(0);
    });

    it('should convert binary data correctly', () => {
      // Create some binary data
      const bytes = new Uint8Array([0, 1, 2, 255, 128, 64]);
      const base64 = btoa(String.fromCharCode(...bytes));

      const buffer = base64ToArrayBuffer(base64);
      const resultBytes = new Uint8Array(buffer);

      expect(resultBytes).toEqual(bytes);
    });
  });

  describe('base64ToJson', () => {
    it('should parse valid JSON from base64', () => {
      const obj = { name: 'John', age: 30, active: true };
      const json = JSON.stringify(obj);
      const base64 = btoa(json);

      const result = base64ToJson(base64);

      expect(result).toEqual(obj);
    });

    it('should parse nested JSON objects', () => {
      const obj = {
        user: { name: 'Alice', address: { city: 'NYC', zip: '10001' } },
        items: [1, 2, 3],
      };
      const json = JSON.stringify(obj);
      const base64 = btoa(json);

      const result = base64ToJson(base64);

      expect(result).toEqual(obj);
      expect(result.user.address.city).toBe('NYC');
    });

    it('should return null for invalid JSON', () => {
      const base64 = btoa('{ invalid json }');
      const result = base64ToJson(base64);

      expect(result).toBeNull();
    });

    it('should return null for invalid base64', () => {
      const result = base64ToJson('not!!!base64');

      expect(result).toBeNull();
    });

    it('should handle empty JSON object', () => {
      const base64 = btoa('{}');
      const result = base64ToJson(base64);

      expect(result).toEqual({});
    });

    it('should handle JSON arrays', () => {
      const arr = [1, 2, 3, 4, 5];
      const json = JSON.stringify(arr);
      const base64 = btoa(json);

      const result = base64ToJson(base64);

      expect(result).toEqual(arr);
    });

    it('should preserve data types', () => {
      const obj = {
        str: 'text',
        num: 42,
        bool: true,
        nullVal: null,
        arr: [1, 'two', false],
      };
      const json = JSON.stringify(obj);
      const base64 = btoa(json);

      const result = base64ToJson(base64);

      expect(result).toEqual(obj);
      expect(typeof result.str).toBe('string');
      expect(typeof result.num).toBe('number');
      expect(typeof result.bool).toBe('boolean');
      expect(result.nullVal).toBeNull();
      expect(Array.isArray(result.arr)).toBe(true);
    });
  });

  describe('convertToBase64', () => {
    it('should convert string to base64', () => {
      const result = convertToBase64('Hello, World!');
      const decoded = Buffer.from(result, 'base64').toString('utf8');

      expect(decoded).toBe('Hello, World!');
    });

    it('should convert Buffer to base64', () => {
      const buffer = Buffer.from('test data', 'utf8');
      const result = convertToBase64(buffer);
      const decoded = Buffer.from(result, 'base64').toString('utf8');

      expect(decoded).toBe('test data');
    });

    it('should convert Uint8Array to base64', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = convertToBase64(bytes);
      const decoded = Buffer.from(result, 'base64').toString('utf8');

      expect(decoded).toBe('Hello');
    });

    it('should convert object to JSON base64', () => {
      const obj = { name: 'test', value: 123 };
      const result = convertToBase64(obj);
      const decoded = Buffer.from(result, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);

      expect(parsed).toEqual(obj);
    });

    it('should handle null and undefined', () => {
      const nullResult = convertToBase64(null);
      const undefinedResult = convertToBase64(undefined);

      expect(typeof nullResult).toBe('string');
      expect(typeof undefinedResult).toBe('string');
    });

    it('should handle numbers', () => {
      const result = convertToBase64(42);
      const decoded = Buffer.from(result, 'base64').toString('utf8');

      expect(decoded).toBe('42');
    });

    it('should handle boolean values', () => {
      const trueResult = convertToBase64(true);
      const falseResult = convertToBase64(false);

      const trueDecoded = Buffer.from(trueResult, 'base64').toString('utf8');
      const falseDecoded = Buffer.from(falseResult, 'base64').toString('utf8');

      expect(trueDecoded).toBe('true');
      expect(falseDecoded).toBe('false');
    });

    it('should handle empty string', () => {
      const result = convertToBase64('');
      const decoded = Buffer.from(result, 'base64').toString('utf8');

      expect(decoded).toBe('');
    });

    it('should handle UTF-8 characters', () => {
      const text = 'Hello, 世界! 🌍';
      const result = convertToBase64(text);
      const decoded = Buffer.from(result, 'base64').toString('utf8');

      expect(decoded).toBe(text);
    });

    it('should handle circular reference objects gracefully', () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference

      const result = convertToBase64(obj);

      expect(typeof result).toBe('string');
      // Should not throw error, should return fallback
    });
  });
});
