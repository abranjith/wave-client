import { describe, it, expect } from 'vitest';

import {
    CURRENT_ENVIRONMENT_SCHEMA_VERSION,
    validateWaveEnvironment,
} from '../../schemas/environmentSchema';
import type { Environment } from '../../types/collection';

/** Builds a minimal valid environment for tests. */
function minimalEnvironment(): Environment {
    return {
        id: 'env-1',
        name: 'Test Env',
        version: CURRENT_ENVIRONMENT_SCHEMA_VERSION,
        values: [],
    };
}

describe('validateWaveEnvironment', () => {
    it('accepts a valid environment', () => {
        const env = minimalEnvironment();
        env.values = [
            { key: 'BASE_URL', value: 'https://example.com', type: 'default', enabled: true },
        ];
        expect(validateWaveEnvironment(env).isOk).toBe(true);
    });

    it('accepts an environment with empty values', () => {
        expect(validateWaveEnvironment(minimalEnvironment()).isOk).toBe(true);
    });

    it('accepts a secret variable with notes', () => {
        const env = minimalEnvironment();
        env.values = [
            { key: 'TOKEN', value: 's3cret', type: 'secret', notes: 'rotate monthly', enabled: false },
        ];
        expect(validateWaveEnvironment(env).isOk).toBe(true);
    });

    it('rejects an environment missing version', () => {
        const env = { id: 'e', name: 'N', values: [] };
        const result = validateWaveEnvironment(env);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('version');
    });

    it('rejects an invalid variable type value', () => {
        const env = {
            ...minimalEnvironment(),
            values: [{ key: 'K', value: 'V', type: 'hidden', enabled: true }],
        };
        const result = validateWaveEnvironment(env);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('type');
    });

    it('rejects a variable missing enabled', () => {
        const env = {
            ...minimalEnvironment(),
            values: [{ key: 'K', value: 'V', type: 'default' }],
        };
        const result = validateWaveEnvironment(env);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('enabled');
    });

    it('rejects an empty name', () => {
        const env = { ...minimalEnvironment(), name: '' };
        const result = validateWaveEnvironment(env);
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('name');
    });

    it.each([
        ['null', null],
        ['a string', 'nope'],
        ['an array', []],
    ])('rejects %s input gracefully', (_label, input) => {
        const result = validateWaveEnvironment(input);
        expect(result.isOk).toBe(false);
        expect(typeof result.error).toBe('string');
    });

    it('preserves unknown extra fields by returning the original object', () => {
        const env = { ...minimalEnvironment(), extra: 'keep' };
        const result = validateWaveEnvironment(env);
        expect(result.isOk).toBe(true);
        expect(result.value).toBe(env);
    });
});

describe('CURRENT_ENVIRONMENT_SCHEMA_VERSION', () => {
    it('is 0.0.1', () => {
        expect(CURRENT_ENVIRONMENT_SCHEMA_VERSION).toBe('0.0.1');
    });
});
