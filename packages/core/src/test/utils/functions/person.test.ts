import { describe, expect, it } from 'vitest';
import { getLocaleData } from '../../../data/fnData';
import {
    resolveFunctionPlaceholder,
    validateFunctionTemplate,
} from '../../../utils/functions';

describe('person function generators', () => {
    it('generates person names with the requested number of parts', () => {
        const localeData = getLocaleData();
        const result = resolveFunctionPlaceholder('_fn_random_name(type=person,parts=3)');

        expect(result).not.toBeNull();
        const tokens = result?.resolved.split(' ') ?? [];
        expect(tokens).toHaveLength(3);
        expect(localeData.firstNames.includes(tokens[0])).toBe(true);
        expect(localeData.lastNames.includes(tokens[2])).toBe(true);
    });

    it('returns organization names when type=org', () => {
        const localeData = getLocaleData();
        const result = resolveFunctionPlaceholder('_fn_random_name(type=org)');

        expect(result).not.toBeNull();
        expect(localeData.orgNames.includes(result!.resolved)).toBe(true);
    });

    it('generates prefixes and suffixes from default pools', () => {
        const localeData = getLocaleData();
        const prefix = resolveFunctionPlaceholder('_fn_random_name_prefix');
        const suffix = resolveFunctionPlaceholder('_fn_random_name_suffix');

        expect(prefix).not.toBeNull();
        expect(suffix).not.toBeNull();
        expect(localeData.namePrefixes.includes(prefix!.resolved)).toBe(true);
        expect(localeData.nameSuffixes.includes(suffix!.resolved)).toBe(true);
    });

    it('supports override lists for prefixes and suffixes', () => {
        const prefix = resolveFunctionPlaceholder('_fn_random_name_prefix(values=Dr|Prof)');
        const suffix = resolveFunctionPlaceholder('_fn_random_name_suffix(values=Jr|III)');

        expect(prefix?.resolved === 'Dr' || prefix?.resolved === 'Prof').toBe(true);
        expect(suffix?.resolved === 'Jr' || suffix?.resolved === 'III').toBe(true);
    });

    it('returns validation errors for invalid type or parts', () => {
        const invalidType = validateFunctionTemplate('{{_fn_random_name(type=invalid)}}');
        const invalidParts = validateFunctionTemplate('{{_fn_random_name(parts=0)}}');

        expect(invalidType.some((error) => error.code === 'invalid_argument_value')).toBe(true);
        expect(invalidParts.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });
});
