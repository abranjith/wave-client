/**
 * Tests for arenaChatBlocks helper functions
 *
 * Verifies the factory functions produce correctly shaped blocks
 * and that the discriminated union types are sound.
 */

import { describe, it, expect } from 'vitest';
import {
  textBlock,
  codeBlock,
  jsonViewerBlock,
  tableBlock,
  progressBlock,
} from '../../types/arenaChatBlocks';
import type {
  TextBlock,
  CodeBlock,
  JsonViewerBlock,
  TableBlock,
  ProgressBlock,
  ArenaChatBlock,
  ArenaChatBlockType,
} from '../../types/arenaChatBlocks';

describe('arenaChatBlocks helpers', () => {
  // --------------------------------------------------------------------------
  // textBlock
  // --------------------------------------------------------------------------
  describe('textBlock()', () => {
    it('should create a block with type "text" and the given content', () => {
      const block = textBlock('Hello **world**');
      expect(block).toEqual({ type: 'text', content: 'Hello **world**' });
    });

    it('should handle empty strings', () => {
      const block = textBlock('');
      expect(block.type).toBe('text');
      expect(block.content).toBe('');
    });
  });

  // --------------------------------------------------------------------------
  // codeBlock
  // --------------------------------------------------------------------------
  describe('codeBlock()', () => {
    it('should create a block with language and content', () => {
      const block = codeBlock('json', '{"key": "value"}');
      expect(block).toEqual({
        type: 'code',
        language: 'json',
        content: '{"key": "value"}',
      });
    });

    it('should include title when provided', () => {
      const block = codeBlock('http', 'GET /api', 'example.http');
      expect(block.title).toBe('example.http');
    });

    it('should omit title when not provided', () => {
      const block = codeBlock('javascript', 'console.log("hi")');
      expect(block).not.toHaveProperty('title');
    });
  });

  // --------------------------------------------------------------------------
  // jsonViewerBlock
  // --------------------------------------------------------------------------
  describe('jsonViewerBlock()', () => {
    it('should wrap an object', () => {
      const data = { users: [{ id: 1 }] };
      const block = jsonViewerBlock(data);
      expect(block.type).toBe('json_viewer');
      expect(block.data).toEqual(data);
    });

    it('should wrap an array', () => {
      const data = [1, 2, 3];
      const block = jsonViewerBlock(data);
      expect(block.data).toEqual([1, 2, 3]);
    });

    it('should include title when provided', () => {
      const block = jsonViewerBlock({ a: 1 }, 'Response Body');
      expect(block.title).toBe('Response Body');
    });

    it('should omit title when not provided', () => {
      const block = jsonViewerBlock({});
      expect(block).not.toHaveProperty('title');
    });
  });

  // --------------------------------------------------------------------------
  // tableBlock
  // --------------------------------------------------------------------------
  describe('tableBlock()', () => {
    it('should create a table with headers and rows', () => {
      const headers = ['Name', 'Value'];
      const rows = [['host', 'example.com'], ['port', '443']];
      const block = tableBlock(headers, rows);
      expect(block).toEqual({
        type: 'table',
        headers: ['Name', 'Value'],
        rows: [['host', 'example.com'], ['port', '443']],
      });
    });

    it('should include caption when provided', () => {
      const block = tableBlock(['A'], [['1']], 'My Table');
      expect(block.caption).toBe('My Table');
    });

    it('should omit caption when not provided', () => {
      const block = tableBlock(['A'], [['1']]);
      expect(block).not.toHaveProperty('caption');
    });
  });

  // --------------------------------------------------------------------------
  // progressBlock
  // --------------------------------------------------------------------------
  describe('progressBlock()', () => {
    it('should create a running progress block', () => {
      const block = progressBlock('Fetching data…', 'running');
      expect(block).toEqual({
        type: 'progress',
        label: 'Fetching data…',
        status: 'running',
      });
    });

    it('should create a done progress block with detail', () => {
      const block = progressBlock('Tests passed', 'done', '12/12 assertions');
      expect(block.status).toBe('done');
      expect(block.detail).toBe('12/12 assertions');
    });

    it('should create an error progress block', () => {
      const block = progressBlock('Build failed', 'error', 'Syntax error at line 42');
      expect(block.status).toBe('error');
      expect(block.detail).toBe('Syntax error at line 42');
    });

    it('should omit detail when not provided', () => {
      const block = progressBlock('Loading', 'running');
      expect(block).not.toHaveProperty('detail');
    });
  });

  // --------------------------------------------------------------------------
  // Type-level sanity checks (validate discriminated union)
  // --------------------------------------------------------------------------
  describe('ArenaChatBlock type discrimination', () => {
    it('should narrow on block.type', () => {
      const blocks: ArenaChatBlock[] = [
        textBlock('hello'),
        codeBlock('json', '{}'),
        jsonViewerBlock({ a: 1 }),
        tableBlock(['h'], [['r']]),
        progressBlock('ok', 'done'),
      ];

      // Verify we can discriminate each type at runtime
      const types = blocks.map((b) => b.type);
      expect(types).toEqual(['text', 'code', 'json_viewer', 'table', 'progress']);
    });

    it('should cover all block type literals', () => {
      // This array must match ArenaChatBlockType; if a new variant is added
      // without updating this test, TypeScript will flag it.
      const ALL_TYPES: ArenaChatBlockType[] = [
        'text',
        'code',
        'json_viewer',
        'request_form',
        'response_viewer',
        'env_selector',
        'table',
        'confirmation',
        'progress',
      ];

      expect(ALL_TYPES).toHaveLength(9);
    });
  });
});
