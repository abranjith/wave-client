/**
 * Executor Types and Interfaces
 * 
 * Defines the contract for item executors (HTTP requests, flows) and
 * the execution context that provides dependencies and configuration.
 */

import type { Environment, Collection, HeaderRow, ParamRow, CollectionRequest } from '../../types/collection';
import type { Flow, FlowContext } from '../../types/flow';
import type { HttpResponseResult, IHttpAdapter } from '../../types/adapters';
import type { Auth } from '../../hooks/store/createAuthSlice';
import type { RequestValidation, ValidationResult } from '../../types/validation';
import type { RequestBody } from '../../types/tab';
import type { ExecutionStatus, ValidationStatus } from '../../types/execution';

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Context provided to executors containing dependencies and configuration
 */
export interface ExecutionContext {
    /** HTTP adapter for making requests */
    httpAdapter: IHttpAdapter;
    /** Available environments for variable resolution */
    environments: Environment[];
    /** Available auth configurations */
    auths: Auth[];
    /** Available collections (for request lookup) */
    collections: Collection[];
    /** Current environment ID for variable resolution */
    environmentId: string | null;
    /** Default auth ID for requests without specific auth */
    defaultAuthId: string | null;
    /** Callback to check if execution has been cancelled */
    isCancelled: () => boolean;
    /** Optional flow context for flow variable resolution */
    flowContext?: FlowContext;
    /** Available flows (for flow lookup) */
    flows?: Flow[];
    /** 
     * Initial variables from test case data (for flow test cases).
     * These are merged with env vars at lower priority than flow context outputs.
     * Precedence: flow context (upstream responses) > initialVariables > env vars > global vars
     */
    initialVariables?: Record<string, string>;
}

// ============================================================================
// Request Overrides (for test cases)
// ============================================================================

/**
 * Overrides that can be applied to a request execution
 * Used for data-driven testing in test suites
 */
export interface RequestOverrides {
    /** Header overrides (merged with base request headers) */
    headers?: HeaderRow[];
    /** Query param overrides (merged with base request params) */
    params?: ParamRow[];
    /** Body override (replaces entire body) */
    body?: RequestBody;
    /** Variable substitutions for {{variable}} syntax */
    variables?: Record<string, string>;
    /** Auth profile override */
    authId?: string;
    /** Validation rules override */
    validation?: RequestValidation;
}

// ============================================================================
// Executor Interface
// ============================================================================

/**
 * Generic interface for item executors
 * @template TItem - The type of item to execute (e.g., request reference, flow)
 * @template TResult - The type of result returned (e.g., HttpExecutionResult, FlowExecutionResult)
 */
export interface IItemExecutor<TItem, TResult> {
    /**
     * Executes a single item and returns the result
     * @param item - The item to execute
     * @param context - Execution context with dependencies
     * @param overrides - Optional overrides for the execution
     */
    execute(
        item: TItem,
        context: ExecutionContext,
        overrides?: RequestOverrides
    ): Promise<TResult>;
}

// ============================================================================
// HTTP Executor Types
// ============================================================================

/**
 * Input for HTTP request execution
 */
export interface HttpExecutionInput {
    /** Reference ID to the collection request (collectionFilename:requestId or just requestId) */
    referenceId: string;
    /** Optional custom ID for the execution (for tracking) */
    executionId?: string;
    /** Optional item-level validation override */
    validation?: RequestValidation;
}

/**
 * Result of HTTP request execution
 */
export interface HttpExecutionResult {
    /** Execution ID */
    id: string;
    /** Reference ID to the original request */
    referenceId: string;
    /** Execution status */
    status: ExecutionStatus;
    /** Validation status */
    validationStatus: ValidationStatus;
    /** Validation result */
    validationResult?: ValidationResult;
    /** HTTP response if request was executed */
    response?: HttpResponseResult;
    /** Error message if failed */
    error?: string;
    /** Execution start time */
    startedAt: string;
    /** Execution end time */
    completedAt: string;
}

// ============================================================================
// Flow Executor Types
// ============================================================================

/**
 * Input for flow execution
 */
export interface FlowExecutionInput {
    /** Flow ID to execute */
    flowId: string;
    /** Optional custom ID for the execution */
    executionId?: string;
}

/**
 * Configuration for flow execution
 */
export interface FlowExecutionConfig {
    /** Whether to execute nodes in parallel where possible (default: true) */
    parallel?: boolean;
    /** Default auth ID for requests in the flow */
    defaultAuthId?: string;
    /** 
     * Initial variables to inject at the start of flow execution.
     * Used for test case data-driven testing.
     * Precedence: flow context (upstream responses) > initialVariables > env vars > global vars
     */
    initialVariables?: Record<string, string>;
}

/**
 * Result of flow execution (extends the existing FlowRunResult pattern)
 */
export interface FlowExecutionResult {
    /** Execution ID */
    id: string;
    /** Flow ID */
    flowId: string;
    /** Execution status */
    status: ExecutionStatus;
    /** Validation status (derived from node validations) */
    validationStatus: ValidationStatus;
    /** Detailed flow run result */
    flowRunResult?: import('../../types/flow').FlowRunResult;
    /** Error message if failed */
    error?: string;
    /** Execution start time */
    startedAt: string;
    /** Execution end time */
    completedAt: string;
}

// ============================================================================
// Merge Utilities
// ============================================================================

/**
 * Merges base headers with override headers (case-insensitive key matching)
 */
export function mergeHeadersWithOverrides(
    baseHeaders: HeaderRow[],
    overrideHeaders?: HeaderRow[]
): HeaderRow[] {
    if (!overrideHeaders || overrideHeaders.length === 0) {
        return baseHeaders;
    }
    
    // Create a map of base headers by key (lowercase for case-insensitive matching)
    const headerMap = new Map<string, HeaderRow>();
    for (const h of baseHeaders) {
        headerMap.set(h.key.toLowerCase(), h);
    }
    
    // Apply overrides - override existing or add new
    for (const override of overrideHeaders) {
        const key = override.key.toLowerCase();
        if (headerMap.has(key)) {
            // Override existing header
            const existing = headerMap.get(key)!;
            headerMap.set(key, { ...existing, ...override, key: existing.key });
        } else {
            // Add new header
            headerMap.set(key, override);
        }
    }
    
    return Array.from(headerMap.values());
}

/**
 * Merges base params with override params
 */
export function mergeParamsWithOverrides(
    baseParams: ParamRow[],
    overrideParams?: ParamRow[]
): ParamRow[] {
    if (!overrideParams || overrideParams.length === 0) {
        return baseParams;
    }
    
    // Create a map of base params by key
    const paramMap = new Map<string, ParamRow>();
    for (const p of baseParams) {
        paramMap.set(p.key, p);
    }
    
    // Apply overrides
    for (const override of overrideParams) {
        if (paramMap.has(override.key)) {
            const existing = paramMap.get(override.key)!;
            paramMap.set(override.key, { ...existing, ...override });
        } else {
            paramMap.set(override.key, override);
        }
    }
    
    return Array.from(paramMap.values());
}

/**
 * Merges environment variables with override variables
 * Override variables take precedence
 */
export function mergeEnvVarsWithOverrides(
    envVars: Record<string, string>,
    overrideVars?: Record<string, string>
): Record<string, string> {
    if (!overrideVars) {
        return envVars;
    }
    return { ...envVars, ...overrideVars };
}

/**
 * Extracts URL string and query params from a collection request URL
 */
export function extractUrlParts(
    url: CollectionRequest['url']
): { urlString: string; queryParams: ParamRow[] } {
    const queryParams = typeof url === 'object' && url?.query ? url.query : [];
    const urlString = typeof url === 'string' ? url : url?.raw || '';
    return { urlString, queryParams };
}
