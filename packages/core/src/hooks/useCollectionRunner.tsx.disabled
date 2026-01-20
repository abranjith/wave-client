/**
 * Collection Runner Hook
 * Manages execution of multiple HTTP requests with concurrency control.
 * Uses request ID for correlation between requests and responses.
 * 
 * Uses the platform adapter pattern for HTTP execution, making it platform-agnostic.
 * Leverages shared BatchExecutor for concurrency control and delay handling.
 */

import { useState, useCallback, useRef } from 'react';
import { Environment, CollectionRequest } from '../types/collection';
import { HttpRequestConfig, HttpResponseResult } from '../types/adapters';
import { Auth } from './store/createAuthSlice';
import { RequestValidation } from '../types/validation';
import { useHttpAdapter } from './useAdapter';
import { BatchExecutor, BatchItem, ResultStatusExtractor } from '../utils/batchExecutor';
import { buildHttpRequest, CollectionRequestInput } from '../utils/requestBuilder';
import {
    ExecutionStatus,
    ValidationStatus,
    ExecutionConfig,
    determineExecutionStatus,
    determineValidationStatus,
    calculateAverageTime,
} from '../types/execution';

// ==================== Types ====================

export type RunStatus = ExecutionStatus;
export type { ValidationStatus };

export interface RunSettings {
    concurrentCalls: number;
    delayBetweenCalls: number;
}

export interface RunRequestItem extends BatchItem {
    id: string;
    name: string;
    method: string;
    url: string;
    request?: CollectionRequest;
    folderPath: string[];
    validation?: RequestValidation;
}

export interface RunResult {
    requestId: string;
    status: RunStatus;
    validationStatus: ValidationStatus;
    response?: HttpResponseResult;
    error?: string;
    elapsedTime?: number;
}

export interface CollectionRunState {
    isRunning: boolean;
    results: Map<string, RunResult>;
    progress: {
        total: number;
        completed: number;
        passed: number;
        failed: number;
    };
    averageTime: number;
}

interface UseCollectionRunnerOptions {
    environments: Environment[];
    auths: Auth[];
}

// ==================== Helper Functions ====================

/**
 * Create initial result for a request item (pending state)
 */
function createPendingResult(requestId: string): RunResult {
    return {
        requestId,
        status: 'pending',
        validationStatus: 'idle',
    };
}

/**
 * Create running result for a request item
 */
function createRunningResult(requestId: string): RunResult {
    return {
        requestId,
        status: 'running',
        validationStatus: 'pending',
    };
}

/**
 * Create result from HTTP response
 */
function createResultFromResponse(
    requestId: string,
    response: HttpResponseResult | null,
    error?: string
): RunResult {
    return {
        requestId,
        status: determineExecutionStatus(response, error),
        validationStatus: determineValidationStatus(response?.validationResult),
        response: response ?? undefined,
        error,
        elapsedTime: response?.elapsedTime,
    };
}

/**
 * Determine if a result is considered "passed" for progress tracking
 */
function isResultPassed(result: RunResult): boolean {
    return result.status === 'success' && result.validationStatus !== 'fail';
}

/**
 * Extract status from result for batch executor progress tracking
 */
const extractStatus: ResultStatusExtractor<RunResult> = (result) => ({
    status: result.status === 'success' ? 'success' :
            result.status === 'failed' ? 'failed' :
            result.status === 'cancelled' ? 'cancelled' :
            result.status === 'skipped' ? 'skipped' : 'failed',
    validationStatus: result.validationStatus,
});

// ==================== Hook ====================

export function useCollectionRunner({ environments, auths }: UseCollectionRunnerOptions) {
    const httpAdapter = useHttpAdapter();
    
    // State
    const [state, setState] = useState<CollectionRunState>({
        isRunning: false,
        results: new Map(),
        progress: { total: 0, completed: 0, passed: 0, failed: 0 },
        averageTime: 0
    });

    // Refs for tracking active run
    const isCancelledRef = useRef(false);
    const batchExecutorRef = useRef<BatchExecutor<RunRequestItem, RunResult> | null>(null);
    const environmentIdRef = useRef<string | null>(null);
    const defaultAuthIdRef = useRef<string | null>(null);

    /**
     * Execute a single request and return the result
     */
    const executeRequest = useCallback(async (item: RunRequestItem): Promise<RunResult> => {
        if (isCancelledRef.current) {
            return {
                requestId: item.id,
                status: 'cancelled',
                validationStatus: 'idle',
            };
        }

        // Build the request configuration
        const urlObj = item.request?.url;
        const queryParams = typeof urlObj === 'object' && urlObj?.query ? urlObj.query : [];
        
        const input: CollectionRequestInput = {
            id: item.id,
            name: item.name,
            method: item.method,
            url: item.url,
            headers: item.request?.header || [],
            params: queryParams,
            request: item.request
        };

        const buildResult = await buildHttpRequest(
            input,
            environmentIdRef.current,
            environments,
            auths,
            defaultAuthIdRef.current
        );

        if (buildResult.error || !buildResult.request) {
            return createResultFromResponse(
                item.id,
                null,
                buildResult.error || 'Failed to build request'
            );
        }

        // Build the adapter config from the built request
        const config: HttpRequestConfig = {
            id: item.id,
            method: buildResult.request.method,
            url: buildResult.request.url,
            headers: buildResult.request.headers || [],
            params: buildResult.request.params || [],
            body: buildResult.request.body || null,
            auth: buildResult.request.auth,
            envVars: buildResult.request.envVars || {},
            validation: item.validation,
        };

        try {
            const result = await httpAdapter.executeRequest(config);
            
            if (isCancelledRef.current) {
                return {
                    requestId: item.id,
                    status: 'cancelled',
                    validationStatus: 'idle',
                };
            }

            if (result.isOk) {
                return createResultFromResponse(item.id, result.value);
            } else {
                return createResultFromResponse(item.id, null, result.error);
            }
        } catch (error) {
            return createResultFromResponse(
                item.id,
                null,
                error instanceof Error ? error.message : 'Unknown error'
            );
        }
    }, [httpAdapter, environments, auths]);

    // Start collection run
    const runCollection = useCallback(async (
        requests: RunRequestItem[],
        settings: RunSettings,
        environmentId: string | null,
        defaultAuthId: string | null
    ) => {
        if (requests.length === 0) {
            return;
        }

        // Reset state
        isCancelledRef.current = false;
        environmentIdRef.current = environmentId;
        defaultAuthIdRef.current = defaultAuthId;

        // Initialize results with pending status
        const initialResults = new Map<string, RunResult>();
        requests.forEach(req => {
            initialResults.set(req.id, createPendingResult(req.id));
        });

        // Set initial state
        setState({
            isRunning: true,
            results: initialResults,
            progress: {
                total: requests.length,
                completed: 0,
                passed: 0,
                failed: 0
            },
            averageTime: 0
        });

        // Create batch executor
        batchExecutorRef.current = new BatchExecutor<RunRequestItem, RunResult>();

        // Create config
        const config: ExecutionConfig = {
            concurrentCalls: settings.concurrentCalls,
            delayBetweenCalls: settings.delayBetweenCalls,
            stopOnFailure: false,
        };

        // Execute all requests with batch executor
        try {
            await batchExecutorRef.current.execute(
                requests,
                async (item) => {
                    // Update state to show running
                    setState(prev => {
                        const newResults = new Map(prev.results);
                        newResults.set(item.id, createRunningResult(item.id));
                        return { ...prev, results: newResults };
                    });
                    
                    // Execute the request
                    const result = await executeRequest(item);
                    
                    // Update state with result
                    setState(prev => {
                        const newResults = new Map(prev.results);
                        newResults.set(item.id, result);

                        // Calculate new progress
                        const completed = prev.progress.completed + 1;
                        const passed = prev.progress.passed + (isResultPassed(result) ? 1 : 0);
                        const failed = prev.progress.failed + (!isResultPassed(result) ? 1 : 0);

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
                    
                    return result;
                },
                config,
                () => isCancelledRef.current,
                extractStatus
            );
        } finally {
            // Mark as not running when complete
            setState(prev => ({ ...prev, isRunning: false }));
        }
    }, [executeRequest]);

    // Cancel run
    const cancelRun = useCallback(() => {
        isCancelledRef.current = true;
        
        // Cancel batch executor delay
        batchExecutorRef.current?.cancelDelay();
        
        // Cancel any in-flight requests via adapter
        httpAdapter.cancelRequest?.('*');
        
        setState(prev => ({
            ...prev,
            isRunning: false
        }));
    }, [httpAdapter]);

    // Reset results
    const resetResults = useCallback(() => {
        isCancelledRef.current = false;
        batchExecutorRef.current = null;

        setState({
            isRunning: false,
            results: new Map(),
            progress: { total: 0, completed: 0, passed: 0, failed: 0 },
            averageTime: 0
        });
    }, []);

    // Get result for a specific request
    const getResult = useCallback((requestId: string): RunResult | undefined => {
        return state.results.get(requestId);
    }, [state.results]);

    return {
        ...state,
        runCollection,
        cancelRun,
        resetResults,
        getResult
    };
}

export default useCollectionRunner;
