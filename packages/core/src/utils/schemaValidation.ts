import Ajv from 'ajv';

/** Module-level singleton — creating an Ajv instance is expensive. */
const ajv = new Ajv({ allErrors: true });

/**
 * Validates that `schemaString` is a parseable JSON string and a valid
 * JSON Schema (draft-07 compatible via ajv v8).
 *
 * Returns `{ valid: true }` on success or `{ valid: false, errors: string[] }`
 * with human-readable error descriptions on failure.
 *
 * Intended for **UI-side pre-validation** of user-provided schema strings
 * before they are persisted as validation rules.
 *
 * Note: This utility is intentionally separate from the identical function
 * in `@wave-client/shared`. Importing from shared would create a circular
 * dependency (shared → core → shared). The logic is the same; ajv is the
 * implementation in both cases.
 */
export function validateJsonSchemaString(schemaString: string): { valid: boolean; errors?: string[] } {
    if (!schemaString || !schemaString.trim()) {
        return { valid: false, errors: ['Schema is required'] };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(schemaString);
    } catch (e) {
        return {
            valid: false,
            errors: [`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`],
        };
    }

    try {
        ajv.compile(parsed as object);
        return { valid: true };
    } catch (e) {
        return {
            valid: false,
            errors: [`Invalid JSON Schema: ${e instanceof Error ? e.message : String(e)}`],
        };
    }
}
