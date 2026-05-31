import { describe, expect, it } from 'vitest';
import {
    resolveFunctionPlaceholder,
    validateFunctionTemplate,
} from '../../../utils/functions';
import { formatDateTime } from '../../../utils/functions/formatters';

describe('datetime function generators', () => {
    it('formats tokens deterministically for fixed dates', () => {
        const fixed = new Date(2026, 4, 9, 7, 3, 8);
        const formatted = formatDateTime(fixed, 'YYYY-YY-MMM-MM-M-DD-D HH-H mm-m ss-s');

        expect(formatted).toBe('2026-26-May-05-5-09-9 07-7 03-3 08-8');
    });

    it('returns current date and time with default format patterns', () => {
        const dateResult = resolveFunctionPlaceholder('_fn_current_date');
        const timeResult = resolveFunctionPlaceholder('_fn_current_time');

        expect(dateResult?.resolved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(timeResult?.resolved).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('returns random date values inside configured range', () => {
        const result = resolveFunctionPlaceholder('_fn_random_date(min=2020-01-01,max=2020-01-31,format=YYYY-MM-DD)');

        expect(result).not.toBeNull();
        expect(result?.resolved).toMatch(/^2020-01-(0[1-9]|[12][0-9]|3[01])$/);
    });

    it('returns random time values inside configured range', () => {
        const result = resolveFunctionPlaceholder('_fn_random_time(min=08:00:00,max=08:30:00,format=HH:mm:ss)');

        expect(result).not.toBeNull();
        expect(result?.resolved).toMatch(/^08:(0[0-9]|1[0-9]|2[0-9]|30):[0-5][0-9]$/);
    });

    it('reports validation errors for invalid or reversed ranges', () => {
        const invalidDate = validateFunctionTemplate('{{_fn_random_date(min=bad,max=2020-01-01)}}');
        const reversedDate = validateFunctionTemplate('{{_fn_random_date(min=2020-02-01,max=2020-01-01)}}');
        const reversedTime = validateFunctionTemplate('{{_fn_random_time(min=23:00:00,max=08:00:00)}}');

        expect(invalidDate.some((error) => error.code === 'invalid_argument_value')).toBe(true);
        expect(reversedDate.some((error) => error.code === 'invalid_argument_value')).toBe(true);
        expect(reversedTime.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });
});
