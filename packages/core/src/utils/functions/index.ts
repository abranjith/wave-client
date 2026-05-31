import { getAddressFunctionDefinitions } from './generators/address';
import { getContactFunctionDefinitions } from './generators/contact';
import { getDatetimeFunctionDefinitions } from './generators/datetime';
import { getGenericFunctionDefinitions } from './generators/generic';
import { getPersonFunctionDefinitions } from './generators/person';
import { parseFunctionPlaceholder } from './parser';
import { getAllFunctions, getFunction, registerFunction } from './registry';
import type { FnDefinition, FnValidationError } from './types';

export type {
    FnArgSpec,
    FnDefinition,
    FnParseResult,
    FnValidationError,
    FnValidationErrorCode,
} from './types';

const FUNCTION_PLACEHOLDER_REGEX = /\{\{([^}]+)\}\}/g;
const FUNCTION_PREFIX = '_fn_';

const BUILT_IN_DEFINITIONS: FnDefinition[] = [
    ...getGenericFunctionDefinitions(),
    ...getDatetimeFunctionDefinitions(),
    ...getPersonFunctionDefinitions(),
    ...getAddressFunctionDefinitions(),
    ...getContactFunctionDefinitions(),
];

function ensureBuiltInFunctionsRegistered(): void {
    const existingNames = new Set(getAllFunctions().map((definition) => definition.name));

    for (const definition of BUILT_IN_DEFINITIONS) {
        if (!existingNames.has(definition.name)) {
            registerFunction(definition);
        }
    }
}

function buildResolvedArgs(
    definition: FnDefinition,
    parsedArgs: Readonly<Record<string, string>>
): Record<string, string> {
    const withDefaults: Record<string, string> = {};

    for (const arg of definition.args) {
        if (arg.defaultValue !== undefined) {
            withDefaults[arg.name] = arg.defaultValue;
        }
    }

    for (const [key, value] of Object.entries(parsedArgs)) {
        withDefaults[key] = value;
    }

    return withDefaults;
}

function validateAgainstDefinition(
    placeholder: string,
    definition: FnDefinition,
    args: Readonly<Record<string, string>>
): FnValidationError[] {
    const errors: FnValidationError[] = [];

    for (const arg of definition.args) {
        const value = args[arg.name];

        if (arg.required && (value === undefined || value.trim().length === 0)) {
            errors.push({
                placeholder,
                functionName: definition.name,
                argName: arg.name,
                code: 'missing_required_argument',
                message: `Missing required argument \"${arg.name}\".`,
            });
            continue;
        }

        if (value === undefined) {
            continue;
        }

        if (!arg.validate) {
            continue;
        }

        const validationMessage = arg.validate(value, args);
        if (validationMessage) {
            errors.push({
                placeholder,
                functionName: definition.name,
                argName: arg.name,
                code: 'invalid_argument_value',
                message: validationMessage,
            });
        }
    }

    return errors;
}

/**
 * Checks if a placeholder uses the reserved function prefix.
 */
export function isFunctionPlaceholder(innerText: string): boolean {
    return innerText.trim().toLowerCase().startsWith(FUNCTION_PREFIX);
}

/**
 * Resolves a single function placeholder inner text.
 * Returns null for unknown functions or invalid arguments.
 */
export function resolveFunctionPlaceholder(innerText: string): { resolved: string } | null {
    ensureBuiltInFunctionsRegistered();

    if (!isFunctionPlaceholder(innerText)) {
        return null;
    }

    const parsed = parseFunctionPlaceholder(innerText);
    if (parsed.errors.length > 0 || !parsed.functionName) {
        return null;
    }

    const definition = getFunction(parsed.functionName);
    if (!definition) {
        return null;
    }

    const resolvedArgs = buildResolvedArgs(definition, parsed.args);
    const definitionErrors = validateAgainstDefinition(parsed.placeholder, definition, resolvedArgs);
    if (definitionErrors.length > 0) {
        return null;
    }

    return {
        resolved: definition.generate(resolvedArgs),
    };
}

/**
 * Validates all function placeholders found in a template string.
 */
export function validateFunctionTemplate(text: string): FnValidationError[] {
    ensureBuiltInFunctionsRegistered();

    const errors: FnValidationError[] = [];
    const regex = new RegExp(FUNCTION_PLACEHOLDER_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const innerText = match[1].trim();

        if (!isFunctionPlaceholder(innerText)) {
            continue;
        }

        const parsed = parseFunctionPlaceholder(innerText);
        errors.push(...parsed.errors);

        if (parsed.errors.length > 0 || !parsed.functionName) {
            continue;
        }

        const definition = getFunction(parsed.functionName);
        if (!definition) {
            continue;
        }

        const resolvedArgs = buildResolvedArgs(definition, parsed.args);
        errors.push(...validateAgainstDefinition(parsed.placeholder, definition, resolvedArgs));
    }

    return errors;
}

/**
 * Returns built-in function names that are currently registered.
 */
export function getRegisteredFunctionNames(): string[] {
    ensureBuiltInFunctionsRegistered();
    return getAllFunctions().map((definition) => definition.name);
}
