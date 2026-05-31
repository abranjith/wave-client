import { describe, expect, it } from 'vitest';
import { resolveFunctionPlaceholder } from '../../../utils/functions';

const SIMPLE_EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

describe('contact function generators', () => {
    it('generates email addresses and supports domain override', () => {
        const randomEmail = resolveFunctionPlaceholder('_fn_random_email');
        const customDomainEmail = resolveFunctionPlaceholder('_fn_random_email(domain=example.com)');

        expect(randomEmail).not.toBeNull();
        expect(randomEmail?.resolved).toMatch(SIMPLE_EMAIL_REGEX);
        expect(customDomainEmail).not.toBeNull();
        expect(customDomainEmail?.resolved.endsWith('@example.com')).toBe(true);
    });

    it('generates default phone and SSN formats', () => {
        const phone = resolveFunctionPlaceholder('_fn_random_phone');
        const ssn = resolveFunctionPlaceholder('_fn_random_ssn');

        expect(phone?.resolved).toMatch(/^\(\d{3}\) \d{3}-\d{4}$/);
        expect(ssn?.resolved).toMatch(/^\d{3}-\d{2}-\d{4}$/);
    });

    it('honors custom format strings for phone and SSN', () => {
        const phone = resolveFunctionPlaceholder('_fn_random_phone(format=+1-###-###-####)');
        const ssn = resolveFunctionPlaceholder('_fn_random_ssn(format=##-#######)');

        expect(phone?.resolved).toMatch(/^\+1-\d{3}-\d{3}-\d{4}$/);
        expect(ssn?.resolved).toMatch(/^\d{2}-\d{7}$/);
    });

    it('preserves digit placeholder counts in custom formats', () => {
        const pattern = '##-##-##';
        const result = resolveFunctionPlaceholder(`_fn_random_phone(format=${pattern})`);
        const digitCount = (result?.resolved.match(/\d/g) ?? []).length;

        expect(digitCount).toBe(6);
    });
});
