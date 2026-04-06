import { describe, it, expect } from 'vitest';
import { validateJsonSchemaString } from '../../utils/schemaValidation';

describe('validateJsonSchemaString', () => {
    it('returns valid: true for a simple valid schema string', () => {
        const result = validateJsonSchemaString('{"type":"object"}');
        expect(result).toEqual({ valid: true });
    });

    it('returns valid: false with error for an empty string', () => {
        const result = validateJsonSchemaString('');
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['Schema is required']);
    });

    it('returns valid: false with error for a whitespace-only string', () => {
        const result = validateJsonSchemaString('   ');
        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['Schema is required']);
    });

    it('returns valid: false with "Invalid JSON:" prefix for non-JSON input', () => {
        const result = validateJsonSchemaString('not json at all');
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toMatch(/^Invalid JSON:/);
    });

    it('returns valid: false with "Invalid JSON Schema:" prefix for valid JSON but invalid schema type', () => {
        const result = validateJsonSchemaString('{"type":"invalidType"}');
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toMatch(/^Invalid JSON Schema:/);
    });

    it('returns valid: true for a complex valid schema with nested properties, required, and enum', () => {
        const schema = JSON.stringify({
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'integer', minimum: 0 },
                status: { type: 'string', enum: ['active', 'inactive'] },
                address: {
                    type: 'object',
                    properties: {
                        city: { type: 'string' },
                        zip: { type: 'string', pattern: '^[0-9]{5}$' },
                    },
                    required: ['city'],
                },
            },
            required: ['name', 'age'],
        });
        const result = validateJsonSchemaString(schema);
        expect(result).toEqual({ valid: true });
    });

    it('returns valid: true for a boolean schema (true)', () => {
        const result = validateJsonSchemaString('true');
        expect(result).toEqual({ valid: true });
    });

    it('returns valid: true for an array type schema', () => {
        const result = validateJsonSchemaString('{"type":"array","items":{"type":"string"}}');
        expect(result).toEqual({ valid: true });
    });

    it('returns valid: false for truncated/malformed JSON', () => {
        const result = validateJsonSchemaString('{"type":');
        expect(result.valid).toBe(false);
        expect(result.errors?.[0]).toMatch(/^Invalid JSON:/);
    });
});
