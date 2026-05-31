/**
 * Error categories returned while validating function placeholders.
 */
export type FnValidationErrorCode =
    | 'malformed_placeholder'
    | 'unknown_function'
    | 'unknown_argument'
    | 'missing_required_argument'
    | 'invalid_argument_value';

/**
 * Structured validation error emitted for function placeholders.
 */
export interface FnValidationError {
    placeholder: string;
    code: FnValidationErrorCode;
    functionName?: string;
    argName?: string;
    message: string;
}

/**
 * Argument declaration for a dynamic function.
 */
export interface FnArgSpec {
    name: string;
    description: string;
    required?: boolean;
    defaultValue?: string;
    validate?: (value: string, args: Readonly<Record<string, string>>) => string | null;
}

/**
 * A dynamic function definition registered in the function registry.
 */
export interface FnDefinition {
    name: string;
    description: string;
    args: readonly FnArgSpec[];
    generate: (args: Readonly<Record<string, string>>) => string;
}

/**
 * Parsed representation of a function placeholder.
 */
export interface FnParseResult {
    placeholder: string;
    functionName: string | null;
    args: Record<string, string>;
    errors: FnValidationError[];
}
