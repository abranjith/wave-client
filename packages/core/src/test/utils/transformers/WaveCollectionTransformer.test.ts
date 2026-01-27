import { describe, it, expect } from 'vitest';
import { WaveCollectionTransformer, waveTransformer } from '../../../utils/transformers/WaveCollectionTransformer';
import type { Collection } from '../../../types/collection';

describe('WaveCollectionTransformer', () => {
  const transformer = new WaveCollectionTransformer();

  describe('formatType and formatName', () => {
    it('should have correct format type', () => {
      expect(transformer.formatType).toBe('wave');
    });

    it('should have correct format name', () => {
      expect(transformer.formatName).toBe('Wave JSON');
    });

    it('should have correct file extensions', () => {
      expect(transformer.fileExtensions).toEqual(['.json']);
    });
  });

  describe('validate', () => {
    it('should validate a valid Wave collection', () => {
      const data = {
        info: {
          waveId: 'test-id',
          name: 'Test Collection',
          version: '0.0.1',
        },
        item: [],
      };

      expect(transformer.validate(data)).toBe(true);
    });

    it('should reject null or undefined', () => {
      expect(transformer.validate(null)).toBe(false);
      expect(transformer.validate(undefined)).toBe(false);
    });

    it('should reject non-object data', () => {
      expect(transformer.validate('string')).toBe(false);
      expect(transformer.validate(123)).toBe(false);
      expect(transformer.validate([])).toBe(false);
    });

    it('should reject data without info', () => {
      const data = { item: [] };
      expect(transformer.validate(data)).toBe(false);
    });

    it('should reject data with invalid info', () => {
      const data = {
        info: 'not an object',
        item: [],
      };
      expect(transformer.validate(data)).toBe(false);
    });

    it('should reject data without info.name', () => {
      const data = {
        info: { waveId: 'id' },
        item: [],
      };
      expect(transformer.validate(data)).toBe(false);
    });

    it('should reject data without item array', () => {
      const data = {
        info: { name: 'Test' },
      };
      expect(transformer.validate(data)).toBe(false);
    });

    it('should reject data with non-array item', () => {
      const data = {
        info: { name: 'Test' },
        item: 'not an array',
      };
      expect(transformer.validate(data)).toBe(false);
    });
  });

  describe('canHandle', () => {
    it('should handle valid Wave collection', () => {
      const data = {
        info: {
          waveId: 'test-id',
          name: 'Test Collection',
        },
        item: [],
      };

      expect(transformer.canHandle(data)).toBe(true);
    });

    it('should reject Postman collections with _postman_id', () => {
      const data = {
        info: {
          _postman_id: 'postman-id',
          name: 'Postman Collection',
        },
        item: [],
      };

      expect(transformer.canHandle(data)).toBe(false);
    });

    it('should reject Postman collections with schema', () => {
      const data = {
        info: {
          name: 'Postman Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [],
      };

      expect(transformer.canHandle(data)).toBe(false);
    });

    it('should reject invalid data', () => {
      expect(transformer.canHandle({ info: 'invalid' })).toBe(false);
    });
  });

  describe('transformFrom', () => {
    it('should transform valid Wave collection', () => {
      const input: Collection = {
        info: {
          waveId: 'test-id',
          name: 'Test Collection',
          version: '0.0.1',
        },
        item: [
          {
            id: 'req-1',
            name: 'Test Request',
            request: {
              id: 'req-1',
              name: 'Test Request',
              method: 'GET',
              url: 'https://api.example.com',
            },
          },
        ],
      };

      const result = transformer.transformFrom(input);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('Test Collection');
        expect(result.value.item).toHaveLength(1);
        expect(result.value.item[0].name).toBe('Test Request');
      }
    });

    it('should create info if missing', () => {
      const input: any = {
        item: [],
      };

      const result = transformer.transformFrom(input, 'test-collection.json');

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info).toBeDefined();
        expect(result.value.info.name).toBe('test-collection');
        expect(result.value.info.waveId).toBeDefined();
      }
    });

    it('should create empty item array if missing', () => {
      const input: any = {
        info: { name: 'Test' },
      };

      const result = transformer.transformFrom(input);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item).toEqual([]);
      }
    });

    it('should ensure items have IDs', () => {
      const input: any = {
        info: { name: 'Test' },
        item: [
          {
            name: 'Request without ID',
            request: { id: 'tmp-1', name: 'Request without ID', method: 'GET', url: 'https://api.com' },
          },
        ],
      };

      const result = transformer.transformFrom(input);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].id).toBeDefined();
      }
    });

    it('should preserve existing IDs', () => {
      const input: Collection = {
        info: { name: 'Test', waveId: 'id' },
        item: [
          {
            id: 'existing-id',
            name: 'Request',
            request: { id: 'existing-req', name: 'Request', method: 'GET', url: 'https://api.com' },
          },
        ],
      };

      const result = transformer.transformFrom(input);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].id).toBe('existing-id');
      }
    });

    it('should handle nested items', () => {
      const input: Collection = {
        info: { name: 'Test', waveId: 'id' },
        item: [
          {
            id: 'folder-1',
            name: 'Folder',
            item: [
              {
                id: 'nested-1',
                name: 'Nested Request',
                request: { id: 'nested-1', name: 'Nested Request', method: 'POST', url: 'https://api.com' },
              },
            ],
          },
        ],
      };

      const result = transformer.transformFrom(input);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.item[0].item![0].id).toBeDefined();
      }
    });

    it('should return error for invalid JSON during deep clone', () => {
      // Create circular reference
      const input: any = {
        info: { name: 'Test' },
        item: [],
      };
      input.circular = input;

      const result = transformer.transformFrom(input);

      expect(result.isOk).toBe(false);
      if (!result.isOk) {
        expect(result.error).toContain('Failed to parse Wave collection');
      }
    });
  });

  describe('transformTo', () => {
    it('should transform Collection to Wave JSON', () => {
      const collection: Collection = {
        info: {
          waveId: 'test-id',
          name: 'Test Collection',
          version: '0.0.1',
        },
        item: [
          {
            id: 'req-1',
            name: 'Test Request',
            request: {
              id: 'req-1',
              name: 'Test Request',
              method: 'GET',
              url: 'https://api.example.com',
            },
          },
        ],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value.info.name).toBe('Test Collection');
        expect(result.value.item).toHaveLength(1);
      }
    });

    it('should return identity (same object structure)', () => {
      const collection: Collection = {
        info: {
          waveId: 'test-id',
          name: 'Test Collection',
        },
        item: [],
      };

      const result = transformer.transformTo(collection);

      expect(result.isOk).toBe(true);
      if (result.isOk) {
        expect(result.value).toEqual(collection);
      }
    });
  });

  describe('waveTransformer singleton', () => {
    it('should export singleton instance', () => {
      expect(waveTransformer).toBeInstanceOf(WaveCollectionTransformer);
      expect(waveTransformer.formatType).toBe('wave');
    });
  });
});
