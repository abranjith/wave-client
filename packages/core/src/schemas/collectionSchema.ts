/**
 * Wave Collection Schema (v0.0.1)
 *
 * Formal Zod schema for the persisted shape of a Wave `Collection`.
 * This is the canonical, versioned definition of the collection file format —
 * see `docs/schemas.md` for the field-by-field reference and version history.
 *
 * Validation semantics: the schema is **validate-only**. On success the
 * original input object is returned (typed as `Collection`), not Zod's parsed
 * copy, so unknown extra fields in user files survive load/save round-trips.
 */

import { z } from 'zod';

import type { Collection } from '../types/collection';
import { ok, err } from '../utils/result';
import type { Result } from '../utils/result';

/**
 * Current Wave collection schema version.
 *
 * This version tracks the persisted collection file shape and evolves
 * independently of any package version. Bump it only when the persisted
 * shape changes, and add a migration note to `docs/schemas.md`.
 */
export const CURRENT_COLLECTION_SCHEMA_VERSION = '0.0.1';

/**
 * Schema for a query parameter row (`ParamRow`).
 * `id`/`disabled` are tolerated as absent: the app's own save path
 * (`sanitizeRequestForSave`) persists minimal rows, and the UI repopulates
 * runtime ids on load.
 */
const paramRowSchema = z.object({
    id: z.string().optional(),
    key: z.string(),
    value: z.string(),
    disabled: z.boolean().optional(),
});

/** Schema for an HTTP header row (`HeaderRow`). Same row tolerance as `ParamRow`. */
const headerRowSchema = z.object({
    id: z.string().optional(),
    key: z.string(),
    value: z.string(),
    disabled: z.boolean().optional(),
});

/** Schema for a URL-encoded form field (`FormField`). Same row tolerance as `ParamRow`. */
const formFieldSchema = z.object({
    id: z.string().optional(),
    key: z.string(),
    value: z.string().nullable(),
    disabled: z.boolean().optional(),
});

/** Schema for a file reference used by file/multipart bodies (`FileReference`). */
const fileReferenceSchema = z.object({
    path: z.string(),
    fileName: z.string(),
    contentType: z.string(),
    size: z.number(),
    pathType: z.enum(['absolute', 'relative', 'browser']),
    storageType: z.enum(['local', 'cloud', 'network']),
    fileData: z.string().optional(),
});

/** Schema for a multipart form field (`MultiPartFormField`). Same row tolerance as `ParamRow`. */
const multiPartFormFieldSchema = z.object({
    id: z.string().optional(),
    key: z.string(),
    value: z.union([z.string(), fileReferenceSchema]).nullable(),
    disabled: z.boolean().optional(),
    fieldType: z.enum(['text', 'file']),
});

/** Schema for the parsed URL object form (`CollectionUrl`). */
const collectionUrlSchema = z.object({
    raw: z.string(),
    protocol: z.string().optional(),
    host: z.array(z.string()).optional(),
    path: z.array(z.string()).optional(),
    query: z.array(paramRowSchema).optional(),
});

/** A request URL — either a raw string or a parsed `CollectionUrl` object. */
const urlSchema = z.union([z.string(), collectionUrlSchema]);

/** Discriminated union over `CollectionBody.mode`. */
const collectionBodySchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({
        mode: z.literal('raw'),
        raw: z.string(),
        options: z
            .object({
                raw: z
                    .object({
                        language: z.enum(['json', 'xml', 'html', 'text', 'csv']).optional(),
                    })
                    .optional(),
            })
            .optional(),
    }),
    z.object({ mode: z.literal('urlencoded'), urlencoded: z.array(formFieldSchema) }),
    z.object({ mode: z.literal('formdata'), formdata: z.array(multiPartFormFieldSchema) }),
    z.object({ mode: z.literal('file'), file: fileReferenceSchema.optional() }),
]);

/** Schema for `CollectionReference` (a request's link back to its collection). */
const collectionReferenceSchema = z.object({
    collectionFilename: z.string(),
    collectionName: z.string(),
    itemPath: z.array(z.string()),
});

/**
 * HTTP request shape. `protocol` is optional for backward compatibility —
 * a request without it is treated as HTTP.
 */
const httpRequestSchema = z.object({
    id: z.string(),
    name: z.string(),
    protocol: z.literal('http').optional(),
    method: z.string(),
    url: urlSchema,
    query: z.array(paramRowSchema).optional(),
    header: z.array(headerRowSchema).optional(),
    body: collectionBodySchema.optional(),
    description: z.string().optional(),
    // Validation rules are opaque in schema v0.0.1 — tightening them is a future schema version.
    validation: z.unknown().optional(),
    authId: z.string().optional(),
    sourceRef: collectionReferenceSchema.optional(),
});

/** WebSocket request shape (`protocol: 'ws'`, no method/body). */
const wsRequestSchema = z.object({
    id: z.string(),
    name: z.string(),
    protocol: z.literal('ws'),
    url: urlSchema,
    header: z.array(headerRowSchema).optional(),
    query: z.array(paramRowSchema).optional(),
    description: z.string().optional(),
    authId: z.string().optional(),
    sourceRef: collectionReferenceSchema.optional(),
});

/** Server-Sent Events request shape (`protocol: 'sse'`). */
const sseRequestSchema = z.object({
    id: z.string(),
    name: z.string(),
    protocol: z.literal('sse'),
    method: z.string(),
    url: urlSchema,
    header: z.array(headerRowSchema).optional(),
    query: z.array(paramRowSchema).optional(),
    body: collectionBodySchema.optional(),
    description: z.string().optional(),
    authId: z.string().optional(),
    sourceRef: collectionReferenceSchema.optional(),
});

/**
 * Any persisted request — HTTP (protocol absent or 'http'), WS, or SSE.
 * `z.union` is used (not `discriminatedUnion`) because the HTTP variant
 * allows the discriminant to be absent.
 */
const anyRequestSchema = z.union([wsRequestSchema, sseRequestSchema, httpRequestSchema]);

/**
 * Recursive schema for a collection item (request leaf or folder).
 * `z.lazy` enables arbitrary nesting depth.
 */
const collectionItemSchema: z.ZodType<unknown> = z.lazy(() =>
    z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        request: anyRequestSchema.optional(),
        // Saved responses are opaque in schema v0.0.1.
        response: z.array(z.unknown()).optional(),
        item: z.array(collectionItemSchema).optional(),
    })
);

/** Schema for the collection metadata block (`CollectionInfo`). */
const collectionInfoSchema = z.object({
    waveId: z.string(),
    name: z.string().min(1, 'Collection name must not be empty'),
    description: z.string().optional(),
    schema: z.string().optional(),
    version: z.string({ required_error: 'info.version is required (stamp before validating)' }),
});

/**
 * The full persisted Wave collection shape (v0.0.1).
 *
 * `filename` is a runtime-only field added at load time; it is tolerated
 * when present but never required.
 */
export const WaveCollectionSchema = z.object({
    info: collectionInfoSchema,
    item: z.array(collectionItemSchema),
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
 * Validates unknown data against the Wave collection schema (v0.0.1).
 *
 * Validate-only semantics: on success the **original input** is returned
 * (typed as `Collection`), so unknown extra fields are preserved — Zod's
 * stripped copy is intentionally discarded.
 *
 * @param data - Untrusted input (parsed JSON from a file or import).
 * @returns `ok(collection)` when valid; `err(message)` listing up to the
 *          first {@link MAX_REPORTED_ISSUES} issues as `path: message`.
 *
 * @example
 * ```typescript
 * const result = validateWaveCollection(JSON.parse(fileContent));
 * if (result.isOk) {
 *   const collection = result.value;
 * } else {
 *   console.error(`Invalid collection: ${result.error}`);
 * }
 * ```
 */
export function validateWaveCollection(data: unknown): Result<Collection, string> {
    const parsed = WaveCollectionSchema.safeParse(data);
    if (!parsed.success) {
        return err(formatZodError(parsed.error));
    }
    return ok(data as Collection);
}
