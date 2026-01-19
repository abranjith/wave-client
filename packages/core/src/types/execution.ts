/**
 * Shared Execution Types
 * 
 * Common types used across all runner implementations (Collection, Flow, TestSuite).
 * These types provide a unified interface for execution status, progress tracking,
 * and configuration.
 */

import type { HttpResponseResult } from './adapters';
import type { ValidationResult } from './validation';

// ============================================================================
// Status Types
// ============================================================================

/**
 * Unified execution status for items (requests, flows, nodes)
 */
export type ExecutionStatus = 
    | 'idle'      // Not yet started
    | 'pending'   // Queued for execution
    | 'running'   // Currently executing
    | 'success'   // Completed successfully (HTTP 2xx)
    | 'failed'    // Failed (error or non-2xx status)
    | 'skipped'   // Skipped (disabled, condition not met, or stopOnFailure triggered)
    | 'cancelled'; // User cancelled

/**
 * Validation status for items
 * Default is 'idle' when no validation rules are defined
 */
export type ValidationStatus = 'idle' | 'pending' | 'pass' | 'fail';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for batch execution
 */
export interface ExecutionConfig {
    /** Number of concurrent items to execute (default: 1) */
    concurrentCalls: number;
    /** Delay in milliseconds between batches (default: 0) */
    delayBetweenCalls: number;
    /** Whether to stop execution on first failure (default: false) */
    stopOnFailure?: boolean;
}

/**
 * Default execution configuration
 */
export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
    concurrentCalls: 1,
    delayBetweenCalls: 0,
    stopOnFailure: false,
};

// ============================================================================
// Progress Types
// ============================================================================

/**
 * Progress tracking for batch execution
 */
export interface ExecutionProgress {
    /** Total number of items to execute */
    total: number;
    /** Number of completed items (success + failed + skipped) */
    completed: number;
    /** Number of successfully completed items */
    passed: number;
    /** Number of failed items */
    failed: number;
    /** Number of skipped items */
    skipped: number;
}

/**
 * Creates an initial empty progress object
 */
export function createInitialProgress(total: number): ExecutionProgress {
    return {
        total,
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
    };
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Base result interface for any executed item
 */
export interface ExecutionResultBase {
    /** Unique identifier of the executed item */
    id: string;
    /** Execution status */
    status: ExecutionStatus;
    /** Validation status (idle when no validation rules) */
    validationStatus: ValidationStatus;
    /** HTTP response if request was executed */
    response?: HttpResponseResult;
    /** Error message if failed */
    error?: string;
    /** Execution start time (ISO string) */
    startedAt?: string;
    /** Execution end time (ISO string) */
    completedAt?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determines execution status from HTTP response
 */
export function determineExecutionStatus(
    response: HttpResponseResult | null | undefined,
    error?: string
): ExecutionStatus {
    if (error) {
        return 'failed';
    }
    if (!response) {
        return 'failed';
    }
    return (response.status >= 200 && response.status < 400) ? 'success' : 'failed';
}

/**
 * Determines validation status from validation result
 * Returns 'idle' when no validation rules were defined
 */
export function determineValidationStatus(
    validationResult?: ValidationResult
): ValidationStatus {
    if (!validationResult) {
        return 'idle';
    }
    return validationResult.allPassed ? 'pass' : 'fail';
}

/**
 * Extracts error message from unknown error
 */
export function extractErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Calculates average time from a collection of results with elapsedTime
 */
export function calculateAverageTime(
    results: Iterable<{ elapsedTime?: number }>
): number {
    let totalTime = 0;
    let count = 0;
    
    for (const r of results) {
        if (r.elapsedTime) {
            totalTime += r.elapsedTime;
            count++;
        }
    }
    
    return count > 0 ? Math.round(totalTime / count) : 0;
}

/**
 * Updates progress based on a new result
 */
export function updateProgress(
    progress: ExecutionProgress,
    status: ExecutionStatus,
    validationStatus: ValidationStatus
): ExecutionProgress {
    const isCompleted = status === 'success' || status === 'failed' || status === 'skipped';
    const isPassed = status === 'success' && validationStatus !== 'fail';
    const isFailed = status === 'failed' || validationStatus === 'fail';
    const isSkipped = status === 'skipped';
    
    return {
        ...progress,
        completed: progress.completed + (isCompleted ? 1 : 0),
        passed: progress.passed + (isPassed ? 1 : 0),
        failed: progress.failed + (isFailed ? 1 : 0),
        skipped: progress.skipped + (isSkipped ? 1 : 0),
    };
}
