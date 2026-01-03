import { describe, it, expect } from 'vitest';
import {
  executeValidation,
  createGlobalRulesMap,
  createEnvVarsMap,
} from '../../utils/validationEngine';
import type {
  RequestValidation,
  StatusValidationRule,
  HeaderValidationRule,
  BodyValidationRule,
  TimeValidationRule,
  GlobalValidationRule,
} from '../../types/validation';
import type { ResponseData } from '../../types/collection';

describe('validationEngine', () => {
  const mockResponse: ResponseData = {
    id: 'req-1',
    status: 200,
    statusText: 'OK',
    headers: {
      'content-type': 'application/json',
      'x-custom-header': 'test-value',
    },
    body: JSON.stringify({ message: 'success', count: 5 }),
    elapsedTime: 150,
    size: 100,
    is_encoded: false,
  };

  describe('createGlobalRulesMap', () => {
    it('should convert array to Map with id as key', () => {
      const rules: GlobalValidationRule[] = [
        {
          id: 'rule1',
          name: 'Rule 1',
          description: 'Test rule 1',
          category: 'status',
          operator: 'equals',
          value: 200,
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'rule2',
          name: 'Rule 2',
          description: 'Test rule 2',
          category: 'header',
          operator: 'exists',
          headerName: 'content-type',
          enabled: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const map = createGlobalRulesMap(rules);

      expect(map.size).toBe(2);
      expect(map.get('rule1')).toEqual(rules[0]);
      expect(map.get('rule2')).toEqual(rules[1]);
    });

    it('should handle empty array', () => {
      const map = createGlobalRulesMap([]);
      expect(map.size).toBe(0);
    });
  });

  describe('createEnvVarsMap', () => {
    it('should convert object to Map', () => {
      const envVars = {
        API_URL: 'https://api.example.com',
        TOKEN: 'secret123',
      };

      const map = createEnvVarsMap(envVars);

      expect(map.size).toBe(2);
      expect(map.get('API_URL')).toBe('https://api.example.com');
      expect(map.get('TOKEN')).toBe('secret123');
    });

    it('should handle undefined input', () => {
      const map = createEnvVarsMap(undefined);
      expect(map.size).toBe(0);
    });

    it('should handle empty object', () => {
      const map = createEnvVarsMap({});
      expect(map.size).toBe(0);
    });
  });

  describe('executeValidation - status rules', () => {
    it('should validate status equals', () => {
      const rule: StatusValidationRule = {
        id: 'status1',
        name: 'Status is 200',
        category: 'status',
        operator: 'equals',
        value: 200,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].passed).toBe(true);
      expect(result.results[0].category).toBe('status');
    });

    it('should validate status not equals', () => {
      const rule: StatusValidationRule = {
        id: 'status2',
        name: 'Status is not 404',
        category: 'status',
        operator: 'not_equals',
        value: 404,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate status less than', () => {
      const rule: StatusValidationRule = {
        id: 'status3',
        name: 'Status < 300',
        category: 'status',
        operator: 'less_than',
        value: 300,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate status is_success (2xx)', () => {
      const rule: StatusValidationRule = {
        id: 'status4',
        name: 'Status is success',
        category: 'status',
        operator: 'is_success',
        value: 0,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should fail validation when status does not match', () => {
      const rule: StatusValidationRule = {
        id: 'status5',
        name: 'Status is 404',
        category: 'status',
        operator: 'equals',
        value: 404,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(false);
      expect(result.results[0].passed).toBe(false);
    });
  });

  describe('executeValidation - header rules', () => {
    it('should validate header exists', () => {
      const rule: HeaderValidationRule = {
        id: 'header1',
        name: 'Content-Type exists',
        category: 'header',
        operator: 'exists',
        headerName: 'content-type',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate header not exists', () => {
      const rule: HeaderValidationRule = {
        id: 'header2',
        name: 'Missing-Header not exists',
        category: 'header',
        operator: 'not_exists',
        headerName: 'missing-header',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate header equals value', () => {
      const rule: HeaderValidationRule = {
        id: 'header3',
        name: 'Custom header value',
        category: 'header',
        operator: 'equals',
        headerName: 'x-custom-header',
        value: 'test-value',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate header contains substring', () => {
      const rule: HeaderValidationRule = {
        id: 'header4',
        name: 'Content-Type contains json',
        category: 'header',
        operator: 'contains',
        headerName: 'content-type',
        value: 'json',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should be case-insensitive for header names', () => {
      const rule: HeaderValidationRule = {
        id: 'header5',
        name: 'Content-Type (case insensitive)',
        category: 'header',
        operator: 'exists',
        headerName: 'CONTENT-TYPE',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });
  });

  describe('executeValidation - body rules', () => {
    it('should validate body contains substring', () => {
      const rule: BodyValidationRule = {
        id: 'body1',
        name: 'Body contains success',
        category: 'body',
        operator: 'contains',
        value: 'success',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate JSON path exists', () => {
      const rule: BodyValidationRule = {
        id: 'body2',
        name: 'Message field exists',
        category: 'body',
        operator: 'json_path_exists',
        jsonPath: '$.message',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate JSON path value equals', () => {
      const rule: BodyValidationRule = {
        id: 'body3',
        name: 'Count equals 5',
        category: 'body',
        operator: 'json_path_equals',
        jsonPath: '$.count',
        value: '5',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate body is not empty', () => {
      const rule: BodyValidationRule = {
        id: 'body4',
        name: 'Body not empty',
        category: 'body',
        operator: 'not_equals',
        value: '',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle base64 encoded body', () => {
      const encodedResponse: ResponseData = {
        ...mockResponse,
        body: btoa(JSON.stringify({ data: 'test' })),
        is_encoded: true,
      };

      const rule: BodyValidationRule = {
        id: 'body5',
        name: 'Encoded body contains test',
        category: 'body',
        operator: 'contains',
        value: 'test',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, encodedResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });
  });

  describe('executeValidation - time rules', () => {
    it('should validate response time less than', () => {
      const rule: TimeValidationRule = {
        id: 'time1',
        name: 'Response < 200ms',
        category: 'time',
        operator: 'less_than',
        value: 200,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate response time greater than', () => {
      const rule: TimeValidationRule = {
        id: 'time2',
        name: 'Response > 100ms',
        category: 'time',
        operator: 'greater_than',
        value: 100,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should validate response time between', () => {
      const rule: TimeValidationRule = {
        id: 'time3',
        name: 'Response between 100-200ms',
        category: 'time',
        operator: 'between',
        value: 100,
        value2: 200,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });
  });

  describe('executeValidation - environment variable resolution', () => {
    it('should resolve environment variables in status value', () => {
      const envVars = new Map([['EXPECTED_STATUS', '200']]);

      const rule: StatusValidationRule = {
        id: 'status-env',
        name: 'Status equals env var',
        category: 'status',
        operator: 'equals',
        value: '{{EXPECTED_STATUS}}' as any,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), envVars);

      expect(result.allPassed).toBe(true);
    });

    it('should resolve environment variables in header values', () => {
      const envVars = new Map([['EXPECTED_TYPE', 'application/json']]);

      const rule: HeaderValidationRule = {
        id: 'header-env',
        name: 'Content-Type from env',
        category: 'header',
        operator: 'equals',
        headerName: 'content-type',
        value: '{{EXPECTED_TYPE}}',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), envVars);

      expect(result.allPassed).toBe(true);
    });

    it('should resolve environment variables in body values', () => {
      const envVars = new Map([['SEARCH_TEXT', 'success']]);

      const rule: BodyValidationRule = {
        id: 'body-env',
        name: 'Body contains env var',
        category: 'body',
        operator: 'contains',
        value: '{{SEARCH_TEXT}}',
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), envVars);

      expect(result.allPassed).toBe(true);
    });
  });

  describe('executeValidation - disabled rules', () => {
    it('should skip disabled rules', () => {
      const rule: StatusValidationRule = {
        id: 'disabled',
        name: 'Disabled rule',
        category: 'status',
        operator: 'equals',
        value: 404, // Would fail if executed
        enabled: false,
      };

      const validation: RequestValidation = {
        enabled: true,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      // Disabled rules still appear in results but should be skipped/marked differently
      expect(result.results).toHaveLength(1);
      // Check if the rule was actually skipped (should fail if it was executed since status is 200, not 404)
      expect(result.results[0].passed || result.results[0].error).toBeTruthy();
    });

    it('should return empty results when validation is disabled', () => {
      const rule: StatusValidationRule = {
        id: 'status1',
        name: 'Status check',
        category: 'status',
        operator: 'equals',
        value: 200,
        enabled: true,
      };

      const validation: RequestValidation = {
        enabled: false,
        rules: [{ rule }],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('executeValidation - multiple rules', () => {
    it('should pass when all rules pass', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Status 200',
              category: 'status',
              operator: 'equals',
              value: 200,
              enabled: true,
            },
          },
          {
            rule: {
              id: 'r2',
              name: 'Header exists',
              category: 'header',
              operator: 'exists',
              headerName: 'content-type',
              enabled: true,
            },
          },
          {
            rule: {
              id: 'r3',
              name: 'Fast response',
              category: 'time',
              operator: 'less_than',
              value: 1000,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(result.results.every((r) => r.passed)).toBe(true);
    });

    it('should fail when any rule fails', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Status 200',
              category: 'status',
              operator: 'equals',
              value: 200,
              enabled: true,
            },
          },
          {
            rule: {
              id: 'r2',
              name: 'Status 404',
              category: 'status',
              operator: 'equals',
              value: 404,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].passed).toBe(true);
      expect(result.results[1].passed).toBe(false);
    });
  });

  describe('executeValidation - undefined validation', () => {
    it('should return passing result for undefined validation', () => {
      const result = executeValidation(undefined, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('executeValidation - additional edge cases', () => {
    it('should handle header with case-insensitive matching', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Content-Type Check',
              category: 'header',
              headerName: 'content-type',
              operator: 'equals',
              value: 'APPLICATION/JSON',
              caseSensitive: false,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle header with case-sensitive matching', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Content-Type Check',
              category: 'header',
              headerName: 'Content-Type',
              operator: 'equals',
              value: 'APPLICATION/JSON',
              caseSensitive: true,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(false);
    });

    it('should handle body contains with case-insensitive matching', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Body Contains',
              category: 'body',
              operator: 'contains',
              value: 'SUCCESS',
              caseSensitive: false,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle body not_contains operator', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Body Not Contains',
              category: 'body',
              operator: 'not_contains',
              value: 'password',
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle time greater_than operator', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Response Time',
              category: 'time',
              operator: 'greater_than',
              value: 100,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle time between operator - in range', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Response Time Between',
              category: 'time',
              operator: 'between',
              value: 100,
              value2: 300,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle time between operator - out of range', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Response Time Between',
              category: 'time',
              operator: 'between',
              value: 300,
              value2: 500,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(false);
    });

    it('should handle status greater_than_or_equal operator', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Status >= 200',
              category: 'status',
              operator: 'greater_than_or_equal',
              value: 200,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle status less_than_or_equal operator', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Status <= 200',
              category: 'status',
              operator: 'less_than_or_equal',
              value: 200,
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle header matches_regex operator', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Content-Type Regex',
              category: 'header',
              headerName: 'Content-Type',
              operator: 'matches_regex',
              value: '^application/.*',
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });

    it('should handle invalid regex gracefully', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Invalid Regex',
              category: 'header',
              headerName: 'Content-Type',
              operator: 'matches_regex',
              value: '[invalid(',
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(false);
    });

    it('should handle JSON path with dot notation', () => {
      const validation: RequestValidation = {
        enabled: true,
        rules: [
          {
            rule: {
              id: 'r1',
              name: 'Check message',
              category: 'body',
              operator: 'json_path_equals',
              jsonPath: '$.message',
              value: 'success',
              enabled: true,
            },
          },
        ],
      };

      const result = executeValidation(validation, mockResponse, new Map(), new Map());

      expect(result.allPassed).toBe(true);
    });
  });
});
