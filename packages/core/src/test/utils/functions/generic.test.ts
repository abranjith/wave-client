import { describe, expect, it } from 'vitest';
import {
    resolveFunctionPlaceholder,
    validateFunctionTemplate,
} from '../../../utils/functions';

const UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generic function generators', () => {
    it('returns valid random UUID values', () => {
        const first = resolveFunctionPlaceholder('_fn_random_uuid');
        const second = resolveFunctionPlaceholder('_fn_random_uuid');

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();
        expect(first?.resolved).toMatch(UUID_V4_REGEX);
        expect(second?.resolved).toMatch(UUID_V4_REGEX);
        expect(first?.resolved).not.toBe(second?.resolved);
    });

    it('generates random numbers within min and max', () => {
        const value = resolveFunctionPlaceholder('_fn_random_number(min=10,max=20,decimals=0)');

        expect(value).not.toBeNull();
        const parsed = Number(value?.resolved);
        expect(parsed).toBeGreaterThanOrEqual(10);
        expect(parsed).toBeLessThanOrEqual(20);
    });

    it('applies number decimals and affixes', () => {
        const value = resolveFunctionPlaceholder('_fn_random_number(min=12,max=12,decimals=2,prefix=$,suffix=%)');

        expect(value?.resolved).toBe('$12.00%');
    });

    it('reports validation errors when min is greater than max', () => {
        const errors = validateFunctionTemplate('{{_fn_random_number(min=20,max=10)}}');

        expect(errors.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });

    it('generates random strings with requested length and charset', () => {
        const value = resolveFunctionPlaceholder('_fn_random_string(length=8,charset=A-Z0-9)');

        expect(value).not.toBeNull();
        expect(value?.resolved).toHaveLength(8);
        expect(value?.resolved).toMatch(/^[A-Z0-9]+$/);
    });

    it('honors custom charset values', () => {
        const value = resolveFunctionPlaceholder('_fn_random_string(length=12,charset=AB)');

        expect(value).not.toBeNull();
        expect(value?.resolved).toHaveLength(12);
        expect(value?.resolved).toMatch(/^[AB]+$/);
    });

    it('reports validation errors for invalid string length', () => {
        const errors = validateFunctionTemplate('{{_fn_random_string(length=0)}}');

        expect(errors.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });
});
