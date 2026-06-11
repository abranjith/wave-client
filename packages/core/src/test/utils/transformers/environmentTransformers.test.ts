import { describe, it, expect } from 'vitest';
import {
    detectEnvironmentFormat,
    transformEnvironments,
    ENVIRONMENT_IMPORT_FORMAT_OPTIONS,
} from '../../../utils/transformers/environmentTransformers';
import { CURRENT_ENVIRONMENT_SCHEMA_VERSION } from '../../../schemas/environmentSchema';

// ============================================================================
// Fixtures
// ============================================================================

/** Full Postman environment export with mixed enabled flags, one secret, one missing type */
const postmanFixtureWithScope = JSON.stringify({
    id: 'postman-env-id-do-not-trust',
    name: 'My Postman Env',
    values: [
        { key: 'BASE_URL', value: 'https://api.example.com', enabled: true, type: 'default' },
        { key: 'API_KEY', value: 'supersecret', enabled: true, type: 'secret' },
        { key: 'DISABLED_VAR', value: 'off', enabled: false, type: 'default' },
        { key: 'NO_TYPE_VAR', value: 'plain' }, // missing type → should default to 'default'
        { key: 'NO_ENABLED_VAR', value: 'yes', type: 'default' }, // missing enabled → should default to true
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_at: '2024-01-01T00:00:00.000Z',
    _postman_exported_using: 'Postman/10.0',
});

/** Postman environment without _postman_variable_scope — detected via values shape */
const postmanFixtureNoScope = JSON.stringify({
    name: 'No Scope Env',
    values: [
        { key: 'APIURL', value: 'https://example.com' },
        { key: 'TOKEN', value: 'tok123', type: 'secret', enabled: false },
    ],
});

/** Wave environment — single object */
const waveEnvSingle = JSON.stringify({
    id: 'wave-env-1',
    name: 'Development',
    version: '0.0.1',
    values: [
        { key: 'API_URL', value: 'http://localhost:3000', type: 'default', enabled: true },
        { key: 'SECRET', value: 'dev-secret', type: 'secret', enabled: true },
    ],
});

/** Wave environment — array of two environments */
const waveEnvArray = JSON.stringify([
    {
        id: 'wave-env-1',
        name: 'Development',
        version: '0.0.1',
        values: [
            { key: 'API_URL', value: 'http://localhost:3000', type: 'default', enabled: true },
        ],
    },
    {
        id: 'wave-env-2',
        name: 'Production',
        version: '0.0.1',
        values: [
            { key: 'API_URL', value: 'https://api.example.com', type: 'default', enabled: true },
        ],
    },
]);

/** Wave env with empty values array */
const waveEnvEmpty = JSON.stringify({
    id: 'wave-env-empty',
    name: 'Empty Env',
    version: '0.0.1',
    values: [],
});

/** Postman env with empty values array */
const postmanEnvEmpty = JSON.stringify({
    name: 'Empty Postman Env',
    values: [],
    _postman_variable_scope: 'environment',
});

/** Completely garbage JSON object */
const garbageObj = JSON.stringify({ foo: 'bar', baz: 42 });

/** Not even JSON */
const notJson = 'definitely not json {{ {{ [[';

/** Postman missing the name field */
const postmanMissingName = JSON.stringify({
    values: [{ key: 'A', value: 'b' }],
    _postman_variable_scope: 'environment',
});

/** Postman missing the values field */
const postmanMissingValues = JSON.stringify({
    name: 'Bad Env',
    _postman_variable_scope: 'environment',
});

// ============================================================================
// ENVIRONMENT_IMPORT_FORMAT_OPTIONS
// ============================================================================

describe('ENVIRONMENT_IMPORT_FORMAT_OPTIONS', () => {
    it('has wave and postman options', () => {
        const values = ENVIRONMENT_IMPORT_FORMAT_OPTIONS.map((o) => o.value);
        expect(values).toContain('wave');
        expect(values).toContain('postman');
    });

    it('each option has a non-empty label', () => {
        for (const opt of ENVIRONMENT_IMPORT_FORMAT_OPTIONS) {
            expect(opt.label.length).toBeGreaterThan(0);
        }
    });
});

// ============================================================================
// detectEnvironmentFormat
// ============================================================================

describe('detectEnvironmentFormat', () => {
    it('detects postman with _postman_variable_scope', () => {
        expect(detectEnvironmentFormat(postmanFixtureWithScope)).toBe('postman');
    });

    it('detects postman without _postman_variable_scope via values shape', () => {
        expect(detectEnvironmentFormat(postmanFixtureNoScope)).toBe('postman');
    });

    it('detects wave single object', () => {
        expect(detectEnvironmentFormat(waveEnvSingle)).toBe('wave');
    });

    it('detects wave array', () => {
        expect(detectEnvironmentFormat(waveEnvArray)).toBe('wave');
    });

    it('returns undefined for garbage object', () => {
        expect(detectEnvironmentFormat(garbageObj)).toBeUndefined();
    });

    it('returns undefined for non-JSON text', () => {
        expect(detectEnvironmentFormat(notJson)).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
        expect(detectEnvironmentFormat('')).toBeUndefined();
    });

    it('returns undefined for whitespace-only string', () => {
        expect(detectEnvironmentFormat('   \n\t  ')).toBeUndefined();
    });

    it('returns undefined for empty array JSON', () => {
        expect(detectEnvironmentFormat('[]')).toBeUndefined();
    });

    it('returns undefined for null JSON', () => {
        expect(detectEnvironmentFormat('null')).toBeUndefined();
    });

    it('detects postman even when env has empty values array (scope signal)', () => {
        expect(detectEnvironmentFormat(postmanEnvEmpty)).toBe('postman');
    });

    it('detects wave for env with empty values array when it has an id and version', () => {
        expect(detectEnvironmentFormat(waveEnvEmpty)).toBe('wave');
    });
});

// ============================================================================
// transformEnvironments — Postman format
// ============================================================================

describe('transformEnvironments (postman format)', () => {
    it('maps a Postman env to a one-element Wave array', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value).toHaveLength(1);
    });

    it('stamps CURRENT_ENVIRONMENT_SCHEMA_VERSION on the output', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].version).toBe(CURRENT_ENVIRONMENT_SCHEMA_VERSION);
    });

    it('generates a fresh id (not the Postman id)', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].id).not.toBe('postman-env-id-do-not-trust');
        expect(result.value[0].id.length).toBeGreaterThan(0);
    });

    it('preserves the environment name', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].name).toBe('My Postman Env');
    });

    it('maps secret-type Postman variable to Wave type: secret', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        const apiKey = result.value[0].values.find((v) => v.key === 'API_KEY');
        expect(apiKey?.type).toBe('secret');
    });

    it('maps default-type Postman variable to Wave type: default', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        const baseUrl = result.value[0].values.find((v) => v.key === 'BASE_URL');
        expect(baseUrl?.type).toBe('default');
    });

    it('maps missing Postman type to Wave type: default', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        const noType = result.value[0].values.find((v) => v.key === 'NO_TYPE_VAR');
        expect(noType?.type).toBe('default');
    });

    it('preserves enabled: false correctly', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        const disabled = result.value[0].values.find((v) => v.key === 'DISABLED_VAR');
        expect(disabled?.enabled).toBe(false);
    });

    it('defaults missing enabled to true', () => {
        const result = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        const noEnabled = result.value[0].values.find((v) => v.key === 'NO_ENABLED_VAR');
        expect(noEnabled?.enabled).toBe(true);
    });

    it('detects postman without _postman_variable_scope and maps correctly', () => {
        const result = transformEnvironments(postmanFixtureNoScope, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].name).toBe('No Scope Env');
        const token = result.value[0].values.find((v) => v.key === 'TOKEN');
        expect(token?.type).toBe('secret');
        expect(token?.enabled).toBe(false);
    });

    it('handles empty values array', () => {
        const result = transformEnvironments(postmanEnvEmpty, 'postman');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].values).toHaveLength(0);
    });

    it('returns err for malformed JSON', () => {
        const result = transformEnvironments(notJson, 'postman');
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('Invalid JSON');
    });

    it('returns descriptive err when Postman name is missing', () => {
        const result = transformEnvironments(postmanMissingName, 'postman');
        expect(result.isOk).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
    });

    it('returns descriptive err when Postman values is missing', () => {
        const result = transformEnvironments(postmanMissingValues, 'postman');
        expect(result.isOk).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
    });

    it('returns err for empty file text', () => {
        const result = transformEnvironments('', 'postman');
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('empty');
    });

    it('generates unique ids across multiple calls', () => {
        const r1 = transformEnvironments(postmanFixtureWithScope, 'postman');
        const r2 = transformEnvironments(postmanFixtureWithScope, 'postman');
        expect(r1.isOk).toBe(true);
        expect(r2.isOk).toBe(true);
        if (!r1.isOk || !r2.isOk) return;
        expect(r1.value[0].id).not.toBe(r2.value[0].id);
    });
});

// ============================================================================
// transformEnvironments — Wave format
// ============================================================================

describe('transformEnvironments (wave format)', () => {
    it('parses a valid Wave single-object env', () => {
        const result = transformEnvironments(waveEnvSingle, 'wave');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value).toHaveLength(1);
        expect(result.value[0].name).toBe('Development');
    });

    it('parses a valid Wave array of two envs', () => {
        const result = transformEnvironments(waveEnvArray, 'wave');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value).toHaveLength(2);
        expect(result.value[0].name).toBe('Development');
        expect(result.value[1].name).toBe('Production');
    });

    it('preserves the existing id from Wave env (does not regenerate)', () => {
        const result = transformEnvironments(waveEnvSingle, 'wave');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].id).toBe('wave-env-1');
    });

    it('handles Wave env with empty values array', () => {
        const result = transformEnvironments(waveEnvEmpty, 'wave');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        expect(result.value[0].values).toHaveLength(0);
    });

    it('returns err for malformed JSON', () => {
        const result = transformEnvironments(notJson, 'wave');
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('Invalid JSON');
    });

    it('returns descriptive err for a Wave env missing required id', () => {
        const missingId = JSON.stringify({
            name: 'Bad Wave Env',
            version: '0.0.1',
            values: [],
        });
        const result = transformEnvironments(missingId, 'wave');
        expect(result.isOk).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(result.error!.length).toBeGreaterThan(0);
    });

    it('returns descriptive err for a Wave env missing required name', () => {
        const missingName = JSON.stringify({
            id: 'env-1',
            version: '0.0.1',
            values: [],
        });
        const result = transformEnvironments(missingName, 'wave');
        expect(result.isOk).toBe(false);
        expect(typeof result.error).toBe('string');
    });

    it('returns descriptive err for a Wave env missing version', () => {
        const missingVersion = JSON.stringify({
            id: 'env-1',
            name: 'No Version',
            values: [],
        });
        const result = transformEnvironments(missingVersion, 'wave');
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('version');
    });

    it('returns err when array contains an invalid Wave env (bad index reported)', () => {
        const badArray = JSON.stringify([
            { id: 'env-1', name: 'Good', version: '0.0.1', values: [] },
            { name: 'Missing id', version: '0.0.1', values: [] }, // missing id
        ]);
        const result = transformEnvironments(badArray, 'wave');
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('index 1');
    });

    it('returns err for empty file text', () => {
        const result = transformEnvironments('', 'wave');
        expect(result.isOk).toBe(false);
        expect(result.error).toContain('empty');
    });

    it('passes through extra fields (validate-only semantics)', () => {
        const extraFields = JSON.stringify({
            id: 'env-x',
            name: 'Extra Fields',
            version: '0.0.1',
            values: [],
            customField: 'preserved',
        });
        const result = transformEnvironments(extraFields, 'wave');
        expect(result.isOk).toBe(true);
        if (!result.isOk) return;
        // Validate-only: the original object is returned, extra fields survive
        expect((result.value[0] as unknown as Record<string, unknown>)['customField']).toBe('preserved');
    });
});
