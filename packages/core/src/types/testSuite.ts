/**
 * Test Suite Types for Wave Client
 * 
 * Test Lab is a feature for creating and running test suites - collections of
 * HTTP requests and flows that can be executed together with configurable
 * concurrency, delay, and environment settings.
 * 
 * Test suites support:
 * - Running individual requests from collections
 * - Running complete flows
 * - Configurable run settings (concurrency, delay)
 * - Per-item and per-suite validation
 * - Detailed result tracking
 */

import type { HttpResponseResult } from './adapters';
import type { FlowRunResult, FlowNodeResult } from './flow';
import type { RequestValidation, ValidationResult } from './validation';
import type { HeaderRow, ParamRow } from './collection';

// ============================================================================
// Test Case Types (Data-Driven Testing)
// ============================================================================

/**
 * Data overrides for a single test case
 * All fields are optional - only provided fields override the base request
 */
export interface TestCaseData {
    /** 
     * Variable substitutions for {{variable}} syntax
     * These override environment variables with the same name
     */
    variables?: Record<string, string>;
    /** 
     * Header overrides (merged with base request headers)
     * Can add new headers or override existing ones by key
     */
    headers?: HeaderRow[];
    /** 
     * Query param overrides (merged with base request params)
     * Can add new params or override existing ones by key
     */
    params?: ParamRow[];
    /** 
     * Body content override (replaces entire body)
     * Use JSON string for raw body; supports {{variable}} substitution
     */
    body?: string;
    /** 
     * Auth profile override for this test case
     * If not set, uses test item's auth or suite's defaultAuthId
     */
    authId?: string;
}

/**
 * A single test case within a request test item
 * Represents one scenario/data combination for data-driven testing
 */
export interface TestCase {
    /** Unique identifier for this test case */
    id: string;
    /** Display name (e.g., "Valid user", "Invalid credentials") */
    name: string;
    /** Optional description of what this case tests */
    description?: string;
    /** Whether this test case is enabled for running */
    enabled: boolean;
    /** Order within the test item's test cases */
    order: number;
    /** Data overrides for this test case */
    data: TestCaseData;
    /** 
     * Validation rules specific to this test case
     * Overrides the item-level validation when provided
     */
    validation?: RequestValidation;
}

// ============================================================================
// Test Item Types
// ============================================================================

/**
 * Type discriminator for test items
 */
export type TestItemType = 'request' | 'flow';

/**
 * Base interface for test items
 */
export interface TestItemBase {
    /** Unique identifier for this test item within the suite */
    id: string;
    /** Display name (can be customized, defaults to request/flow name) */
    name: string;
    /** Type discriminator */
    type: TestItemType;
    /** Order in the test suite (for sequential execution) */
    order: number;
    /** Whether this item is enabled for running */
    enabled: boolean;
}

/**
 * Test item referencing a collection request
 * referenceId format: "collectionFilename:requestId" or just "requestId"
 */
export interface RequestTestItem extends TestItemBase {
    type: 'request';
    /** Reference to collection request (collectionFilename:requestId format or just requestId) */
    referenceId: string;
    /** Optional validation override (if not set, uses request's own validation) */
    validation?: RequestValidation;
    /** 
     * Test cases for data-driven testing
     * If empty or undefined, the request runs once with default data
     * If populated, the request runs once per enabled test case
     */
    testCases?: TestCase[];
}

/**
 * Test item referencing a flow
 */
export interface FlowTestItem extends TestItemBase {
    type: 'flow';
    /** Reference to flow by ID */
    referenceId: string;
}

/**
 * Union type for all test items
 */
export type TestItem = RequestTestItem | FlowTestItem;

// ============================================================================
// Test Suite Types
// ============================================================================

/**
 * Run settings for a test suite
 */
export interface TestSuiteSettings {
    /** Number of concurrent requests (for request items only) */
    concurrentCalls: number;
    /** Delay between batches in milliseconds */
    delayBetweenCalls: number;
    /** Whether to stop on first failure */
    stopOnFailure: boolean;
}

/**
 * Default settings for new test suites
 */
export const DEFAULT_TEST_SUITE_SETTINGS: TestSuiteSettings = {
    concurrentCalls: 1,
    delayBetweenCalls: 0,
    stopOnFailure: false,
};

/**
 * Main TestSuite type - represents a complete test suite definition
 */
export interface TestSuite {
    /** Unique identifier for this test suite */
    id: string;
    /** User-defined name */
    name: string;
    /** Optional description */
    description?: string;
    /** Test items (requests and flows) in this suite */
    items: TestItem[];
    /** Default environment ID for variable resolution */
    defaultEnvId?: string;
    /** Default auth configuration ID for requests */
    defaultAuthId?: string;
    /** Run settings */
    settings: TestSuiteSettings;
    /** Creation timestamp */
    createdAt: string;
    /** Last update timestamp */
    updatedAt: string;
}

// ============================================================================
// Test Execution Types
// ============================================================================

/**
 * Status of a test suite run
 */
export type TestSuiteRunStatus = 
    | 'idle'      // Not started
    | 'running'   // In progress
    | 'success'   // All tests passed
    | 'failed'    // At least one test failed
    | 'cancelled'; // User cancelled

/**
 * Status of an individual test item during execution
 */
export type TestItemStatus = 
    | 'idle'      // Not yet processed
    | 'pending'   // Waiting to execute
    | 'running'   // Currently executing
    | 'success'   // Completed successfully
    | 'failed'    // Failed (error or validation failure)
    | 'skipped';  // Skipped (disabled or stopOnFailure triggered)

/**
 * Validation status for a test item
 */
export type TestValidationStatus = 'idle' | 'pending' | 'pass' | 'fail';

/**
 * Result of a single test case execution within a request test item
 */
export interface TestCaseResult {
    /** Test case ID */
    testCaseId: string;
    /** Test case name for display */
    testCaseName: string;
    /** Execution status */
    status: TestItemStatus;
    /** Validation status */
    validationStatus: TestValidationStatus;
    /** HTTP response if request was executed */
    response?: HttpResponseResult;
    /** Error message if failed */
    error?: string;
    /** Execution start time */
    startedAt: string;
    /** Execution end time */
    completedAt: string;
}

/**
 * Result of a single request test item execution
 * 
 * When the item has test cases:
 * - testCaseResults contains per-case results
 * - status/validationStatus/response are aggregated or from the last case
 * 
 * When no test cases (single run):
 * - testCaseResults is empty or undefined
 * - status/validationStatus/response reflect the single execution
 */
export interface RequestTestItemResult {
    /** Test item ID */
    itemId: string;
    /** Item type */
    type: 'request';
    /** Execution status (aggregated: failed if any case failed) */
    status: TestItemStatus;
    /** Validation status (aggregated: fail if any case failed) */
    validationStatus: TestValidationStatus;
    /** HTTP response if request was executed (last or single response) */
    response?: HttpResponseResult;
    /** Error message if failed */
    error?: string;
    /** Execution start time */
    startedAt?: string;
    /** Execution end time */
    completedAt?: string;
    /** 
     * Results for each test case (keyed by testCaseId)
     * Only populated when the item has test cases defined
     */
    testCaseResults?: Map<string, TestCaseResult>;
}

/**
 * Result of a single flow test item execution
 */
export interface FlowTestItemResult {
    /** Test item ID */
    itemId: string;
    /** Item type */
    type: 'flow';
    /** Execution status */
    status: TestItemStatus;
    /** Validation status (derived from flow node validations) */
    validationStatus: TestValidationStatus;
    /** Flow run result containing all node results */
    flowResult?: FlowRunResult;
    /** Error message if failed */
    error?: string;
    /** Execution start time */
    startedAt?: string;
    /** Execution end time */
    completedAt?: string;
}

/**
 * Union type for all test item results
 */
export type TestItemResult = RequestTestItemResult | FlowTestItemResult;

/**
 * Result of a complete test suite run
 */
export interface TestSuiteRunResult {
    /** Test suite ID */
    suiteId: string;
    /** Overall run status */
    status: TestSuiteRunStatus;
    /** Results for each test item (keyed by itemId) */
    itemResults: Map<string, TestItemResult>;
    /** Run start time */
    startedAt: string;
    /** Run completion time */
    completedAt?: string;
    /** Overall error message if suite run failed */
    error?: string;
    /** Progress tracking */
    progress: {
        total: number;
        completed: number;
        passed: number;
        failed: number;
        skipped: number;
    };
    /** Average response time across all completed requests */
    averageTime: number;
}

// ============================================================================
// Test Suite State (for React hooks)
// ============================================================================

/**
 * State managed by useTestSuiteRunner hook
 */
export interface TestSuiteRunState {
    /** Whether a test suite is currently running */
    isRunning: boolean;
    /** Current run result (updated as tests progress) */
    result: TestSuiteRunResult | null;
    /** Currently running test item IDs */
    runningItemIds: Set<string>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a test item is a request
 */
export function isRequestTestItem(item: TestItem): item is RequestTestItem {
    return item.type === 'request';
}

/**
 * Check if a test item is a flow
 */
export function isFlowTestItem(item: TestItem): item is FlowTestItem {
    return item.type === 'flow';
}

/**
 * Check if a test item result is for a request
 */
export function isRequestTestItemResult(result: TestItemResult): result is RequestTestItemResult {
    return result.type === 'request';
}

/**
 * Check if a test item result is for a flow
 */
export function isFlowTestItemResult(result: TestItemResult): result is FlowTestItemResult {
    return result.type === 'flow';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty test suite run result
 */
export function createEmptyTestSuiteRunResult(suiteId: string): TestSuiteRunResult {
    return {
        suiteId,
        status: 'idle',
        itemResults: new Map(),
        startedAt: new Date().toISOString(),
        progress: {
            total: 0,
            completed: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
        },
        averageTime: 0,
    };
}

/**
 * Create a new test item for a request
 */
export function createRequestTestItem(
    referenceId: string,
    name: string,
    order: number
): RequestTestItem {
    return {
        id: `test-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        type: 'request',
        referenceId,
        order,
        enabled: true,
    };
}

/**
 * Create a new test item for a flow
 */
export function createFlowTestItem(
    referenceId: string,
    name: string,
    order: number
): FlowTestItem {
    return {
        id: `test-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        type: 'flow',
        referenceId,
        order,
        enabled: true,
    };
}

/**
 * Create a new empty test suite
 */
export function createNewTestSuite(name: string): TestSuite {
    const now = new Date().toISOString();
    return {
        id: `test-suite-${Date.now()}`,
        name,
        items: [],
        settings: { ...DEFAULT_TEST_SUITE_SETTINGS },
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * Create a new test case with default values
 */
export function createTestCase(name: string, order: number): TestCase {
    return {
        id: `test-case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        enabled: true,
        order,
        data: {},
    };
}

/**
 * Create a test case with initial data
 */
export function createTestCaseWithData(
    name: string, 
    order: number, 
    data: TestCaseData
): TestCase {
    return {
        id: `test-case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        enabled: true,
        order,
        data,
    };
}

/**
 * Create an empty test case result
 */
export function createEmptyTestCaseResult(
    testCaseId: string, 
    testCaseName: string
): TestCaseResult {
    return {
        testCaseId,
        testCaseName,
        status: 'idle',
        validationStatus: 'idle',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
    };
}
