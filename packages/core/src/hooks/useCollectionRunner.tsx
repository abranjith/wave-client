/**
 * Collection Runner Hook
 * 
 * Manages execution of multiple HTTP requests with concurrency control.
 * Uses the executor pattern for clean separation of concerns:
 * - HttpRequestExecutor: Handles individual request execution with reference lookup
 * - BatchExecutor: Handles concurrency control and delay between batches
 * 
 * This version uses reference-based execution (looks up requests from collections)
 * rather than receiving pre-built request data.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { Environment, Collection } from '../types/collection';
import { Auth } from './store/createAuthSlice';
import { RequestValidation, ValidationResult } from '../types/validation';
import { useHttpAdapter } from './useAdapter';
import { BatchExecutor, BatchItem, ResultStatusExtractor, BatchExecutorCallbacks } from '../utils/batchExecutor';
import { httpRequestExecutor } from '../utils/executors/httpRequestExecutor';
import {
    ExecutionContext,
    HttpExecutionInput,
    HttpExecutionResult,
    RequestOverrides,
} from '../utils/executors/types';
import {
    ExecutionStatus,
    ValidationStatus,
    ExecutionConfig,
    calculateAverageTime,
} from '../types/execution';

// ============================================================================
// Types
// ============================================================================

export type RunStatus = ExecutionStatus;

/**
 * Settings for running a collection
 */
export interface RunSettings {
    concurrentCalls: number;
    delayBetweenCalls: number;
}

/**
 * Input item for collection run (reference-based)
 */
export interface CollectionRunItem extends BatchItem {
    /** Unique ID for tracking this execution */
    id: string;
    /** Reference to the collection request (collectionFilename:requestId or requestId) */
    referenceId: string;
    /** Optional display name (for UI) */
    name?: string;
    /** Optional folder path (for UI grouping) */
    folderPath?: string[];
    /** Item-level validation override */
    validation?: RequestValidation;
    /** Optional overrides for data-driven testing */
    overrides?: RequestOverrides;
}

/**
 * Result of a single request execution
 */
export interface CollectionRunResult {
    /** Request ID */
    requestId: string;
    /** Reference ID used */
    referenceId: string;
    /** Execution status */
    status: RunStatus;
    /** Validation status */
    validationStatus: ValidationStatus;
     /** Validation result */
    validationResult?: ValidationResult;
    /** HTTP response if successful */
    response?: import('../types/adapters').HttpResponseResult;
    /** Error message if failed */
    error?: string;
    /** Elapsed time in milliseconds */
    elapsedTime?: number;
}

/**
 * State of the collection run
 */
export interface CollectionRunState {
    isRunning: boolean;
    results: Map<string, CollectionRunResult>;
    progress: {
        total: number;
        completed: number;
        passed: number;
        failed: number;
    };
    averageTime: number;
}

/**
 * Options for the collection runner hook
 */
export interface UseCollectionRunnerOptions {
    /** Available environments for variable resolution */
    environments: Environment[];
    /** Available auth configurations */
    auths: Auth[];
    /** Available collections for request lookup */
    collections: Collection[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert HttpExecutionResult to CollectionRunResult
 */
function convertToRunResult(execResult: HttpExecutionResult): CollectionRunResult {
    return {
        requestId: execResult.id,
        referenceId: execResult.referenceId,
        status: execResult.status,
        validationStatus: execResult.validationStatus,
        validationResult: execResult.validationResult,
        response: execResult.response,
        error: execResult.error,
        elapsedTime: execResult.response?.elapsedTime,
    };
}

/**
 * Create pending result for initial state
 */
function createPendingResult(item: CollectionRunItem): CollectionRunResult {
    return {
        requestId: item.id,
        referenceId: item.referenceId,
        status: 'pending',
        validationStatus: 'idle',
    };
}

/**
 * Create running result for UI feedback
 */
function createRunningResult(item: CollectionRunItem): CollectionRunResult {
    return {
        requestId: item.id,
        referenceId: item.referenceId,
        status: 'running',
        validationStatus: 'pending',
    };
}

/**
 * Determine if a result is "passed" for progress tracking
 */
function isResultPassed(result: CollectionRunResult): boolean {
    return result.status === 'success' && result.validationStatus !== 'fail';
}

/**
 * Extract status from result for BatchExecutor progress tracking
 */
const extractStatus: ResultStatusExtractor<CollectionRunResult> = (result) => ({
    status: result.status === 'success' ? 'success' :
            result.status === 'failed' ? 'failed' :
            result.status === 'cancelled' ? 'cancelled' :
            result.status === 'skipped' ? 'skipped' : 'failed',
    validationStatus: result.validationStatus,
});

// ============================================================================
// Hook
// ============================================================================

/**
 * Collection runner hook using the executor pattern
 */
export function useCollectionRunner({
    environments,
    auths,
    collections,
}: UseCollectionRunnerOptions) {
    const httpAdapter = useHttpAdapter();
    
    // State
    const [state, setState] = useState<CollectionRunState>({
        isRunning: false,
        results: new Map(),
        progress: { total: 0, completed: 0, passed: 0, failed: 0 },
        averageTime: 0,
    });
    
    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const batchExecutorRef = useRef<BatchExecutor<CollectionRunItem, CollectionRunResult> | null>(null);
    const environmentIdRef = useRef<string | null>(null);
    const defaultAuthIdRef = useRef<string | null>(null);
    
    // Memoize the HTTP executor instance
    const executor = useMemo(() => httpRequestExecutor, []);
    
    /**
     * Create execution context from current refs and dependencies
     */
    const createContext = useCallback((): ExecutionContext => ({
        httpAdapter,
        environments,
        auths,
        collections,
        environmentId: environmentIdRef.current,
        defaultAuthId: defaultAuthIdRef.current,
        isCancelled: () => isCancelledRef.current,
    }), [httpAdapter, environments, auths, collections]);
    
    /**
     * Execute a single item using the HttpRequestExecutor
     */
    const executeItem = useCallback(async (
        item: CollectionRunItem
    ): Promise<CollectionRunResult> => {
        const context = createContext();
        
        const input: HttpExecutionInput = {
            referenceId: item.referenceId,
            executionId: item.id,
            validation: item.validation,
        };
        
        const execResult = await executor.execute(input, context, item.overrides);
        return convertToRunResult(execResult);
    }, [executor, createContext]);
    
    /**
     * Run a collection of items with concurrency control
     */
    const runCollection = useCallback(async (
        items: CollectionRunItem[],
        settings: RunSettings,
        environmentId: string | null,
        defaultAuthId: string | null
    ): Promise<void> => {
        if (items.length === 0) {
            return;
        }
        
        // Reset state
        isCancelledRef.current = false;
        environmentIdRef.current = environmentId;
        defaultAuthIdRef.current = defaultAuthId;
        
        // Initialize results with pending status
        const initialResults = new Map<string, CollectionRunResult>();
        for (const item of items) {
            initialResults.set(item.id, createPendingResult(item));
        }
        
        // Set initial state
        setState({
            isRunning: true,
            results: initialResults,
            progress: {
                total: items.length,
                completed: 0,
                passed: 0,
                failed: 0,
            },
            averageTime: 0,
        });
        
        // Create batch executor
        batchExecutorRef.current = new BatchExecutor<CollectionRunItem, CollectionRunResult>();
        
        // Create config
        const config: ExecutionConfig = {
            concurrentCalls: settings.concurrentCalls,
            delayBetweenCalls: settings.delayBetweenCalls,
            stopOnFailure: false,
        };
        
        // Define callbacks for real-time state updates
        const callbacks: BatchExecutorCallbacks<CollectionRunResult> = {
            onItemStart: (itemId) => {
                setState(prev => {
                    const newResults = new Map(prev.results);
                    const item = items.find(i => i.id === itemId);
                    if (item) {
                        newResults.set(itemId, createRunningResult(item));
                    }
                    return { ...prev, results: newResults };
                });
            },
            onItemComplete: (result) => {
                setState(prev => {
                    const newResults = new Map(prev.results);
                    newResults.set(result.requestId, result);
                    
                    // Calculate new progress
                    const completed = prev.progress.completed + 1;
                    const isPassed = isResultPassed(result);
                    const passed = prev.progress.passed + (isPassed ? 1 : 0);
                    const failed = prev.progress.failed + (!isPassed ? 1 : 0);
                    
                    // Calculate average time from all completed results
                    const avgTime = calculateAverageTime(
                        Array.from(newResults.values()).filter(r => r.elapsedTime !== undefined)
                    );
                    
                    return {
                        ...prev,
                        results: newResults,
                        progress: { ...prev.progress, completed, passed, failed },
                        averageTime: avgTime,
                    };
                });
            },
        };
        
        // Execute all items
        try {
            await batchExecutorRef.current.execute(
                items,
                executeItem,
                config,
                () => isCancelledRef.current,
                extractStatus,
                callbacks
            );
        } finally {
            setState(prev => ({ ...prev, isRunning: false }));
        }
    }, [executeItem]);
    
    /**
     * Cancel the current run
     */
    const cancelRun = useCallback(() => {
        isCancelledRef.current = true;
        
        // Cancel batch executor delay
        batchExecutorRef.current?.cancelDelay();
        
        // Cancel any in-flight requests via adapter
        httpAdapter.cancelRequest?.('*');
        
        setState(prev => ({
            ...prev,
            isRunning: false,
        }));
    }, [httpAdapter]);
    
    /**
     * Reset runner state
     */
    const resetResults = useCallback(() => {
        isCancelledRef.current = false;
        batchExecutorRef.current = null;
        
        setState({
            isRunning: false,
            results: new Map(),
            progress: { total: 0, completed: 0, passed: 0, failed: 0 },
            averageTime: 0,
        });
    }, []);
    
    /**
     * Get result for a specific request
     */
    const getResult = useCallback((requestId: string): CollectionRunResult | undefined => {
        return state.results.get(requestId);
    }, [state.results]);
    
    return {
        ...state,
        runCollection,
        cancelRun,
        resetResults,
        getResult,
    };
}

export default useCollectionRunner;
