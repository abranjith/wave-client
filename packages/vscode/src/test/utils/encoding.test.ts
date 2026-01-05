import { describe, it, expect } from 'vitest';
import { convertToBase64, base64ToBuffer } from '../../utils/encoding.js';

describe('encoding utils', () => {
  describe('convertToBase64', () => {
    it('converts string to base64', () => {
      const input = 'Hello, World!';
      const result = convertToBase64(input);
      
      expect(result).toBe(Buffer.from(input, 'utf8').toString('base64'));
    });

    it('converts Buffer to base64', () => {
      const input = Buffer.from('Test data', 'utf8');
      const result = convertToBase64(input);
      
      expect(result).toBe(input.toString('base64'));
    });

    it('converts Uint8Array to base64', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = convertToBase64(input);
      
      expect(result).toBe(Buffer.from(input).toString('base64'));
    });

    it('converts ArrayBuffer to base64', () => {
      const input = new Uint8Array([72, 101, 108, 108, 111]).buffer;
      const result = convertToBase64(input);
      
      expect(result).toBe(Buffer.from(input).toString('base64'));
    });

    it('converts object to JSON base64', () => {
      const input = { name: 'test', value: 123 };
      const result = convertToBase64(input);
      const expected = Buffer.from(JSON.stringify(input, null, 2), 'utf8').toString('base64');
      
      expect(result).toBe(expected);
    });

    it('handles circular objects gracefully', () => {
      const input: any = { name: 'test' };
      input.circular = input; // Create circular reference
      
      const result = convertToBase64(input);
      
      // Should handle circular reference without throwing
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('converts number to base64 string', () => {
      const input = 12345;
      const result = convertToBase64(input);
      
      expect(result).toBe(Buffer.from(String(input), 'utf8').toString('base64'));
    });

    it('converts null to base64 string', () => {
      const result = convertToBase64(null);
      
      expect(result).toBe(Buffer.from('null', 'utf8').toString('base64'));
    });

    it('converts undefined to base64 string', () => {
      const result = convertToBase64(undefined);
      
      expect(result).toBe(Buffer.from('undefined', 'utf8').toString('base64'));
    });
  });

  describe('base64ToBuffer', () => {
    it('decodes base64 string to Buffer', () => {
      const original = 'Hello, World!';
      const base64 = Buffer.from(original, 'utf8').toString('base64');
      const result = base64ToBuffer(base64);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString('utf8')).toBe(original);
    });

    it('handles empty base64 string', () => {
      const result = base64ToBuffer('');
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('decodes binary data correctly', () => {
      const binaryData = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const base64 = Buffer.from(binaryData).toString('base64');
      const result = base64ToBuffer(base64);
      
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(Array.from(result)).toEqual(Array.from(binaryData));
    });
  });

  describe('round-trip conversion', () => {
    it('maintains data integrity for string', () => {
      const original = 'Test data with special chars: @#$%^&*()';
      const base64 = convertToBase64(original);
      const decoded = base64ToBuffer(base64).toString('utf8');
      
      expect(decoded).toBe(original);
    });

    it('maintains data integrity for binary data', () => {
      const original = new Uint8Array([0, 127, 255, 1, 2, 3]);
      const base64 = convertToBase64(original);
      const decoded = base64ToBuffer(base64);
      
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });

    it('maintains data integrity for UTF-8 text', () => {
      const original = '你好世界 🌍 émojis and special chars';
      const base64 = convertToBase64(original);
      const decoded = base64ToBuffer(base64).toString('utf8');
      
      expect(decoded).toBe(original);
    });
  });
});
