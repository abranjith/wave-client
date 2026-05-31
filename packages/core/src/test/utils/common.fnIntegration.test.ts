import { describe, expect, it } from 'vitest';
import { resolveParameterizedValue } from '../../utils/common';

const UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('resolveParameterizedValue function placeholder integration', () => {
    it('resolves _fn_ placeholders', () => {
        const result = resolveParameterizedValue('id={{_fn_random_uuid}}', new Map());

        expect(result.unresolved).toEqual([]);
        expect(result.resolved).toMatch(/^id=/);
        const value = result.resolved.slice(3);
        expect(value).toMatch(UUID_V4_REGEX);
    });

    it('tracks unknown function placeholders as unresolved', () => {
        const result = resolveParameterizedValue('{{_fn_typo}}', new Map());

        expect(result.resolved).toBe('{{_fn_typo}}');
        expect(result.unresolved).toEqual(['_fn_typo']);
    });

    it('resolves environment and function placeholders together', () => {
        const envVars = new Map([['BASE', 'https://api.example.com']]);
        const result = resolveParameterizedValue('{{BASE}}/users/{{_fn_random_uuid}}', envVars);

        expect(result.unresolved).toEqual([]);
        expect(result.resolved).toMatch(/^https:\/\/api\.example\.com\/users\//);
    });
});
