import type { FnDefinition } from './types';

const FUNCTION_REGISTRY = new Map<string, FnDefinition>();

/**
 * Registers a function definition by name (case-insensitive).
 * Throws if the function name is already registered.
 */
export function registerFunction(definition: FnDefinition): void {
    const normalizedName = definition.name.trim().toLowerCase();
    if (!normalizedName) {
        throw new Error('Function name cannot be empty.');
    }

    if (FUNCTION_REGISTRY.has(normalizedName)) {
        throw new Error(`Function \"${normalizedName}\" is already registered.`);
    }

    FUNCTION_REGISTRY.set(normalizedName, {
        ...definition,
        name: normalizedName,
    });
}

/**
 * Returns a registered function by name (case-insensitive).
 */
export function getFunction(name: string): FnDefinition | undefined {
    return FUNCTION_REGISTRY.get(name.trim().toLowerCase());
}

/**
 * Returns all registered function definitions.
 */
export function getAllFunctions(): FnDefinition[] {
    return Array.from(FUNCTION_REGISTRY.values());
}

/**
 * Clears the registry for tests.
 */
export function clearFunctionRegistryForTests(): void {
    FUNCTION_REGISTRY.clear();
}
