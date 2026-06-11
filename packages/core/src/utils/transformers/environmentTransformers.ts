/**
 * Environment Transformers
 *
 * Lightweight transformer module for environment import formats.
 * Mirrors the collection transformer pattern but scoped to two formats:
 * - `wave`:    Wave environment JSON (single env object or array), validated by the FEAT-001 schema.
 * - `postman`: Postman environment export, mapped to Wave format before persistence.
 *
 * The transform boundary keeps the import pipeline Wave-only downstream:
 * `transformEnvironments` always returns `Environment[]` ready for
 * `onImportEnvironments(fileName, JSON.stringify(envs))`.
 *
 * @example
 * ```typescript
 * const format = detectEnvironmentFormat(text) ?? 'wave';
 * const result = transformEnvironments(text, format);
 * if (result.isOk) {
 *   onImportEnvironments(fileName, JSON.stringify(result.value));
 * } else {
 *   showError(result.error);
 * }
 * ```
 */

import type { Environment, EnvironmentVariable } from '../../types/collection';
import { ok, err } from '../result';
import type { Result } from '../result';
import {
    validateWaveEnvironment,
    CURRENT_ENVIRONMENT_SCHEMA_VERSION,
} from '../../schemas/environmentSchema';
import { generateUniqueId } from '../common';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported environment import format types.
 * - `wave`:    Native Wave JSON (single env or array of envs).
 * - `postman`: Postman environment export JSON.
 */
export type EnvironmentImportFormatType = 'wave' | 'postman';

/**
 * Dropdown options for the Environment Type selector in the import wizard.
 *
 * @example
 * ENVIRONMENT_IMPORT_FORMAT_OPTIONS.map(o => <SelectItem value={o.value}>{o.label}</SelectItem>)
 */
export const ENVIRONMENT_IMPORT_FORMAT_OPTIONS: ReadonlyArray<{
    value: EnvironmentImportFormatType;
    label: string;
}> = [
    { value: 'wave', label: 'Wave JSON' },
    { value: 'postman', label: 'Postman' },
];

// ============================================================================
// Postman shape (internal — for narrowing only)
// ============================================================================

interface PostmanEnvValue {
    key: string;
    value: string;
    enabled?: boolean;
    type?: string;
}

interface PostmanEnvironment {
    name: string;
    values: PostmanEnvValue[];
    _postman_variable_scope?: string;
}

// ============================================================================
// Detection
// ============================================================================

/**
 * Returns `true` when the object looks like a Postman environment export.
 *
 * Postman signals (either is sufficient):
 * 1. `_postman_variable_scope === 'environment'`
 * 2. `values` is an array of `{key, value}` objects that lack Wave's typed shape
 *    (Wave values always have `type: 'default' | 'secret'` and a boolean `enabled`).
 */
function looksLikePostman(obj: Record<string, unknown>): boolean {
    if (obj['_postman_variable_scope'] === 'environment') {
        return true;
    }

    // Check if values array looks like Postman-shaped items (key+value without Wave-typed fields)
    const values = obj['values'];
    if (!Array.isArray(values) || values.length === 0) {
        return false;
    }

    // If at least one value has `key` and `value` but lacks Wave's `type` discriminant
    return values.some(
        (v) =>
            typeof v === 'object' &&
            v !== null &&
            typeof (v as Record<string, unknown>)['key'] === 'string' &&
            'value' in (v as Record<string, unknown>) &&
            typeof (v as Record<string, unknown>)['type'] !== 'string',
    );
}

/**
 * Returns `true` when the object looks like a Wave environment (single object).
 *
 * Wave signals: has `name` (string), `values` array, and at least one value with
 * the Wave `type` discriminant (`'default'` or `'secret'`) and a boolean `enabled`.
 */
function looksLikeWaveEnv(obj: Record<string, unknown>): boolean {
    if (typeof obj['name'] !== 'string') return false;
    if (!Array.isArray(obj['values'])) return false;
    if (obj['values'].length === 0) return true; // Empty values array is valid Wave

    return obj['values'].some(
        (v) =>
            typeof v === 'object' &&
            v !== null &&
            (v as Record<string, unknown>)['type'] === 'default' ||
            (v as Record<string, unknown>)['type'] === 'secret',
    );
}

/**
 * Detects the environment import format from raw file text.
 *
 * Detection chain:
 * 1. Empty / whitespace → `undefined`
 * 2. Not valid JSON → `undefined`
 * 3. Valid JSON array → check first element; if it passes Wave shape → `'wave'`;
 *    if it passes Postman shape → `'postman'`; else `undefined`.
 * 4. Valid JSON object → Postman check first (stronger signal from
 *    `_postman_variable_scope`), then Wave shape; else `undefined`.
 *
 * @param text - Raw file text to analyse.
 * @returns The detected format, or `undefined` when inconclusive.
 *
 * @example
 * detectEnvironmentFormat('{"_postman_variable_scope":"environment","name":"Prod","values":[]}')
 * // 'postman'
 * detectEnvironmentFormat('[{"id":"abc","name":"Dev","version":"0.0.1","values":[]}]')
 * // 'wave'
 * detectEnvironmentFormat('not json')
 * // undefined
 */
export function detectEnvironmentFormat(text: string): EnvironmentImportFormatType | undefined {
    if (!text || !text.trim()) return undefined;

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }

    if (Array.isArray(parsed)) {
        if (parsed.length === 0) return undefined;
        const first = parsed[0];
        if (typeof first !== 'object' || first === null) return undefined;
        const firstObj = first as Record<string, unknown>;
        if (looksLikePostman(firstObj)) return 'postman';
        if (looksLikeWaveEnv(firstObj)) return 'wave';
        return undefined;
    }

    if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        if (looksLikePostman(obj)) return 'postman';
        if (looksLikeWaveEnv(obj)) return 'wave';
    }

    return undefined;
}

// ============================================================================
// Postman structural validation
// ============================================================================

function isPostmanEnvValue(v: unknown): v is PostmanEnvValue {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Record<string, unknown>)['key'] === 'string' &&
        'value' in (v as Record<string, unknown>)
    );
}

function isPostmanEnvironment(data: unknown): data is PostmanEnvironment {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;
    return (
        typeof obj['name'] === 'string' &&
        Array.isArray(obj['values']) &&
        (obj['values'] as unknown[]).every(isPostmanEnvValue)
    );
}

// ============================================================================
// Postman → Wave mapping
// ============================================================================

/**
 * Maps a single Postman environment export to a Wave `Environment`.
 *
 * Mapping rules:
 * - `id` ← fresh `generateUniqueId()` (never trust Postman's id)
 * - `name` ← `name`
 * - `version` ← `CURRENT_ENVIRONMENT_SCHEMA_VERSION`
 * - `values[]` ← mapped per variable:
 *   - `key` ← `key`
 *   - `value` ← `value` (coerced to string; Postman occasionally stores numbers)
 *   - `enabled` ← `enabled` (default `true` when absent)
 *   - `type` ← `'secret'` when Postman `type === 'secret'`, else `'default'`
 *
 * @example
 * ```typescript
 * const waveEnv = mapPostmanToWave({
 *   name: 'Production',
 *   values: [{ key: 'API_KEY', value: 'secret123', type: 'secret', enabled: true }],
 *   _postman_variable_scope: 'environment',
 * });
 * // waveEnv.values[0].type === 'secret'
 * // waveEnv.version === '0.0.1'
 * ```
 */
function mapPostmanToWave(postman: PostmanEnvironment): Environment {
    const values: EnvironmentVariable[] = postman.values.map((v) => ({
        key: v.key,
        value: String(v.value ?? ''),
        enabled: v.enabled !== false, // default true when absent or undefined
        type: v.type === 'secret' ? 'secret' : 'default',
    }));

    return {
        id: generateUniqueId(),
        name: postman.name,
        version: CURRENT_ENVIRONMENT_SCHEMA_VERSION,
        values,
    };
}

// ============================================================================
// Wave parsing & validation
// ============================================================================

/**
 * Parses Wave-format environment text (single object or array) and validates
 * each entry against the FEAT-001 schema.
 *
 * Note: wave files must already be valid — this function does NOT stamp missing
 * fields. Version stamping stays in the service layer on load.
 */
function parseAndValidateWave(text: string): Result<Environment[], string> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return err('Invalid JSON: could not parse environment file');
    }

    const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];

    const environments: Environment[] = [];
    for (let i = 0; i < items.length; i++) {
        const result = validateWaveEnvironment(items[i]);
        if (!result.isOk) {
            const label = items.length > 1 ? `environment at index ${i}` : 'environment';
            return err(`Invalid Wave ${label}: ${result.error}`);
        }
        environments.push(result.value);
    }

    return ok(environments);
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Transforms raw environment file text into an array of Wave `Environment` objects.
 *
 * - `'wave'`:    Parses the text (single obj or array) and validates each entry
 *               with FEAT-001's `validateWaveEnvironment`. Returns `err` on any
 *               validation failure.
 * - `'postman'`: Structurally validates the Postman shape (name + values array),
 *               maps per the §2 data model (fresh id, stamped version, secret-type
 *               mapping, enabled default true), and returns a one-element array.
 *
 * Never throws — all failures are returned as `err(message)`.
 *
 * @param text   - Raw file text (must be valid JSON for both formats).
 * @param format - The format to parse as.
 * @returns `ok(environments)` on success; `err(message)` with a descriptive error.
 *
 * @example
 * ```typescript
 * const result = transformEnvironments(fileText, 'postman');
 * if (result.isOk) {
 *   onImportEnvironments(fileName, JSON.stringify(result.value));
 * } else {
 *   setError(result.error);
 * }
 * ```
 */
export function transformEnvironments(
    text: string,
    format: EnvironmentImportFormatType,
): Result<Environment[], string> {
    if (!text || !text.trim()) {
        return err('Environment file is empty');
    }

    if (format === 'wave') {
        return parseAndValidateWave(text);
    }

    // Postman format
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return err('Invalid JSON: could not parse environment file');
    }

    if (!isPostmanEnvironment(parsed)) {
        return err(
            'Invalid Postman environment: expected an object with "name" (string) and "values" (array of {key, value} objects)',
        );
    }

    return ok([mapPostmanToWave(parsed)]);
}
