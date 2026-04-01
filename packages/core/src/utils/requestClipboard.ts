/**
 * Request Editor Clipboard Utilities
 *
 * Shared parse and serialize helpers for all table-based request editors
 * (headers, query params, URL-encoded body).
 *
 * Design goals:
 * - Copy: serialize only enabled, non-empty rows as newline-delimited `key=value` text.
 * - Paste: parse clipboard text from multiple common formats and return append-ready rows.
 * - Platform-agnostic: this module contains zero browser/Node.js APIs.
 */

import type { Result } from './result';
import { ok, err } from './result';

// ============================================================================
// Types
// ============================================================================

/** A single parsed key/value entry ready to be appended to an editor table. */
export interface ParsedClipboardEntry {
    readonly key: string;
    readonly value: string;
}

/** Detected clipboard format — used for diagnostics and testing. */
export type ClipboardFormat =
    | 'json-object'
    | 'equals-lines'
    | 'colon-lines'
    | 'urlencoded';

/** Result returned by parseRequestClipboard. */
export interface RequestClipboardParseResult {
    /** Parsed rows in input order, ready to append to the current table. */
    readonly entries: ParsedClipboardEntry[];
    /** The format that was detected and used for parsing. */
    readonly format: ClipboardFormat;
}

/** Minimal shape expected from table rows when serializing. */
export interface SerializableRow {
    readonly key: string;
    readonly value: string | null | undefined;
    readonly disabled?: boolean;
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize enabled, non-empty table rows to newline-delimited `key=value` text.
 *
 * Rows that are disabled or have an empty key are excluded.
 * The serialized text is suitable for writing to the clipboard and can be
 * re-parsed by `parseRequestClipboard`.
 *
 * @param rows  The current table rows.
 * @returns     Newline-delimited `key=value` text, or an empty string if there
 *              are no eligible rows.
 */
export function serializeRowsForClipboard(rows: readonly SerializableRow[]): string {
    return rows
        .filter((row) => !row.disabled && row.key.trim() !== '')
        .map((row) => `${row.key}=${row.value ?? ''}`)
        .join('\n');
}

// ============================================================================
// Parsing — internal helpers
// ============================================================================

/** Strip a trailing comma that appears immediately before a newline. */
function stripTrailingComma(text: string): string {
    return text.replace(/,(\r?\n)/g, '$1').replace(/,$/, '');
}

/** Attempt to parse a JSON object whose keys map to string values. */
function tryParseJsonObject(text: string): ParsedClipboardEntry[] | null {
    try {
        const parsed: unknown = JSON.parse(text);
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
        ) {
            const entries: ParsedClipboardEntry[] = [];
            for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
                entries.push({ key, value: String(value ?? '') });
            }
            return entries.length > 0 ? entries : null;
        }
    } catch {
        // Not valid JSON — fall through to line-based parsing
    }
    return null;
}

/** Split text into non-empty, trimmed lines. */
function splitLines(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

/**
 * Parse `key=value` lines.
 * `key` is the text before the first `=`; `value` is everything after it.
 */
function parseEqualsLines(lines: string[]): ParsedClipboardEntry[] | null {
    if (!lines.every((line) => line.includes('='))) {
        return null;
    }
    const entries = lines.map((line) => {
        const idx = line.indexOf('=');
        return {
            key: line.slice(0, idx).trim(),
            value: line.slice(idx + 1).trim(),
        };
    }).filter((e) => e.key.length > 0);
    return entries.length > 0 ? entries : null;
}

/**
 * Parse `key: value` lines (HTTP header style).
 * `key` is the text before the first `:`; `value` is everything after it.
 */
function parseColonLines(lines: string[]): ParsedClipboardEntry[] | null {
    if (!lines.every((line) => line.includes(':'))) {
        return null;
    }
    const entries = lines.map((line) => {
        const idx = line.indexOf(':');
        return {
            key: line.slice(0, idx).trim(),
            value: line.slice(idx + 1).trim(),
        };
    }).filter((e) => e.key.length > 0);
    return entries.length > 0 ? entries : null;
}

/**
 * Parse `key=value&key2=value2` URL-encoded strings.
 * Percentages are decoded; both keys and values are trimmed after decoding.
 */
function parseUrlEncoded(text: string): ParsedClipboardEntry[] | null {
    const trimmed = text.trim();
    // URL-encoded format requires '&' to distinguish from plain key=value lines
    if (!trimmed.includes('&')) {
        return null;
    }
    const pairs = trimmed.split('&').map((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) { return null; }
        try {
            return {
                key: decodeURIComponent(pair.slice(0, idx)).trim(),
                value: decodeURIComponent(pair.slice(idx + 1)).trim(),
            };
        } catch {
            return {
                key: pair.slice(0, idx).trim(),
                value: pair.slice(idx + 1).trim(),
            };
        }
    }).filter((e): e is ParsedClipboardEntry => e !== null && e.key.length > 0);
    return pairs.length > 0 ? pairs : null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Parse clipboard text into a list of key/value entries ready to append to a
 * request editor table.
 *
 * Detection order:
 * 1. JSON object — `{ "key": "value", ... }`
 * 2. URL-encoded `key=value&key2=value2` (single line with `&` separators)
 * 3. Newline-delimited `key=value` lines
 * 4. Newline-delimited `key: value` lines (HTTP header style)
 *
 * Trailing commas immediately before a newline are stripped before detection.
 * Duplicate keys are preserved in input order.
 *
 * @param text  Raw clipboard text to parse.
 * @returns     `ok` with detected format and entries, or `err` with a
 *              user-visible message when no valid entries can be extracted.
 */
export function parseRequestClipboard(
    text: string
): Result<RequestClipboardParseResult, string> {
    const cleaned = stripTrailingComma(text.trim());

    if (cleaned.length === 0) {
        return err('Clipboard is empty.');
    }

    // 1. JSON object
    const jsonEntries = tryParseJsonObject(cleaned);
    if (jsonEntries) {
        return ok({ entries: jsonEntries, format: 'json-object' });
    }

    // 2. URL-encoded (single line, ampersand-delimited) — must precede equals-lines
    // so that 'a=1&b=2' isn't misdetected as a single equals-line.
    const urlEncodedEntries = parseUrlEncoded(cleaned);
    if (urlEncodedEntries) {
        return ok({ entries: urlEncodedEntries, format: 'urlencoded' });
    }

    // 3. Newline-delimited key=value lines
    const lines = splitLines(cleaned);
    if (lines.length > 0) {
        const equalsEntries = parseEqualsLines(lines);
        if (equalsEntries) {
            return ok({ entries: equalsEntries, format: 'equals-lines' });
        }

        // 4. Newline-delimited key: value lines
        const colonEntries = parseColonLines(lines);
        if (colonEntries) {
            return ok({ entries: colonEntries, format: 'colon-lines' });
        }
    }

    return err('No valid key/value pairs found in clipboard content.');
}
