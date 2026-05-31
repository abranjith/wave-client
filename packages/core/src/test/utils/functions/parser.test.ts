import { describe, expect, it } from 'vitest';
import { getRegisteredFunctionNames } from '../../../utils/functions';
import { parseFunctionPlaceholder } from '../../../utils/functions/parser';

describe('parseFunctionPlaceholder', () => {
    it('parses a bare function placeholder', () => {
        getRegisteredFunctionNames();
        const parsed = parseFunctionPlaceholder('_fn_random_uuid');

        expect(parsed.functionName).toBe('_fn_random_uuid');
        expect(parsed.args).toEqual({});
        expect(parsed.errors).toEqual([]);
    });

    it('parses function arguments', () => {
        getRegisteredFunctionNames();
        const parsed = parseFunctionPlaceholder('_fn_random_number(min=1, max=100, decimals=2)');

        expect(parsed.functionName).toBe('_fn_random_number');
        expect(parsed.args).toEqual({
            min: '1',
            max: '100',
            decimals: '2',
        });
        expect(parsed.errors).toEqual([]);
    });

    it('flags unknown function placeholders', () => {
        getRegisteredFunctionNames();
        const parsed = parseFunctionPlaceholder('_fn_typo');

        expect(parsed.errors.some((error) => error.code === 'unknown_function')).toBe(true);
    });

    it('flags unknown arguments', () => {
        getRegisteredFunctionNames();
        const parsed = parseFunctionPlaceholder('_fn_random_uuid(extra=1)');

        expect(parsed.errors.some((error) => error.code === 'unknown_argument')).toBe(true);
    });

    it('flags malformed function argument syntax', () => {
        getRegisteredFunctionNames();
        const parsed = parseFunctionPlaceholder('_fn_random_number(min=1, max=100');

        expect(parsed.errors.some((error) => error.code === 'malformed_placeholder')).toBe(true);
    });

    it('flags values that contain unsupported delimiters', () => {
        getRegisteredFunctionNames();
        const parsed = parseFunctionPlaceholder('_fn_random_name_prefix(values=Dr(Prof))');

        expect(parsed.errors.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });
});
