import { getFunction } from './registry';
import type { FnParseResult, FnValidationError } from './types';

const ARGUMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DISALLOWED_VALUE_DELIMITERS = [',', '(', ')', '}'];

function createMalformedError(placeholder: string, message: string): FnValidationError {
    return {
        placeholder,
        code: 'malformed_placeholder',
        message,
    };
}

/**
 * Parses a function placeholder inner text into function name + named arguments.
 *
 * Supported shapes:
 * - _fn_name
 * - _fn_name(key=value, key=value)
 */
export function parseFunctionPlaceholder(innerText: string): FnParseResult {
    const placeholder = innerText.trim();
    const errors: FnValidationError[] = [];

    if (!placeholder) {
        errors.push(createMalformedError(placeholder, 'Function placeholder is empty.'));
        return {
            placeholder,
            functionName: null,
            args: {},
            errors,
        };
    }

    const openParenIndex = placeholder.indexOf('(');
    const closeParenIndex = placeholder.lastIndexOf(')');

    let functionName: string;
    let argsBlock: string;

    if (openParenIndex === -1 && closeParenIndex === -1) {
        functionName = placeholder;
        argsBlock = '';
    } else if (openParenIndex === -1 || closeParenIndex === -1) {
        errors.push(
            createMalformedError(placeholder, 'Function arguments must use balanced parentheses.')
        );
        return {
            placeholder,
            functionName: null,
            args: {},
            errors,
        };
    } else if (closeParenIndex < openParenIndex) {
        errors.push(
            createMalformedError(placeholder, 'Function placeholder has malformed parentheses.')
        );
        return {
            placeholder,
            functionName: null,
            args: {},
            errors,
        };
    } else {
        const trailing = placeholder.slice(closeParenIndex + 1).trim();
        if (trailing.length > 0) {
            errors.push(
                createMalformedError(placeholder, 'Unexpected trailing content after function arguments.')
            );
            return {
                placeholder,
                functionName: null,
                args: {},
                errors,
            };
        }

        functionName = placeholder.slice(0, openParenIndex).trim();
        argsBlock = placeholder.slice(openParenIndex + 1, closeParenIndex).trim();
    }

    if (!functionName) {
        errors.push(createMalformedError(placeholder, 'Function name is required.'));
        return {
            placeholder,
            functionName: null,
            args: {},
            errors,
        };
    }

    const normalizedFunctionName = functionName.toLowerCase();
    const parsedArgs: Record<string, string> = {};

    if (argsBlock.length > 0) {
        const segments = argsBlock.split(',');

        for (const rawSegment of segments) {
            const segment = rawSegment.trim();

            if (!segment) {
                errors.push(
                    createMalformedError(placeholder, 'Argument list contains an empty segment.')
                );
                continue;
            }

            const equalsIndex = segment.indexOf('=');
            if (equalsIndex <= 0 || equalsIndex === segment.length - 1) {
                errors.push(
                    createMalformedError(
                        placeholder,
                        `Argument \"${segment}\" must use key=value syntax.`
                    )
                );
                continue;
            }

            const key = segment.slice(0, equalsIndex).trim().toLowerCase();
            const value = segment.slice(equalsIndex + 1).trim();

            if (!ARGUMENT_NAME_PATTERN.test(key)) {
                errors.push(
                    createMalformedError(
                        placeholder,
                        `Argument name \"${key}\" is invalid. Use letters, numbers, or underscores.`
                    )
                );
                continue;
            }

            if (!value) {
                errors.push(
                    createMalformedError(placeholder, `Argument \"${key}\" has an empty value.`)
                );
                continue;
            }

            const invalidDelimiter = DISALLOWED_VALUE_DELIMITERS.find((delimiter) =>
                value.includes(delimiter)
            );

            if (invalidDelimiter) {
                errors.push({
                    placeholder,
                    functionName: normalizedFunctionName,
                    argName: key,
                    code: 'invalid_argument_value',
                    message: `Argument \"${key}\" contains unsupported delimiter \"${invalidDelimiter}\".`,
                });
                continue;
            }

            if (Object.prototype.hasOwnProperty.call(parsedArgs, key)) {
                errors.push({
                    placeholder,
                    functionName: normalizedFunctionName,
                    argName: key,
                    code: 'invalid_argument_value',
                    message: `Argument \"${key}\" is provided more than once.`,
                });
                continue;
            }

            parsedArgs[key] = value;
        }
    }

    const definition = getFunction(normalizedFunctionName);
    if (!definition) {
        errors.push({
            placeholder,
            functionName: normalizedFunctionName,
            code: 'unknown_function',
            message: `Unknown function: ${normalizedFunctionName}.`,
        });
    } else {
        const knownArgNames = new Set(definition.args.map((arg) => arg.name.toLowerCase()));

        for (const argName of Object.keys(parsedArgs)) {
            if (!knownArgNames.has(argName)) {
                errors.push({
                    placeholder,
                    functionName: normalizedFunctionName,
                    argName,
                    code: 'unknown_argument',
                    message: `Unknown argument \"${argName}\" for function ${normalizedFunctionName}.`,
                });
            }
        }
    }

    return {
        placeholder,
        functionName: normalizedFunctionName,
        args: parsedArgs,
        errors,
    };
}
