import { describe, it, expect } from 'vitest';
import {
  isTextResponse,
  prettyPrintIfJson,
  BINARY_PLACEHOLDER,
} from '../../../utils/reporting/content';

// ---------------------------------------------------------------------------
// BINARY_PLACEHOLDER
// ---------------------------------------------------------------------------

describe('BINARY_PLACEHOLDER', () => {
  it('is a non-empty string', () => {
    expect(typeof BINARY_PLACEHOLDER).toBe('string');
    expect(BINARY_PLACEHOLDER.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isTextResponse — isEncoded short-circuit
// ---------------------------------------------------------------------------

describe('isTextResponse — isEncoded flag', () => {
  it('returns false when isEncoded is true, regardless of headers and body', () => {
    expect(isTextResponse({ 'Content-Type': 'text/plain' }, 'hello', true)).toBe(false);
  });

  it('returns true when isEncoded is false and content is plain text', () => {
    expect(isTextResponse({ 'Content-Type': 'text/plain' }, 'hello', false)).toBe(true);
  });

  it('returns true when isEncoded is undefined and content is plain text', () => {
    expect(isTextResponse({ 'Content-Type': 'text/plain' }, 'hello', undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isTextResponse — content-type detection
// ---------------------------------------------------------------------------

describe('isTextResponse — content-type detection', () => {
  it('returns false for image/png', () => {
    expect(isTextResponse({ 'Content-Type': 'image/png' }, '', undefined)).toBe(false);
  });

  it('returns false for image/jpeg', () => {
    expect(isTextResponse({ 'Content-Type': 'image/jpeg' }, '', undefined)).toBe(false);
  });

  it('returns false for audio/mpeg', () => {
    expect(isTextResponse({ 'Content-Type': 'audio/mpeg' }, '', undefined)).toBe(false);
  });

  it('returns false for video/mp4', () => {
    expect(isTextResponse({ 'Content-Type': 'video/mp4' }, '', undefined)).toBe(false);
  });

  it('returns false for application/octet-stream', () => {
    expect(isTextResponse({ 'Content-Type': 'application/octet-stream' }, '', undefined)).toBe(false);
  });

  it('returns false for application/pdf', () => {
    expect(isTextResponse({ 'Content-Type': 'application/pdf' }, '', undefined)).toBe(false);
  });

  it('returns false for application/zip', () => {
    expect(isTextResponse({ 'Content-Type': 'application/zip' }, '', undefined)).toBe(false);
  });

  it('returns false for application/gzip', () => {
    expect(isTextResponse({ 'Content-Type': 'application/gzip' }, '', undefined)).toBe(false);
  });

  it('returns true for text/plain', () => {
    expect(isTextResponse({ 'Content-Type': 'text/plain' }, 'hello', undefined)).toBe(true);
  });

  it('returns true for text/html', () => {
    expect(isTextResponse({ 'Content-Type': 'text/html' }, '<html>', undefined)).toBe(true);
  });

  it('returns true for application/json', () => {
    expect(isTextResponse({ 'Content-Type': 'application/json' }, '{}', undefined)).toBe(true);
  });

  it('is case-insensitive for content-type values', () => {
    expect(isTextResponse({ 'Content-Type': 'IMAGE/PNG' }, '', undefined)).toBe(false);
  });

  it('is case-insensitive for content-type header keys', () => {
    expect(isTextResponse({ 'content-type': 'image/png' }, '', undefined)).toBe(false);
  });

  it('returns true when headers are undefined', () => {
    expect(isTextResponse(undefined, 'hello world', undefined)).toBe(true);
  });

  it('returns true when headers are empty', () => {
    expect(isTextResponse({}, 'hello world', undefined)).toBe(true);
  });

  it('returns true for content-type with parameters (e.g., charset)', () => {
    expect(
      isTextResponse({ 'Content-Type': 'application/json; charset=utf-8' }, '{}', undefined),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isTextResponse — binary byte sniff
// ---------------------------------------------------------------------------

describe('isTextResponse — binary byte sniff', () => {
  it('returns false when body starts with a NUL byte (0x00)', () => {
    expect(isTextResponse(undefined, '\x00binary data', undefined)).toBe(false);
  });

  it('returns false when body contains a control character (0x01) in first 64 bytes', () => {
    expect(isTextResponse(undefined, 'data\x01more', undefined)).toBe(false);
  });

  it('allows tab (0x09) as a printable character', () => {
    expect(isTextResponse(undefined, 'col1\tcol2', undefined)).toBe(true);
  });

  it('allows newline (0x0A) as a printable character', () => {
    expect(isTextResponse(undefined, 'line1\nline2', undefined)).toBe(true);
  });

  it('allows carriage return (0x0D) as a printable character', () => {
    expect(isTextResponse(undefined, 'line1\r\nline2', undefined)).toBe(true);
  });

  it('ignores binary bytes beyond the 64-byte sample window', () => {
    const clean = 'a'.repeat(64);
    const withBinaryAtEnd = clean + '\x00';
    // Only the first 64 bytes are sniffed; the NUL is beyond the window
    expect(isTextResponse(undefined, withBinaryAtEnd, undefined)).toBe(true);
  });

  it('returns true for an empty body', () => {
    expect(isTextResponse(undefined, '', undefined)).toBe(true);
  });

  it('returns true for undefined body', () => {
    expect(isTextResponse(undefined, undefined, undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// prettyPrintIfJson
// ---------------------------------------------------------------------------

describe('prettyPrintIfJson', () => {
  it('pretty-prints valid JSON when content-type contains "json"', () => {
    const body = '{"a":1,"b":2}';
    const result = prettyPrintIfJson(body, 'application/json');
    expect(result).toBe(JSON.stringify({ a: 1, b: 2 }, null, 2));
  });

  it('pretty-prints for application/json; charset=utf-8', () => {
    const body = '[1,2,3]';
    const result = prettyPrintIfJson(body, 'application/json; charset=utf-8');
    expect(result).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it('pretty-prints for text/json content-type', () => {
    const body = '{"x":true}';
    const result = prettyPrintIfJson(body, 'text/json');
    expect(result).toBe(JSON.stringify({ x: true }, null, 2));
  });

  it('returns body unchanged when content-type is text/plain', () => {
    const body = 'hello world';
    expect(prettyPrintIfJson(body, 'text/plain')).toBe(body);
  });

  it('returns body unchanged when content-type is undefined', () => {
    const body = '{"a":1}';
    expect(prettyPrintIfJson(body, undefined)).toBe(body);
  });

  it('returns body unchanged when content-type is empty string', () => {
    const body = '{"a":1}';
    expect(prettyPrintIfJson(body, '')).toBe(body);
  });

  it('returns original body when JSON is malformed', () => {
    const body = '{invalid json}';
    expect(prettyPrintIfJson(body, 'application/json')).toBe(body);
  });

  it('returns original body when JSON is partially malformed', () => {
    const body = '{"a":1,}';
    expect(prettyPrintIfJson(body, 'application/json')).toBe(body);
  });

  it('returns empty string for undefined body', () => {
    expect(prettyPrintIfJson(undefined, 'application/json')).toBe('');
  });

  it('returns empty string for empty body', () => {
    expect(prettyPrintIfJson('', 'application/json')).toBe('');
  });

  it('is case-insensitive for content-type (JSON vs json)', () => {
    const body = '{"k":"v"}';
    const result = prettyPrintIfJson(body, 'Application/JSON');
    expect(result).toBe(JSON.stringify({ k: 'v' }, null, 2));
  });

  it('handles nested objects correctly', () => {
    const body = '{"outer":{"inner":42}}';
    const result = prettyPrintIfJson(body, 'application/json');
    const expected = JSON.stringify({ outer: { inner: 42 } }, null, 2);
    expect(result).toBe(expected);
  });

  it('does not double-encode already pretty-printed JSON', () => {
    const body = JSON.stringify({ a: 1 }, null, 2);
    const result = prettyPrintIfJson(body, 'application/json');
    // Parsing and re-stringifying with the same indent must produce the same output
    expect(result).toBe(body);
  });
});
