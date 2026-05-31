import { describe, expect, it } from 'vitest';
import { validateFunctionTemplate } from '../../../utils/functions';

describe('validateFunctionTemplate', () => {
    it('returns no errors for valid function placeholders', () => {
        const errors = validateFunctionTemplate('id={{_fn_random_uuid}} code={{_fn_random_string(length=8)}}');

        expect(errors).toEqual([]);
    });

    it('returns structured errors for unknown functions', () => {
        const errors = validateFunctionTemplate('ok={{_fn_random_uuid}} bad={{_fn_typo}}');

        expect(errors).toHaveLength(1);
        expect(errors[0].code).toBe('unknown_function');
        expect(errors[0].functionName).toBe('_fn_typo');
    });

    it('ignores non-function placeholders', () => {
        const errors = validateFunctionTemplate('name={{ENV_NAME}}');

        expect(errors).toEqual([]);
    });

    it('validates argument values using function schema', () => {
        const errors = validateFunctionTemplate('{{_fn_random_number(min=100,max=1)}}');

        expect(errors.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });
});
