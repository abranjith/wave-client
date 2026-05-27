/**
 * Validation Engine for Wave Client
 * Evaluates validation rules against HTTP responses.
 */

import { JSONPath } from 'jsonpath-plus';
import Ajv from 'ajv';
import type {
    ValidationRule,
    ValidationResult,
    ValidationRuleResult,
    RequestValidation,
    StatusValidationRule,
    HeaderValidationRule,
    BodyValidationRule,
    TimeValidationRule,
    GlobalValidationRule,
    ResponseData
} from '../types';

// Module-level Ajv instance — instantiated once and reused for performance.
// allErrors: true collects all validation errors, not just the first.
const ajv = new Ajv({ allErrors: true });

// Type guards for validation rules
function isStatusRule(rule: ValidationRule): rule is StatusValidationRule {
    return rule.category === 'status';
}

function isHeaderRule(rule: ValidationRule): rule is HeaderValidationRule {
    return rule.category === 'header';
}

function isBodyRule(rule: ValidationRule): rule is BodyValidationRule {
    return rule.category === 'body';
}

function isTimeRule(rule: ValidationRule): rule is TimeValidationRule {
    return rule.category === 'time';
}

function createEmptyValidationResult(): ValidationResult {
    return {
        enabled: false,
        totalRules: 0,
        passedRules: 0,
        failedRules: 0,
        allPassed: true,
        results: [],
        executedAt: new Date().toISOString()
    };
}

// ============================================================================
// Global Rule Conversion Helper
// ============================================================================

/**
 * Converts a GlobalValidationRule back to a ValidationRule for processing
 * Note: This is duplicated from createValidationRulesSlice to avoid circular deps
 */
function globalRuleToValidationRule(globalRule: GlobalValidationRule): ValidationRule {
    const baseProps = {
        id: globalRule.id,
        name: globalRule.name,
        description: globalRule.description,
        enabled: globalRule.enabled
    };
    
    switch (globalRule.category) {
        case 'status':
            return {
                ...baseProps,
                category: 'status' as const,
                operator: globalRule.operator as any,
                value: globalRule.value as number,
                value2: globalRule.value2,
                values: globalRule.values as number[]
            };
        case 'header':
            return {
                ...baseProps,
                category: 'header' as const,
                headerName: globalRule.headerName || '',
                operator: globalRule.operator as any,
                value: globalRule.value as string,
                values: globalRule.values as string[],
                caseSensitive: globalRule.caseSensitive
            };
        case 'body':
            return {
                ...baseProps,
                category: 'body' as const,
                operator: globalRule.operator as any,
                value: globalRule.value as string,
                jsonPath: globalRule.jsonPath,
                caseSensitive: globalRule.caseSensitive
            };
        case 'time':
            return {
                ...baseProps,
                category: 'time' as const,
                operator: globalRule.operator as any,
                value: globalRule.value as number,
                value2: globalRule.value2
            };
        default:
            // This shouldn't happen, but provide a fallback
            return {
                ...baseProps,
                category: 'status' as const,
                operator: 'equals' as any,
                value: 200
            };
    }
}

// ============================================================================
// Environment Variable Resolution
// ============================================================================

/**
 * Resolves environment variables in a string value
 * Handles {{variableName}} syntax
 */
function resolveEnvVariables(value: string, envVars: Map<string, string>): string {
    if (!value || typeof value !== 'string') {
        return value;
    }

    return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
        const trimmedName = varName.trim();
        return envVars.get(trimmedName) ?? match;
    });
}

/**
 * Resolves environment variables in numeric values (when stored as strings)
 */
function resolveNumericValue(value: number | string, envVars: Map<string, string>): number {
    if (typeof value === 'number') {
        return value;
    }
    const resolved = resolveEnvVariables(String(value), envVars);
    const parsed = parseFloat(resolved);
    return isNaN(parsed) ? 0 : parsed;
}

// ============================================================================
// Operator Implementations
// ============================================================================

/**
 * Evaluates numeric comparison operations
 */
function evaluateNumericOperator(
    actual: number,
    operator: string,
    value: number,
    value2?: number,
    values?: number[]
): boolean {
    switch (operator) {
        case 'equals':
            return actual === value;
        case 'not_equals':
            return actual !== value;
        case 'greater_than':
            return actual > value;
        case 'greater_than_or_equal':
            return actual >= value;
        case 'less_than':
            return actual < value;
        case 'less_than_or_equal':
            return actual <= value;
        case 'between':
            return value2 !== undefined && actual >= value && actual <= value2;
        case 'in':
            return values !== undefined && values.includes(actual);
        case 'not_in':
            return values !== undefined && !values.includes(actual);
        default:
            return false;
    }
}

/**
 * Evaluates status code specific operations (includes numeric + status-specific)
 */
function evaluateStatusOperator(
    actual: number,
    operator: string,
    value: number,
    value2?: number,
    values?: number[]
): boolean {
    // Handle status-specific operators
    switch (operator) {
        case 'is_success':
            return actual >= 200 && actual < 300;
        case 'is_not_success':
            return actual < 200 || actual >= 300;
        default:
            // Delegate to numeric operator for standard comparisons
            return evaluateNumericOperator(actual, operator, value, value2, values);
    }
}

/**
 * Evaluates string comparison operations
 */
function evaluateStringOperator(
    actual: string,
    operator: string,
    expected: string,
    values?: string[],
    caseSensitive: boolean = false
): boolean {
    const normalizedActual = caseSensitive ? actual : actual.toLowerCase();
    const normalizedExpected = caseSensitive ? expected : expected.toLowerCase();
    const normalizedValues = values?.map(v => caseSensitive ? v : v.toLowerCase());

    switch (operator) {
        case 'equals':
            return normalizedActual === normalizedExpected;
        case 'not_equals':
            return normalizedActual !== normalizedExpected;
        case 'contains':
            return normalizedActual.includes(normalizedExpected);
        case 'not_contains':
            return !normalizedActual.includes(normalizedExpected);
        case 'starts_with':
            return normalizedActual.startsWith(normalizedExpected);
        case 'ends_with':
            return normalizedActual.endsWith(normalizedExpected);
        case 'matches_regex':
            try {
                const regex = new RegExp(expected, caseSensitive ? '' : 'i');
                return regex.test(actual);
            } catch {
                return false;
            }
        case 'in':
            return normalizedValues !== undefined && normalizedValues.includes(normalizedActual);
        case 'not_in':
            return normalizedValues !== undefined && !normalizedValues.includes(normalizedActual);
        default:
            return false;
    }
}

// ============================================================================
// Rule Evaluators
// ============================================================================

/**
 * Evaluates a status code validation rule
 */
function evaluateStatusRule(
    rule: StatusValidationRule,
    response: ResponseData,
    envVars: Map<string, string>
): ValidationRuleResult {
    const actualStatus = response.status;
    const expectedValue = resolveNumericValue(rule.value, envVars);
    const expectedValue2 = rule.value2 !== undefined ? resolveNumericValue(rule.value2, envVars) : undefined;
    const expectedValues = rule.values?.map(v => resolveNumericValue(v, envVars));

    const passed = evaluateStatusOperator(
        actualStatus,
        rule.operator,
        expectedValue,
        expectedValue2,
        expectedValues
    );

    let expectedStr: string;
    switch (rule.operator) {
        case 'between':
            expectedStr = `${expectedValue} - ${expectedValue2}`;
            break;
        case 'in':
        case 'not_in':
            expectedStr = `[${expectedValues?.join(', ')}]`;
            break;
        case 'is_success':
            expectedStr = '2xx (200-299)';
            break;
        case 'is_not_success':
            expectedStr = 'not 2xx';
            break;
        default:
            expectedStr = String(expectedValue);
    }

    return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: 'status',
        passed,
        message: passed
            ? `Status ${rule.operator.replace(/_/g, ' ')} ${expectedStr}`
            : `Expected status ${rule.operator.replace(/_/g, ' ')} ${expectedStr}, got ${actualStatus}`,
        expected: expectedStr,
        actual: String(actualStatus)
    };
}

/**
 * Evaluates a header validation rule
 */
function evaluateHeaderRule(
    rule: HeaderValidationRule,
    response: ResponseData,
    envVars: Map<string, string>
): ValidationRuleResult {
    const headerName = resolveEnvVariables(rule.headerName, envVars);
    const expectedValue = rule.value ? resolveEnvVariables(rule.value, envVars) : '';
    const expectedValues = rule.values?.map(v => resolveEnvVariables(v, envVars));
    const caseSensitive = rule.caseSensitive ?? false;

    // Find header (case-insensitive header name lookup)
    const headerKey = Object.keys(response.headers).find(
        key => key.toLowerCase() === headerName.toLowerCase()
    );
    const actualValue = headerKey ? response.headers[headerKey] : undefined;

    let passed: boolean;
    let message: string;

    if (rule.operator === 'exists') {
        passed = actualValue !== undefined;
        message = passed
            ? `Header '${headerName}' exists`
            : `Header '${headerName}' does not exist`;
    } else if (rule.operator === 'not_exists') {
        passed = actualValue === undefined;
        message = passed
            ? `Header '${headerName}' does not exist`
            : `Header '${headerName}' exists but should not`;
    } else if (actualValue === undefined) {
        passed = false;
        message = `Header '${headerName}' does not exist`;
    } else {
        passed = evaluateStringOperator(
            actualValue,
            rule.operator,
            expectedValue,
            expectedValues,
            caseSensitive
        );

        let expectedStr = rule.operator === 'in' || rule.operator === 'not_in'
            ? `[${expectedValues?.join(', ')}]`
            : expectedValue;

        message = passed
            ? `Header '${headerName}' ${rule.operator.replace(/_/g, ' ')} '${expectedStr}'`
            : `Expected header '${headerName}' ${rule.operator.replace(/_/g, ' ')} '${expectedStr}', got '${actualValue}'`;
    }

    return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: 'header',
        passed,
        message,
        expected: expectedValue || (rule.operator === 'exists' ? 'exists' : 'not exists'),
        actual: actualValue ?? 'undefined'
    };
}

/**
 * Evaluates a JSONPath expression against a JSON response body.
 * Uses jsonpath-plus for full JSONPath spec support including recursive
 * descent, wildcards, filter expressions, and array slicing.
 *
 * Security: eval is set to false to block script injection via crafted
 * JSONPath filter expressions (equivalent to `preventEval: true` in older versions).
 *
 * When multiple results are returned (e.g., wildcards), the first result
 * is used for scalar comparisons (json_path_equals, json_path_contains).
 *
 * @param body - The raw response body string (must be valid JSON)
 * @param jsonPath - The JSONPath expression (e.g., "$.data.users[0].id")
 * @returns Object with found flag, matched value(s), and optional error
 */
function evaluateJsonPath(body: string, jsonPath: string): { value: unknown; found: boolean; error?: string } {
    try {
        const json: unknown = JSON.parse(body);
        const results = JSONPath({ path: jsonPath, json: json as object, eval: false });
        const found = Array.isArray(results) && results.length > 0;
        // Return the first result for scalar comparisons; full array is available via results
        return { value: found ? results[0] : undefined, found };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { value: undefined, found: false, error: message };
    }
}

/**
 * Validates a JSON response body against a JSON Schema string.
 * Uses ajv for full JSON Schema validation (draft-07 compatible by default).
 *
 * The allErrors flag on the module-level ajv instance collects all validation
 * errors rather than stopping at the first, providing richer error messages.
 *
 * @param body - Raw JSON response body string
 * @param schema - JSON Schema as a string (will be parsed internally)
 * @returns Object with `valid` flag and `error` message if validation fails
 */
function validateJsonSchema(body: string, schema: string): { valid: boolean; error?: string } {
    try {
        const parsedBody: unknown = JSON.parse(body);
        const parsedSchema: unknown = JSON.parse(schema);

        const validate = ajv.compile(parsedSchema as object);
        const valid = validate(parsedBody) as boolean;

        if (!valid && validate.errors) {
            // Collect all errors into a readable summary
            const errorMessages = validate.errors
                .map(e => `${e.instancePath || '(root)'} ${e.message}`)
                .join('; ');
            return { valid: false, error: errorMessages };
        }

        return { valid: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { valid: false, error: message };
    }
}

/**
 * Returns true only for JSON objects (not arrays or null).
 */
function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a JSON string and returns the value only when it is a JSON object.
 */
function parseJsonObject(value: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(value);
        return isJsonObject(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Deep equality for JSON values.
 */
function areJsonValuesEqual(actual: unknown, expected: unknown): boolean {
    if (Array.isArray(actual) && Array.isArray(expected)) {
        return actual.length === expected.length
            && actual.every((item, index) => areJsonValuesEqual(item, expected[index]));
    }

    if (isJsonObject(actual) && isJsonObject(expected)) {
        const actualKeys = Object.keys(actual);
        const expectedKeys = Object.keys(expected);

        if (actualKeys.length !== expectedKeys.length) {
            return false;
        }

        return expectedKeys.every((key) => (
            key in actual
            && areJsonValuesEqual(actual[key], expected[key])
        ));
    }

    return Object.is(actual, expected);
}

/**
 * Deep subset check: every expected property/value must exist in actual.
 */
function doesJsonContainExpectedValues(actual: unknown, expected: unknown): boolean {
    if (isJsonObject(expected)) {
        if (!isJsonObject(actual)) {
            return false;
        }

        return Object.keys(expected).every((key) => (
            key in actual
            && doesJsonContainExpectedValues(actual[key], expected[key])
        ));
    }

    if (Array.isArray(expected)) {
        return Array.isArray(actual) && areJsonValuesEqual(actual, expected);
    }

    return areJsonValuesEqual(actual, expected);
}

/**
 * Property-shape check used by JSON not_contains.
 * Returns true when all expected property paths are present in actual.
 */
function doesJsonContainExpectedProperties(actual: unknown, expected: unknown): boolean {
    if (!isJsonObject(expected) || !isJsonObject(actual)) {
        return false;
    }

    return Object.keys(expected).every((key) => {
        if (!(key in actual)) {
            return false;
        }

        const expectedValue = expected[key];
        const actualValue = actual[key];

        if (isJsonObject(expectedValue)) {
            return doesJsonContainExpectedProperties(actualValue, expectedValue);
        }

        if (Array.isArray(expectedValue)) {
            return Array.isArray(actualValue);
        }

        return true;
    });
}

/**
 * Evaluates a body validation rule
 */
function evaluateBodyRule(
    rule: BodyValidationRule,
    response: ResponseData,
    envVars: Map<string, string>
): ValidationRuleResult {
    let body = response.body || '';

    // Decode base64 body if needed
    if (response.isEncoded && body) {
        try {
            body = Buffer.from(body, 'base64').toString('utf-8');
        } catch (e) {
            // Keep original body if decoding fails
        }
    }

    const expectedValue = rule.value ? resolveEnvVariables(rule.value, envVars) : '';
    const jsonPath = rule.jsonPath ? resolveEnvVariables(rule.jsonPath, envVars) : '';
    const caseSensitive = rule.caseSensitive ?? false;
    const actualJsonObject = parseJsonObject(body);
    const expectedJsonObject = parseJsonObject(expectedValue);

    let passed: boolean;
    let message: string;
    let actual: string = body.length > 100 ? body.substring(0, 100) + '...' : body;

    switch (rule.operator) {
        case 'is_json':
            try {
                JSON.parse(body);
                passed = true;
                message = 'Response body is valid JSON';
            } catch {
                passed = false;
                message = 'Response body is not valid JSON';
            }
            break;

        case 'is_xml':
            passed = body.trim().startsWith('<?xml') || body.trim().startsWith('<');
            message = passed ? 'Response body appears to be XML' : 'Response body is not XML';
            break;

        case 'is_html':
            passed = /<html/i.test(body) || /<!DOCTYPE html/i.test(body);
            message = passed ? 'Response body appears to be HTML' : 'Response body is not HTML';
            break;

        case 'json_path_exists':
            const existsResult = evaluateJsonPath(body, jsonPath);
            passed = existsResult.found;
            actual = existsResult.found ? String(existsResult.value) : 'undefined';
            message = passed
                ? `JSON path '${jsonPath}' exists`
                : existsResult.error
                    ? `JSON path error: ${existsResult.error}`
                    : `JSON path '${jsonPath}' does not exist`;
            break;

        case 'json_path_equals':
            const equalsResult = evaluateJsonPath(body, jsonPath);
            if (equalsResult.error) {
                passed = false;
                message = `JSON path error: ${equalsResult.error}`;
            } else if (!equalsResult.found) {
                passed = false;
                message = `JSON path '${jsonPath}' does not exist`;
            } else {
                const actualStr = String(equalsResult.value);
                passed = caseSensitive
                    ? actualStr === expectedValue
                    : actualStr.toLowerCase() === expectedValue.toLowerCase();
                actual = actualStr;
                message = passed
                    ? `JSON path '${jsonPath}' equals '${expectedValue}'`
                    : `Expected JSON path '${jsonPath}' to equal '${expectedValue}', got '${actualStr}'`;
            }
            break;

        case 'json_path_contains':
            const containsResult = evaluateJsonPath(body, jsonPath);
            if (containsResult.error) {
                passed = false;
                message = `JSON path error: ${containsResult.error}`;
            } else if (!containsResult.found) {
                passed = false;
                message = `JSON path '${jsonPath}' does not exist`;
            } else {
                const actualStr = String(containsResult.value);
                passed = caseSensitive
                    ? actualStr.includes(expectedValue)
                    : actualStr.toLowerCase().includes(expectedValue.toLowerCase());
                actual = actualStr;
                message = passed
                    ? `JSON path '${jsonPath}' contains '${expectedValue}'`
                    : `Expected JSON path '${jsonPath}' to contain '${expectedValue}', got '${actualStr}'`;
            }
            break;

        case 'json_schema_matches':
            const schemaResult = validateJsonSchema(body, expectedValue);
            passed = schemaResult.valid;
            message = passed
                ? 'Response body matches JSON schema'
                : `JSON schema validation failed: ${schemaResult.error}`;
            break;

        case 'equals': {
            if (actualJsonObject && expectedJsonObject) {
                passed = areJsonValuesEqual(actualJsonObject, expectedJsonObject);
                actual = JSON.stringify(actualJsonObject);
                message = passed
                    ? 'JSON body equals expected object'
                    : 'Expected JSON body to equal expected object';
                break;
            }

            passed = evaluateStringOperator(body, rule.operator, expectedValue, undefined, caseSensitive);
            message = passed
                ? `Body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`
                : `Expected body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`;
            break;
        }

        case 'not_equals': {
            if (actualJsonObject && expectedJsonObject) {
                passed = !areJsonValuesEqual(actualJsonObject, expectedJsonObject);
                actual = JSON.stringify(actualJsonObject);
                message = passed
                    ? 'JSON body is not equal to expected object'
                    : 'Expected JSON body to not equal expected object';
                break;
            }

            passed = evaluateStringOperator(body, rule.operator, expectedValue, undefined, caseSensitive);
            message = passed
                ? `Body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`
                : `Expected body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`;
            break;
        }

        case 'contains': {
            if (actualJsonObject && expectedJsonObject) {
                passed = doesJsonContainExpectedValues(actualJsonObject, expectedJsonObject);
                actual = JSON.stringify(actualJsonObject);
                message = passed
                    ? 'JSON body contains expected properties and values'
                    : 'Expected JSON body to contain expected properties and values';
                break;
            }

            passed = evaluateStringOperator(body, rule.operator, expectedValue, undefined, caseSensitive);
            message = passed
                ? `Body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`
                : `Expected body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`;
            break;
        }

        case 'not_contains': {
            if (actualJsonObject && expectedJsonObject) {
                passed = !doesJsonContainExpectedProperties(actualJsonObject, expectedJsonObject);
                actual = JSON.stringify(actualJsonObject);
                message = passed
                    ? 'JSON body does not contain expected properties'
                    : 'Expected JSON body to not contain expected properties';
                break;
            }

            passed = evaluateStringOperator(body, rule.operator, expectedValue, undefined, caseSensitive);
            message = passed
                ? `Body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`
                : `Expected body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`;
            break;
        }

        default:
            // String operators (equals, contains, etc.)
            passed = evaluateStringOperator(body, rule.operator, expectedValue, undefined, caseSensitive);
            message = passed
                ? `Body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`
                : `Expected body ${rule.operator.replace(/_/g, ' ')} '${expectedValue}'`;
    }

    return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: 'body',
        passed,
        message,
        expected: expectedValue || rule.operator,
        actual
    };
}

/**
 * Evaluates a response time validation rule
 */
function evaluateTimeRule(
    rule: TimeValidationRule,
    response: ResponseData,
    envVars: Map<string, string>
): ValidationRuleResult {
    const actualTime = response.elapsedTime;
    const expectedValue = resolveNumericValue(rule.value, envVars);
    const expectedValue2 = rule.value2 !== undefined ? resolveNumericValue(rule.value2, envVars) : undefined;

    const passed = evaluateNumericOperator(
        actualTime,
        rule.operator,
        expectedValue,
        expectedValue2
    );

    let expectedStr: string;
    switch (rule.operator) {
        case 'between':
            expectedStr = `${expectedValue}ms - ${expectedValue2}ms`;
            break;
        default:
            expectedStr = `${expectedValue}ms`;
    }

    return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: 'time',
        passed,
        message: passed
            ? `Response time ${rule.operator.replace(/_/g, ' ')} ${expectedStr}`
            : `Expected response time ${rule.operator.replace(/_/g, ' ')} ${expectedStr}, got ${actualTime}ms`,
        expected: expectedStr,
        actual: `${actualTime}ms`
    };
}

/**
 * Evaluates a single validation rule against a response
 */
function evaluateRule(
    rule: ValidationRule,
    response: ResponseData,
    envVars: Map<string, string>
): ValidationRuleResult {
    if (!rule.enabled) {
        return {
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            passed: true,
            message: 'Rule is disabled'
        };
    }

    try {
        if (isStatusRule(rule)) {
            return evaluateStatusRule(rule, response, envVars);
        } else if (isHeaderRule(rule)) {
            return evaluateHeaderRule(rule, response, envVars);
        } else if (isBodyRule(rule)) {
            return evaluateBodyRule(rule, response, envVars);
        } else if (isTimeRule(rule)) {
            return evaluateTimeRule(rule, response, envVars);
        }

        // Fallback for unknown category (shouldn't happen with proper types)
        const unknownRule = rule as ValidationRule;
        return {
            ruleId: unknownRule.id,
            ruleName: unknownRule.name,
            category: unknownRule.category,
            passed: false,
            message: `Unknown rule category: ${unknownRule.category}`,
            error: 'Unknown rule category'
        };
    } catch (error: any) {
        return {
            ruleId: rule.id,
            ruleName: rule.name,
            category: rule.category,
            passed: false,
            message: `Rule evaluation failed: ${error.message}`,
            error: error.message
        };
    }
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Executes validation rules against an HTTP response
 * 
 * @param validation - The request validation configuration
 * @param response - The HTTP response to validate
 * @param globalRules - Map of global rules by ID for resolving references
 * @param envVars - Environment variables for value resolution
 * @returns ValidationResult with all rule results
 */
export function executeValidation(
    validation: RequestValidation | undefined,
    response: ResponseData,
    globalRules: Map<string, GlobalValidationRule>,
    envVars: Map<string, string>
): ValidationResult {
    // Return empty result if validation is not configured or disabled
    if (!validation || !validation.enabled || !validation.rules || validation.rules.length === 0) {
        return createEmptyValidationResult();
    }

    const results: ValidationRuleResult[] = [];

    for (const ruleRef of validation.rules) {
        let rule: ValidationRule | undefined;

        // Resolve the rule - either inline or from global store
        if (ruleRef.rule) {
            rule = ruleRef.rule;
        } else if (ruleRef.ruleId) {
            const globalRule = globalRules.get(ruleRef.ruleId);
            if (globalRule) {
                // Convert GlobalValidationRule to ValidationRule for evaluation
                rule = globalRuleToValidationRule(globalRule);
            } else {
                // Rule reference not found
                results.push({
                    ruleId: ruleRef.ruleId,
                    ruleName: 'Unknown Rule',
                    category: 'status',
                    passed: false,
                    message: `Global rule with ID '${ruleRef.ruleId}' not found`,
                    error: 'Rule not found'
                });
                continue;
            }
        }

        if (rule) {
            const result = evaluateRule(rule, response, envVars);
            results.push(result);
        }
    }

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.filter(r => !r.passed).length;

    return {
        enabled: true,
        totalRules: results.length,
        passedRules: passedCount,
        failedRules: failedCount,
        allPassed: failedCount === 0,
        results,
        executedAt: new Date().toISOString()
    };
}

/**
 * Validates whether a string is a well-formed JSON Schema.
 * Intended for UI-side pre-validation — call this before saving a rule
 * to give the user immediate feedback if their schema is malformed.
 *
 * Checks two things:
 *   1. The string is valid JSON (parses without error).
 *   2. The parsed JSON is a valid JSON Schema (ajv can compile it).
 *
 * Note: An empty string is treated as invalid.
 *
 * @param schemaString - The user-provided JSON Schema string to validate
 * @returns Object with `valid` flag and `errors` array of human-readable messages
 *
 * @example
 * validateJsonSchemaString('{"type": "object"}') // { valid: true }
 * validateJsonSchemaString('not json')            // { valid: false, errors: ['Invalid JSON: ...'] }
 * validateJsonSchemaString('{"type": "bad"}')     // { valid: false, errors: ['Invalid JSON Schema: ...'] }
 */
export function validateJsonSchemaString(schemaString: string): { valid: boolean; errors?: string[] } {
    if (!schemaString || !schemaString.trim()) {
        return { valid: false, errors: ['Schema cannot be empty'] };
    }

    let parsedSchema: unknown;
    try {
        parsedSchema = JSON.parse(schemaString);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { valid: false, errors: [`Invalid JSON: ${message}`] };
    }

    try {
        // Attempt to compile the schema — ajv will throw if the schema itself is invalid
        ajv.compile(parsedSchema as object);
        return { valid: true };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return { valid: false, errors: [`Invalid JSON Schema: ${message}`] };
    }
}

/**
 * Converts an array of global rules to a Map for efficient lookup
 */
export function createGlobalRulesMap(rules: GlobalValidationRule[]): Map<string, GlobalValidationRule> {
    return new Map(rules.map(rule => [rule.id, rule]));
}

/**
 * Converts an object of environment variables to a Map
 */
export function createEnvVarsMap(envVars: Record<string, string> | undefined): Map<string, string> {
    if (!envVars) {
        return new Map();
    }
    return new Map(Object.entries(envVars));
}
