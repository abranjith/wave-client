import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    clearFunctionRegistryForTests,
    getAllFunctions,
    getFunction,
    registerFunction,
} from '../../../utils/functions/registry';
import { getRegisteredFunctionNames } from '../../../utils/functions';
import type { FnDefinition } from '../../../utils/functions/types';

const testDefinition: FnDefinition = {
    name: '_fn_test_value',
    description: 'Test function',
    args: [],
    generate: () => 'value',
};

describe('function registry', () => {
    beforeEach(() => {
        clearFunctionRegistryForTests();
    });

    it('registers and gets definitions by name', () => {
        registerFunction(testDefinition);

        const resolved = getFunction('_fn_test_value');
        expect(resolved?.name).toBe('_fn_test_value');
    });

    it('throws when registering duplicate names', () => {
        registerFunction(testDefinition);

        expect(() => registerFunction(testDefinition)).toThrow(/already registered/i);
    });

    it('returns all registered definitions', () => {
        registerFunction(testDefinition);

        const allDefinitions = getAllFunctions();
        expect(allDefinitions).toHaveLength(1);
        expect(allDefinitions[0].name).toBe('_fn_test_value');
    });

    it('keeps README function catalog in sync with registered functions', () => {
        const readmePath = resolve(process.cwd(), 'src/utils/functions/README.md');
        const readme = readFileSync(readmePath, 'utf-8');
        const functionNames = getRegisteredFunctionNames();

        for (const functionName of functionNames) {
            expect(readme).toContain(functionName);
        }
    });
});
