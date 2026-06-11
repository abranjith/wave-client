/**
 * Wave Environment Schema (v0.0.1)
 *
 * Formal Zod schema for the persisted shape of a Wave `Environment`.
 * See `docs/schemas.md` for the field-by-field reference and version history.
 *
 * Validation semantics mirror the collection schema: **validate-only** — on
 * success the original input object is returned (typed as `Environment`) so
 * unknown extra fields survive load/save round-trips.
 */

import { z } from 'zod';

import type { Environment } from '../types/collection';
import { ok, err } from '../utils/result';
import type { Result } from '../utils/result';

/**
 * Current Wave environment schema version.
 *
 * Tracks the persisted environment file shape independently of package
 * versions. Bump only on persisted-shape changes, with a migration note
 * in `docs/schemas.md`.
 */
export const CURRENT_ENVIRONMENT_SCHEMA_VERSION = '0.0.1';

/** Schema for a single environment variable (`EnvironmentVariable`). */
const environmentVariableSchema = z.object({
    key: z.string(),
    value: z.string(),
    type: z.enum(['default', 'secret']),
    notes: z.string().optional(),
    enabled: z.boolean(),
});

/**
 * The full persisted Wave environment shape (v0.0.1).
 *
 * `version` is required by the schema — loaders/importers stamp
 * {@link CURRENT_ENVIRONMENT_SCHEMA_VERSION} on legacy data **before**
 * validating. `filename` is runtime-only and tolerated when present.
 */
export const WaveEnvironmentSchema = z.object({
    id: z.string(),
    name: z.string().min(1, 'Environment name must not be empty'),
    version: z.string({ required_error: 'version is required (stamp before validating)' }),
    values: z.array(environmentVariableSchema),
    filename: z.string().optional(),
});

/** Maximum number of issues included in a validation error message. */
const MAX_REPORTED_ISSUES = 5;

/**
 * Formats Zod issues into a single readable `path: message` list.
 */
function formatZodError(error: z.ZodError): string {
    const issues = error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
    });
    const suffix = error.issues.length > MAX_REPORTED_ISSUES
        ? `; … and ${error.issues.length - MAX_REPORTED_ISSUES} more issue(s)`
        : '';
    return issues.join('; ') + suffix;
}

/**
 * Validates unknown data against the Wave environment schema (v0.0.1).
 *
 * Validate-only semantics: on success the **original input** is returned
 * (typed as `Environment`) so unknown extra fields are preserved.
 *
 * @param data - Untrusted input (parsed JSON from a file or import).
 * @returns `ok(environment)` when valid; `err(message)` listing up to the
 *          first {@link MAX_REPORTED_ISSUES} issues as `path: message`.
 *
 * @example
 * ```typescript
 * const result = validateWaveEnvironment(JSON.parse(fileContent));
 * if (result.isOk) {
 *   const environment = result.value;
 * } else {
 *   console.error(`Invalid environment: ${result.error}`);
 * }
 * ```
 */
export function validateWaveEnvironment(data: unknown): Result<Environment, string> {
    const parsed = WaveEnvironmentSchema.safeParse(data);
    if (!parsed.success) {
        return err(formatZodError(parsed.error));
    }
    return ok(data as Environment);
}
