import { describe, expect, it } from 'vitest';
import { getLocaleData } from '../../../data/fnData';
import {
    resolveFunctionPlaceholder,
    validateFunctionTemplate,
} from '../../../utils/functions';

describe('address function generators', () => {
    it('generates address line 1 and ZIP code in expected shape', () => {
        const line1 = resolveFunctionPlaceholder('_fn_random_address_l1');
        const zip = resolveFunctionPlaceholder('_fn_random_address_zip');

        expect(line1).not.toBeNull();
        expect(zip).not.toBeNull();
        expect(line1?.resolved).toMatch(/^\d+ [A-Za-z]+ [A-Za-z]+$/);
        expect(zip?.resolved).toMatch(/^\d{5}$/);
    });

    it('supports full and abbreviated state and country formats', () => {
        const localeData = getLocaleData();
        const stateFull = resolveFunctionPlaceholder('_fn_random_address_state(format=full)');
        const stateAbbr = resolveFunctionPlaceholder('_fn_random_address_state(format=abbr)');
        const countryFull = resolveFunctionPlaceholder('_fn_random_address_country(format=full)');
        const countryAbbr = resolveFunctionPlaceholder('_fn_random_address_country(format=abbr)');

        expect(localeData.states.some((state) => state.full === stateFull?.resolved)).toBe(true);
        expect(localeData.states.some((state) => state.abbr === stateAbbr?.resolved)).toBe(true);
        expect(localeData.countries.some((country) => country.full === countryFull?.resolved)).toBe(true);
        expect(localeData.countries.some((country) => country.abbr === countryAbbr?.resolved)).toBe(true);
    });

    it('generates composed addresses with city and ZIP', () => {
        const localeData = getLocaleData();
        const address = resolveFunctionPlaceholder('_fn_random_address');

        expect(address).not.toBeNull();
        expect(address?.resolved).toMatch(/\d{5}/);
        expect(localeData.cities.some((city) => address!.resolved.includes(city))).toBe(true);
    });

    it('returns validation errors for invalid format values', () => {
        const stateErrors = validateFunctionTemplate('{{_fn_random_address_state(format=foo)}}');
        const countryErrors = validateFunctionTemplate('{{_fn_random_address_country(format=foo)}}');

        expect(stateErrors.some((error) => error.code === 'invalid_argument_value')).toBe(true);
        expect(countryErrors.some((error) => error.code === 'invalid_argument_value')).toBe(true);
    });
});
