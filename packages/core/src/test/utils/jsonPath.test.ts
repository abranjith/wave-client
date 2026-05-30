import { describe, it, expect } from 'vitest';
import { evaluateJsonPath } from '../../utils/jsonPath';

const SAMPLE_JSON_BODY = JSON.stringify({
    data: {
        id: 123,
    },
    items: [
        { id: 1, name: 'One' },
        { id: 2, name: 'Two' },
        { id: 3, name: 'Three' },
    ],
    users: [
        { id: 10, name: 'Alice', active: true },
        { id: 11, name: 'Bob', active: false },
        { id: 12, name: 'Carol', active: true },
    ],
});

describe('evaluateJsonPath', () => {
    it('resolves a scalar path', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$.data.id');

        expect(result).toEqual({
            value: 123,
            values: [123],
            found: true,
        });
    });

    it('resolves an array index path', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$.items[0].name');

        expect(result.value).toBe('One');
        expect(result.values).toEqual(['One']);
        expect(result.found).toBe(true);
    });

    it('supports recursive descent', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$..id');

        expect(result.found).toBe(true);
        expect(result.value).toBe(123);
        expect(result.values).toContain(10);
        expect(result.values).toContain(3);
    });

    it('supports wildcard expressions and returns first + all matches', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$.users[*].name');

        expect(result.found).toBe(true);
        expect(result.value).toBe('Alice');
        expect(result.values).toEqual(['Alice', 'Bob', 'Carol']);
    });

    it('supports filter expressions', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$.users[?(@.active)].id');

        expect(result.found).toBe(true);
        expect(result.value).toBe(10);
        expect(result.values).toEqual([10, 12]);
    });

    it('supports array slices', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$.items[0:2]');

        expect(result.found).toBe(true);
        expect(result.values).toEqual([
            { id: 1, name: 'One' },
            { id: 2, name: 'Two' },
        ]);
    });

    it('returns found=false when the path has no matches', () => {
        const result = evaluateJsonPath(SAMPLE_JSON_BODY, '$.missing.value');

        expect(result.found).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.values).toEqual([]);
        expect(result.error).toBeUndefined();
    });

    it('returns found=false with error when body is not valid JSON', () => {
        const result = evaluateJsonPath('not-json', '$.data.id');

        expect(result.found).toBe(false);
        expect(result.value).toBeUndefined();
        expect(result.values).toEqual([]);
        expect(result.error).toBeTruthy();
    });

    it('does not execute arbitrary code from crafted filter expressions', () => {
        const probeKey = '__WAVE_JSONPATH_EVAL_PROBE__';
        const globalProbe = globalThis as typeof globalThis & Record<string, unknown>;
        delete globalProbe[probeKey];

        const result = evaluateJsonPath(
            SAMPLE_JSON_BODY,
            `$.users[?(@.active && (globalThis.${probeKey} = true))].id`,
        );

        expect(result.found).toBe(false);
        expect(globalProbe[probeKey]).toBeUndefined();
    });
});
