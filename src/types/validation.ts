/**
 * Validation Types for Wave Client
 * These types define the validation rule system for HTTP response assertions.
 */

// ============================================================================
// Validation Rule Categories
// ============================================================================

/**
 * Categories of validation rules
 */
export type ValidationRuleCategory = 'status' | 'header' | 'body' | 'time';

// ============================================================================
// Operator Types
// ============================================================================

/**
 * Numeric comparison operators
 */
export type NumericOperator = 
    | 'equals' 
    | 'not_equals' 
    | 'greater_than' 
    | 'greater_than_or_equal' 
    | 'less_than' 
    | 'less_than_or_equal' 
    | 'between' 
    | 'in' 
    | 'not_in';

/**
 * Status code specific operators (includes numeric operators plus status-specific ones)
 */
export type StatusOperator = 
    | NumericOperator
    | 'is_success'
    | 'is_not_success';

/**
 * String comparison operators
 */
export type StringOperator = 
    | 'equals' 
    | 'not_equals' 
    | 'contains' 
    | 'not_contains' 
    | 'starts_with' 
    | 'ends_with' 
    | 'matches_regex'
    | 'in'
    | 'not_in';

/**
 * Existence operators
 */
export type ExistenceOperator = 'exists' | 'not_exists';

/**
 * Body-specific operators
 */
export type BodyOperator = 
    | StringOperator 
    | 'is_json' 
    | 'is_xml' 
    | 'is_html'
    | 'json_path_equals'
    | 'json_path_contains'
    | 'json_path_exists'
    | 'json_schema_matches';

// ============================================================================
// Validation Rule Types
// ============================================================================

/**
 * Base validation rule interface - common properties for all rule types
 */
export interface BaseValidationRule {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    category: ValidationRuleCategory;
}

/**
 * Status code validation rule
 * Examples:
 * - Status equals 200
 * - Status is between 200 and 299
 * - Status is in (200, 201, 204)
 */
export interface StatusValidationRule extends BaseValidationRule {
    category: 'status';
    operator: StatusOperator;
    value: number;           // Primary value (for equals, greater_than, etc.)
    value2?: number;         // Secondary value (for 'between' operator)
    values?: number[];       // Multiple values (for 'in', 'not_in' operators)
}

/**
 * Header validation rule
 * Examples:
 * - Header 'Content-Type' exists
 * - Header 'Content-Type' equals 'application/json'
 * - Header 'X-Custom' contains 'value'
 */
export interface HeaderValidationRule extends BaseValidationRule {
    category: 'header';
    headerName: string;      // Name of the header to validate
    operator: StringOperator | ExistenceOperator;
    value?: string;          // Expected value (not needed for existence checks)
    values?: string[];       // Multiple values (for 'in', 'not_in' operators)
    caseSensitive?: boolean; // Whether comparison is case-sensitive (default: false)
}

/**
 * Body validation rule
 * Examples:
 * - Body contains 'success'
 * - Body is valid JSON
 * - JSON path '$.data.id' equals '123'
 * - Body matches JSON schema
 */
export interface BodyValidationRule extends BaseValidationRule {
    category: 'body';
    operator: BodyOperator;
    value?: string;          // Expected value, JSON path expression, or schema
    jsonPath?: string;       // JSON path for json_path_* operators
    caseSensitive?: boolean; // Whether comparison is case-sensitive (default: false)
}

/**
 * Response time validation rule
 * Examples:
 * - Response time is less than 1000ms
 * - Response time is between 100ms and 500ms
 */
export interface TimeValidationRule extends BaseValidationRule {
    category: 'time';
    operator: NumericOperator;
    value: number;           // Time in milliseconds
    value2?: number;         // Secondary value (for 'between' operator)
}

/**
 * Union type for all validation rules
 */
export type ValidationRule = 
    | StatusValidationRule 
    | HeaderValidationRule 
    | BodyValidationRule 
    | TimeValidationRule;

// ============================================================================
// Validation Rule Reference (for requests)
// ============================================================================

/**
 * Reference to a validation rule - can be inline or a reference to global store
 */
export interface ValidationRuleRef {
    /** Reference to a global rule by ID (mutually exclusive with 'rule') */
    ruleId?: string;
    /** Inline rule definition (mutually exclusive with 'ruleId') */
    rule?: ValidationRule;
}

/**
 * Request-level validation configuration
 */
export interface RequestValidation {
    enabled: boolean;
    rules: ValidationRuleRef[];
}

// ============================================================================
// Validation Results
// ============================================================================

/**
 * Result of a single validation rule execution
 */
export interface ValidationRuleResult {
    ruleId: string;
    ruleName: string;
    category: ValidationRuleCategory;
    passed: boolean;
    message: string;         // Human-readable result message
    expected?: string;       // What was expected
    actual?: string;         // What was actually received
    error?: string;          // Error message if rule execution failed
}

/**
 * Overall validation results for a response
 */
export interface ValidationResult {
    enabled: boolean;        // Whether validation was enabled
    totalRules: number;      // Total number of rules executed
    passedRules: number;     // Number of rules that passed
    failedRules: number;     // Number of rules that failed
    allPassed: boolean;      // Convenience flag: true if all rules passed
    results: ValidationRuleResult[];
    executedAt: string;      // ISO timestamp when validation was executed
}

// ============================================================================
// Global Validation Store Types
// ============================================================================

/**
 * Entry in the global validation rules store
 * Extends BaseValidationRule with timestamp metadata
 */
export interface GlobalValidationRule extends BaseValidationRule {
    createdAt: string;       // ISO timestamp
    updatedAt: string;       // ISO timestamp
    // Rule-specific fields - mirrored from specific rule types
    operator: string;        // The operator type (stored as string for flexibility)
    value?: number | string; // Primary value
    value2?: number;         // Secondary value (for 'between' operator)
    values?: (number | string)[]; // Multiple values (for 'in', 'not_in' operators)
    headerName?: string;     // For header rules
    jsonPath?: string;       // For body rules with JSON path
    caseSensitive?: boolean; // For header/body string comparisons
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a rule is a status validation rule
 */
export function isStatusRule(rule: ValidationRule): rule is StatusValidationRule {
    return rule.category === 'status';
}

/**
 * Type guard to check if a rule is a header validation rule
 */
export function isHeaderRule(rule: ValidationRule): rule is HeaderValidationRule {
    return rule.category === 'header';
}

/**
 * Type guard to check if a rule is a body validation rule
 */
export function isBodyRule(rule: ValidationRule): rule is BodyValidationRule {
    return rule.category === 'body';
}

/**
 * Type guard to check if a rule is a time validation rule
 */
export function isTimeRule(rule: ValidationRule): rule is TimeValidationRule {
    return rule.category === 'time';
}

/**
 * Type guard to check if a ValidationRuleRef is a reference to a global rule
 */
export function isRuleReference(ref: ValidationRuleRef): boolean {
    return ref.ruleId !== undefined && ref.rule === undefined;
}

/**
 * Type guard to check if a ValidationRuleRef is an inline rule
 */
export function isInlineRule(ref: ValidationRuleRef): boolean {
    return ref.rule !== undefined;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new empty status validation rule
 */
export function createEmptyStatusRule(id: string): StatusValidationRule {
    return {
        id,
        name: 'New Status Rule',
        enabled: true,
        category: 'status',
        operator: 'equals',
        value: 200
    };
}

/**
 * Creates a new empty header validation rule
 */
export function createEmptyHeaderRule(id: string): HeaderValidationRule {
    return {
        id,
        name: 'New Header Rule',
        enabled: true,
        category: 'header',
        headerName: '',
        operator: 'exists'
    };
}

/**
 * Creates a new empty body validation rule
 */
export function createEmptyBodyRule(id: string): BodyValidationRule {
    return {
        id,
        name: 'New Body Rule',
        enabled: true,
        category: 'body',
        operator: 'contains',
        value: ''
    };
}

/**
 * Creates a new empty time validation rule
 */
export function createEmptyTimeRule(id: string): TimeValidationRule {
    return {
        id,
        name: 'New Time Rule',
        enabled: true,
        category: 'time',
        operator: 'less_than',
        value: 1000
    };
}

/**
 * Creates an empty validation result
 */
export function createEmptyValidationResult(): ValidationResult {
    return {
        enabled: false,
        totalRules: 0,
        passedRules: 0,
        failedRules: 0,
        allPassed: true,
        results: [],
        executedAt: new Date().toISOString()
    };
}
