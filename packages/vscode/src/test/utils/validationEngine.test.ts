/**
 * Tests for Validation Engine
 * Comprehensive test coverage for all validation rule types and operators
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    executeValidation,
    createGlobalRulesMap,
    createEnvVarsMap
} from '../../utils/validationEngine';
import type {
    RequestValidation,
    ValidationRule,
    GlobalValidationRule,
    StatusValidationRule,
    HeaderValidationRule,
    BodyValidationRule,
    TimeValidationRule
} from '../../types/validation';
import type { ResponseData } from '../../services/types';

// ============================================================================
// Test Data Helpers
// ============================================================================

const NOW = new Date().toISOString();

/**
 * Helper to create a GlobalValidationRule with default timestamps
 */
function createGlobalRule(overrides: Omit<GlobalValidationRule, 'createdAt' | 'updatedAt'>): GlobalValidationRule {
    return {
        ...overrides,
        createdAt: NOW,
        updatedAt: NOW
    };
}

function createMockResponse(overrides: Partial<ResponseData> = {}): ResponseData {
    return {
        id: 'test-response-id',
        status: 200,
        statusText: 'OK',
        headers: {
            'content-type': 'application/json',
            'x-custom-header': 'test-value'
        },
        body: '{"message":"success","data":{"id":123,"name":"Test"}}',
        elapsedTime: 150,
        size: 0,
        is_encoded: false,
        ...overrides
    };
}

function createEnvVars(): Map<string, string> {
    return new Map([
        ['API_STATUS', '200'],
        ['API_TIMEOUT', '1000'],
        ['HEADER_NAME', 'x-api-key'],
        ['EXPECTED_VALUE', 'test-value'],
        ['JSON_PATH', '$.data.id']
    ]);
}

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('createEnvVarsMap', () => {
    it('creates map from object', () => {
        const envVars = { key1: 'value1', key2: 'value2' };
        const map = createEnvVarsMap(envVars);
        
        expect(map.get('key1')).toBe('value1');
        expect(map.get('key2')).toBe('value2');
    });

    it('handles undefined input', () => {
        const map = createEnvVarsMap(undefined);
        
        expect(map.size).toBe(0);
    });

    it('handles empty object', () => {
        const map = createEnvVarsMap({});
        
        expect(map.size).toBe(0);
    });
});

describe('createGlobalRulesMap', () => {
    it('creates map from array of global rules', () => {
        const rules: GlobalValidationRule[] = [
            createGlobalRule({
                id: 'rule-1',
                name: 'Test Rule 1',
                category: 'status',
                operator: 'equals',
                value: 200,
                enabled: true
            }),
            createGlobalRule({
                id: 'rule-2',
                name: 'Test Rule 2',
                category: 'header',
                headerName: 'content-type',
                operator: 'equals',
                value: 'application/json',
                enabled: true
            })
        ];

        const map = createGlobalRulesMap(rules);
        
        expect(map.size).toBe(2);
        expect(map.get('rule-1')?.name).toBe('Test Rule 1');
        expect(map.get('rule-2')?.name).toBe('Test Rule 2');
    });

    it('handles empty array', () => {
        const map = createGlobalRulesMap([]);
        
        expect(map.size).toBe(0);
    });
});

// ============================================================================
// Status Validation Tests
// ============================================================================

describe('Status Validation Rules', () => {
    const envVars = new Map<string, string>();
    const globalRules = new Map<string, GlobalValidationRule>();

    describe('equals operator', () => {
        it('passes when status matches', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status is 200',
                        category: 'status',
                        operator: 'equals',
                        value: 200,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 200 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
            expect(result.passedRules).toBe(1);
            expect(result.results[0].passed).toBe(true);
        });

        it('fails when status does not match', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status is 200',
                        category: 'status',
                        operator: 'equals',
                        value: 200,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 404 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
            expect(result.failedRules).toBe(1);
            expect(result.results[0].passed).toBe(false);
            expect(result.results[0].actual).toBe('404');
        });
    });

    describe('is_success operator', () => {
        it('passes for 2xx status codes', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status is success',
                        category: 'status',
                        operator: 'is_success',
                        value: 0, // Not used for is_success
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            for (const status of [200, 201, 204, 299]) {
                const response = createMockResponse({ status });
                const result = executeValidation(validation, response, globalRules, envVars);
                
                expect(result.allPassed).toBe(true);
            }
        });

        it('fails for non-2xx status codes', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status is success',
                        category: 'status',
                        operator: 'is_success',
                        value: 0,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            for (const status of [199, 300, 404, 500]) {
                const response = createMockResponse({ status });
                const result = executeValidation(validation, response, globalRules, envVars);
                
                expect(result.allPassed).toBe(false);
            }
        });
    });

    describe('comparison operators', () => {
        it('handles greater_than operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status > 199',
                        category: 'status',
                        operator: 'greater_than',
                        value: 199,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 200 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles less_than operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status < 300',
                        category: 'status',
                        operator: 'less_than',
                        value: 300,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 200 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles between operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status between 200-299',
                        category: 'status',
                        operator: 'between',
                        value: 200,
                        value2: 299,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 250 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
            expect(result.results[0].expected).toContain('200 - 299');
        });

        it('handles in operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status in list',
                        category: 'status',
                        operator: 'in',
                        value: 0,
                        values: [200, 201, 204],
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 201 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });
    });

    describe('environment variable resolution', () => {
        it('resolves environment variables in status values', () => {
            const envVars = new Map([['EXPECTED_STATUS', '200']]);
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'status-1',
                        name: 'Status matches env var',
                        category: 'status',
                        operator: 'equals',
                        value: '{{EXPECTED_STATUS}}' as any,
                        enabled: true
                    } as StatusValidationRule
                }]
            };

            const response = createMockResponse({ status: 200 });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });
    });
});

// ============================================================================
// Header Validation Tests
// ============================================================================

describe('Header Validation Rules', () => {
    const envVars = new Map<string, string>();
    const globalRules = new Map<string, GlobalValidationRule>();

    describe('exists operator', () => {
        it('passes when header exists', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type exists',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'exists',
                        value: '',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
            expect(result.results[0].message).toContain('exists');
        });

        it('fails when header does not exist', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Missing header',
                        category: 'header',
                        headerName: 'x-missing-header',
                        operator: 'exists',
                        value: '',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
            expect(result.results[0].message).toContain('does not exist');
        });
    });

    describe('string comparison operators', () => {
        it('handles equals operator (case-insensitive)', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type is JSON',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'equals',
                        value: 'application/json',
                        caseSensitive: false,
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles contains operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type contains json',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'contains',
                        value: 'json',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles starts_with operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type starts with application',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'starts_with',
                        value: 'application',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles ends_with operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type ends with json',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'ends_with',
                        value: 'json',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles matches_regex operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type matches regex',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'matches_regex',
                        value: '^application/.*',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles invalid regex gracefully', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Invalid regex',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'matches_regex',
                        value: '[invalid',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
        });
    });

    describe('case sensitivity', () => {
        it('respects case-sensitive flag', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Case sensitive match',
                        category: 'header',
                        headerName: 'x-custom-header',
                        operator: 'equals',
                        value: 'test-value',
                        caseSensitive: true,
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('fails when case does not match with case-sensitive', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Case sensitive match',
                        category: 'header',
                        headerName: 'x-custom-header',
                        operator: 'equals',
                        value: 'TEST-VALUE',
                        caseSensitive: true,
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
        });
    });

    describe('header name case-insensitive lookup', () => {
        it('finds header regardless of name case', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'header-1',
                        name: 'Header with different case',
                        category: 'header',
                        headerName: 'CONTENT-TYPE',
                        operator: 'exists',
                        value: '',
                        enabled: true
                    } as HeaderValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });
    });
});

// ============================================================================
// Body Validation Tests
// ============================================================================

describe('Body Validation Rules', () => {
    const envVars = new Map<string, string>();
    const globalRules = new Map<string, GlobalValidationRule>();

    describe('content type checks', () => {
        it('validates is_json operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Body is JSON',
                        category: 'body',
                        operator: 'is_json',
                        value: '',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
            expect(result.results[0].message).toContain('valid JSON');
        });

        it('fails is_json for invalid JSON', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Body is JSON',
                        category: 'body',
                        operator: 'is_json',
                        value: '',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse({ body: 'not json' });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
        });

        it('validates is_xml operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Body is XML',
                        category: 'body',
                        operator: 'is_xml',
                        value: '',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse({ body: '<?xml version="1.0"?><root></root>' });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('validates is_html operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Body is HTML',
                        category: 'body',
                        operator: 'is_html',
                        value: '',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse({ body: '<!DOCTYPE html><html></html>' });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });
    });

    describe('JSON path operators', () => {
        it('validates json_path_exists', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Data ID exists',
                        category: 'body',
                        operator: 'json_path_exists',
                        value: '',
                        jsonPath: '$.data.id',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
            expect(result.results[0].message).toContain('exists');
        });

        it('fails json_path_exists when path not found', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Missing path',
                        category: 'body',
                        operator: 'json_path_exists',
                        value: '',
                        jsonPath: '$.data.missing',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
        });

        it('validates json_path_equals', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'ID equals 123',
                        category: 'body',
                        operator: 'json_path_equals',
                        value: '123',
                        jsonPath: '$.data.id',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('validates json_path_contains', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Name contains Test',
                        category: 'body',
                        operator: 'json_path_contains',
                        value: 'Test',
                        jsonPath: '$.data.name',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles JSON path with array access', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Array element exists',
                        category: 'body',
                        operator: 'json_path_exists',
                        value: '',
                        jsonPath: '$.items[0].name',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse({
                body: '{"items":[{"name":"first"},{"name":"second"}]}'
            });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles JSON path with leading dot notation', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Path without $.',
                        category: 'body',
                        operator: 'json_path_exists',
                        value: '',
                        jsonPath: 'data.id',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('handles invalid JSON for JSON path', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'JSON path on invalid JSON',
                        category: 'body',
                        operator: 'json_path_exists',
                        value: '',
                        jsonPath: '$.data.id',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse({ body: 'not json' });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
            expect(result.results[0].message).toContain('error');
        });
    });

    describe('JSON schema validation', () => {
        it('validates json_schema_matches with valid schema', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Schema matches',
                        category: 'body',
                        operator: 'json_schema_matches',
                        value: '{"type":"object"}',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });

        it('fails when schema is invalid JSON', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Invalid schema',
                        category: 'body',
                        operator: 'json_schema_matches',
                        value: 'not json',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(false);
        });
    });

    describe('string operators', () => {
        it('validates contains operator', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Body contains success',
                        category: 'body',
                        operator: 'contains',
                        value: 'success',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const response = createMockResponse();
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });
    });

    describe('base64 encoded bodies', () => {
        it('decodes base64 encoded body before validation', () => {
            const validation: RequestValidation = {
                enabled: true,
                rules: [{
                    rule: {
                        id: 'body-1',
                        name: 'Body contains success',
                        category: 'body',
                        operator: 'contains',
                        value: 'success',
                        enabled: true
                    } as BodyValidationRule
                }]
            };

            const encodedBody = Buffer.from('{"message":"success"}').toString('base64');
            const response = createMockResponse({
                body: encodedBody,
                is_encoded: true
            });
            const result = executeValidation(validation, response, globalRules, envVars);

            expect(result.allPassed).toBe(true);
        });
    });
});

// ============================================================================
// Time Validation Tests
// ============================================================================

describe('Time Validation Rules', () => {
    const envVars = new Map<string, string>();
    const globalRules = new Map<string, GlobalValidationRule>();

    it('validates less_than operator', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'time-1',
                    name: 'Response under 200ms',
                    category: 'time',
                    operator: 'less_than',
                    value: 200,
                    enabled: true
                } as TimeValidationRule
            }]
        };

        const response = createMockResponse({ elapsedTime: 150 });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
        expect(result.results[0].message).toContain('200ms');
    });

    it('validates greater_than operator', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'time-1',
                    name: 'Response over 100ms',
                    category: 'time',
                    operator: 'greater_than',
                    value: 100,
                    enabled: true
                } as TimeValidationRule
            }]
        };

        const response = createMockResponse({ elapsedTime: 150 });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
    });

    it('validates between operator', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'time-1',
                    name: 'Response between 100-200ms',
                    category: 'time',
                    operator: 'between',
                    value: 100,
                    value2: 200,
                    enabled: true
                } as TimeValidationRule
            }]
        };

        const response = createMockResponse({ elapsedTime: 150 });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
        expect(result.results[0].expected).toContain('100ms - 200ms');
    });

    it('resolves environment variables in time values', () => {
        const envVars = new Map([['MAX_TIME', '1000']]);
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'time-1',
                    name: 'Time under env var',
                    category: 'time',
                    operator: 'less_than',
                    value: '{{MAX_TIME}}' as any,
                    enabled: true
                } as TimeValidationRule
            }]
        };

        const response = createMockResponse({ elapsedTime: 150 });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
    });
});

// ============================================================================
// Global Rule References Tests
// ============================================================================

describe('Global Rule References', () => {
    it('resolves rule by ruleId from global rules', () => {
        const globalRules = createGlobalRulesMap([
            createGlobalRule({
                id: 'global-status-rule',
                name: 'Status is 200',
                category: 'status',
                operator: 'equals',
                value: 200,
                enabled: true
            })
        ]);

        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                ruleId: 'global-status-rule'
            }]
        };

        const response = createMockResponse({ status: 200 });
        const result = executeValidation(validation, response, globalRules, new Map());

        expect(result.allPassed).toBe(true);
        expect(result.results[0].ruleName).toBe('Status is 200');
    });

    it('handles missing global rule reference', () => {
        const globalRules = new Map<string, GlobalValidationRule>();

        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                ruleId: 'non-existent-rule'
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, new Map());

        expect(result.allPassed).toBe(false);
        expect(result.results[0].error).toBe('Rule not found');
    });

    it('prefers inline rule over ruleId', () => {
        const globalRules = createGlobalRulesMap([
            createGlobalRule({
                id: 'global-rule',
                name: 'Global Rule',
                category: 'status',
                operator: 'equals',
                value: 404,
                enabled: true
            })
        ]);

        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                ruleId: 'global-rule',
                rule: {
                    id: 'inline-rule',
                    name: 'Inline Rule',
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    enabled: true
                } as StatusValidationRule
            }]
        };

        const response = createMockResponse({ status: 200 });
        const result = executeValidation(validation, response, globalRules, new Map());

        expect(result.allPassed).toBe(true);
        expect(result.results[0].ruleName).toBe('Inline Rule');
    });
});

// ============================================================================
// Validation Execution Tests
// ============================================================================

describe('executeValidation', () => {
    const envVars = new Map<string, string>();
    const globalRules = new Map<string, GlobalValidationRule>();

    it('returns empty result when validation is undefined', () => {
        const response = createMockResponse();
        const result = executeValidation(undefined, response, globalRules, envVars);

        expect(result.enabled).toBe(false);
        expect(result.totalRules).toBe(0);
        expect(result.allPassed).toBe(true);
    });

    it('returns empty result when validation is disabled', () => {
        const validation: RequestValidation = {
            enabled: false,
            rules: []
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.enabled).toBe(false);
        expect(result.totalRules).toBe(0);
    });

    it('skips disabled rules', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'status-1',
                    name: 'Disabled rule',
                    category: 'status',
                    operator: 'equals',
                    value: 404,
                    enabled: false
                } as StatusValidationRule
            }]
        };

        const response = createMockResponse({ status: 200 });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
        expect(result.results[0].passed).toBe(true);
        expect(result.results[0].message).toContain('disabled');
    });

    it('executes multiple rules and aggregates results', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [
                {
                    rule: {
                        id: 'status-1',
                        name: 'Status is 200',
                        category: 'status',
                        operator: 'equals',
                        value: 200,
                        enabled: true
                    } as StatusValidationRule
                },
                {
                    rule: {
                        id: 'header-1',
                        name: 'Content-Type exists',
                        category: 'header',
                        headerName: 'content-type',
                        operator: 'exists',
                        value: '',
                        enabled: true
                    } as HeaderValidationRule
                },
                {
                    rule: {
                        id: 'time-1',
                        name: 'Response under 200ms',
                        category: 'time',
                        operator: 'less_than',
                        value: 200,
                        enabled: true
                    } as TimeValidationRule
                }
            ]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.totalRules).toBe(3);
        expect(result.passedRules).toBe(3);
        expect(result.failedRules).toBe(0);
        expect(result.allPassed).toBe(true);
    });

    it('handles mix of passing and failing rules', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [
                {
                    rule: {
                        id: 'status-1',
                        name: 'Status is 200',
                        category: 'status',
                        operator: 'equals',
                        value: 200,
                        enabled: true
                    } as StatusValidationRule
                },
                {
                    rule: {
                        id: 'status-2',
                        name: 'Status is 404',
                        category: 'status',
                        operator: 'equals',
                        value: 404,
                        enabled: true
                    } as StatusValidationRule
                }
            ]
        };

        const response = createMockResponse({ status: 200 });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.totalRules).toBe(2);
        expect(result.passedRules).toBe(1);
        expect(result.failedRules).toBe(1);
        expect(result.allPassed).toBe(false);
    });

    it('includes executedAt timestamp', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'status-1',
                    name: 'Status is 200',
                    category: 'status',
                    operator: 'equals',
                    value: 200,
                    enabled: true
                } as StatusValidationRule
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.executedAt).toBeDefined();
        expect(new Date(result.executedAt!).getTime()).toBeGreaterThan(0);
    });

    it('handles rule evaluation errors gracefully', () => {
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'unknown-1',
                    name: 'Unknown category',
                    category: 'unknown' as any,
                    operator: 'equals',
                    value: 200,
                    enabled: true
                } as any
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(false);
        expect(result.results[0].error).toBeDefined();
    });
});

// ============================================================================
// Environment Variable Resolution Tests
// ============================================================================

describe('Environment Variable Resolution', () => {
    const globalRules = new Map<string, GlobalValidationRule>();

    it('resolves variables in header names', () => {
        const envVars = new Map([['HEADER_NAME', 'x-custom-header']]);
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'header-1',
                    name: 'Dynamic header name',
                    category: 'header',
                    headerName: '{{HEADER_NAME}}',
                    operator: 'exists',
                    value: '',
                    enabled: true
                } as HeaderValidationRule
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
    });

    it('resolves variables in header values', () => {
        const envVars = new Map([['EXPECTED_VALUE', 'test-value']]);
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'header-1',
                    name: 'Dynamic header value',
                    category: 'header',
                    headerName: 'x-custom-header',
                    operator: 'equals',
                    value: '{{EXPECTED_VALUE}}',
                    enabled: true
                } as HeaderValidationRule
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
    });

    it('resolves variables in JSON paths', () => {
        const envVars = new Map([['PATH', '$.data.id']]);
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'body-1',
                    name: 'Dynamic JSON path',
                    category: 'body',
                    operator: 'json_path_exists',
                    value: '',
                    jsonPath: '{{PATH}}',
                    enabled: true
                } as BodyValidationRule
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
    });

    it('handles missing environment variables gracefully', () => {
        const envVars = new Map<string, string>();
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'header-1',
                    name: 'Missing env var',
                    category: 'header',
                    headerName: '{{MISSING_VAR}}',
                    operator: 'exists',
                    value: '',
                    enabled: true
                } as HeaderValidationRule
            }]
        };

        const response = createMockResponse();
        const result = executeValidation(validation, response, globalRules, envVars);

        // Should fail because {{MISSING_VAR}} is not resolved
        expect(result.allPassed).toBe(false);
    });

    it('resolves multiple variables in single value', () => {
        const envVars = new Map([
            ['PROTOCOL', 'http'],
            ['DOMAIN', 'api.example.com']
        ]);
        const validation: RequestValidation = {
            enabled: true,
            rules: [{
                rule: {
                    id: 'body-1',
                    name: 'Multiple vars',
                    category: 'body',
                    operator: 'contains',
                    value: '{{PROTOCOL}}://{{DOMAIN}}',
                    enabled: true
                } as BodyValidationRule
            }]
        };

        const response = createMockResponse({
            body: 'Visit http://api.example.com for more info'
        });
        const result = executeValidation(validation, response, globalRules, envVars);

        expect(result.allPassed).toBe(true);
    });
});
