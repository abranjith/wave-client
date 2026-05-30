import { JSONPath } from 'jsonpath-plus';

export interface JsonPathEvaluationResult {
    value: unknown;
    values: unknown[];
    found: boolean;
    error?: string;
}

/**
 * Evaluates a JSONPath expression against a raw JSON response body.
 *
 * Uses `jsonpath-plus` with the `safe` evaluator to support full JSONPath
 * filters while keeping expression evaluation sandboxed.
 *
 * @param body - Raw response body string (must be valid JSON for path evaluation)
 * @param path - JSONPath expression (for example, `$.data.users[0].id`)
 * @returns First matched value, all values, found flag, and optional error
 *
 * @example
 * evaluateJsonPath('{"data":{"id":123}}', '$.data.id');
 * // { value: 123, values: [123], found: true }
 */
export function evaluateJsonPath(body: string, path: string): JsonPathEvaluationResult {
    try {
        const parsedJson: unknown = JSON.parse(body);
        const json = parsedJson as null | boolean | number | string | object | unknown[];

        // Use the safe evaluator to allow JSONPath filters without native eval.
        const rawResults = JSONPath({ path, json, eval: 'safe' });
        const values = Array.isArray(rawResults)
            ? rawResults
            : rawResults === undefined
                ? []
                : [rawResults];
        const found = values.length > 0;

        return {
            value: found ? values[0] : undefined,
            values,
            found,
        };
    } catch (error: unknown) {
        return {
            value: undefined,
            values: [],
            found: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
