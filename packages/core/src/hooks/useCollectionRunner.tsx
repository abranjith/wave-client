/**
 * Collection Runner Hook
 * Manages execution of multiple HTTP requests with concurrency control.
 * Uses request ID for correlation between requests and responses.
 * 
 * Uses the platform adapter pattern for HTTP execution, making it platform-agnostic.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Environment, CollectionRequest } from '../types/collection';
import { HttpRequestConfig, HttpResponseResult } from '../types/adapters';
import { Auth } from './store/createAuthSlice';
import { buildHttpRequest, CollectionRequestInput } from '../utils/requestBuilder';
import { RequestValidation } from '../types/validation';
import { useHttpAdapter } from './useAdapter';

// ==================== Types ====================

export type RunStatus = 'idle' | 'pending' | 'running' | 'success' | 'error';
export type ValidationStatus = 'idle' | 'pending' | 'pass' | 'fail';

export interface RunSettings {
    concurrentCalls: number;
    delayBetweenCalls: number;
}

export interface RunRequestItem {
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
    const activeRequestIds = useRef<Set<string>>(new Set());
    const pendingQueue = useRef<RunRequestItem[]>([]);
    const runSettingsRef = useRef<RunSettings>({ concurrentCalls: 1, delayBetweenCalls: 0 });
    const environmentIdRef = useRef<string | null>(null);
    const defaultAuthIdRef = useRef<string | null>(null);
    const isCancelledRef = useRef(false);
    const activeCountRef = useRef(0);
    
    // Track current iteration/batch of requests
    const currentIterationIds = useRef<Set<string>>(new Set());
    // Track if we're waiting for delay before next batch
    const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Helper to handle response completion
    const handleResponseComplete = useCallback((
        requestId: string, 
        response: HttpResponseResult | null, 
        error?: string
    ) => {
        activeRequestIds.current.delete(requestId);
        activeCountRef.current = Math.max(0, activeCountRef.current - 1);
        currentIterationIds.current.delete(requestId);

        const isSuccess = response ? (response.status >= 200 && response.status < 400) : false;
        const validationResult = response?.validationResult;
        
        // Determine validation status
        let validationStatus: ValidationStatus = 'idle';
        if (validationResult) {
            validationStatus = validationResult.allPassed ? 'pass' : 'fail';
        }

        setState(prev => {
            const newResults = new Map(prev.results);
            newResults.set(requestId, {
                requestId,
                status: error ? 'error' : (isSuccess ? 'success' : 'error'),
                validationStatus,
                response: response ?? undefined,
                error,
                elapsedTime: response?.elapsedTime
            });

            // Calculate new progress
            const completed = prev.progress.completed + 1;
            const passed = prev.progress.passed + (isSuccess && validationStatus !== 'fail' ? 1 : 0);
            const failed = prev.progress.failed + (!isSuccess || validationStatus === 'fail' || !!error ? 1 : 0);

            // Calculate average time
            let totalTime = 0;
            let timeCount = 0;
            newResults.forEach(r => {
                if (r.elapsedTime) {
                    totalTime += r.elapsedTime;
                    timeCount++;
                }
            });
            const averageTime = timeCount > 0 ? Math.round(totalTime / timeCount) : 0;

            // Check if run is complete
            const isRunning = completed < prev.progress.total;

            return {
                ...prev,
                results: newResults,
                progress: { ...prev.progress, completed, passed, failed },
                averageTime,
                isRunning
            };
        });
    }, []);

    // Effect to detect when current iteration is complete and trigger next batch
    useEffect(() => {
        // Only proceed if:
        // 1. Current iteration is complete (no pending requests in batch)
        // 2. Run is still active
        // 3. There are more items in the queue
        // 4. Not cancelled
        if (
            currentIterationIds.current.size === 0 &&
            state.isRunning &&
            pendingQueue.current.length > 0 &&
            !isCancelledRef.current
        ) {
            const delay = runSettingsRef.current.delayBetweenCalls;
            
            // Clear any existing timer
            if (delayTimerRef.current) {
                clearTimeout(delayTimerRef.current);
                delayTimerRef.current = null;
            }
            
            if (delay > 0) {
                // Apply delay before next batch
                delayTimerRef.current = setTimeout(() => {
                    delayTimerRef.current = null;
                    if (!isCancelledRef.current) {
                        processQueue();
                    }
                }, delay);
            } else {
                // No delay, process immediately
                processQueue();
            }
        }
        
        // Cleanup timer on unmount or when dependencies change
        return () => {
            if (delayTimerRef.current) {
                clearTimeout(delayTimerRef.current);
                delayTimerRef.current = null;
            }
        };
    }, [state.results, state.isRunning]);

    // Process queue with concurrency control
    const processQueue = useCallback(() => {
        if (isCancelledRef.current) {
            return;
        }
        
        // Don't start a new batch if current iteration still has pending requests
        if (currentIterationIds.current.size > 0) {
            return;
        }

        const settings = runSettingsRef.current;
        const batchSize = Math.min(settings.concurrentCalls, pendingQueue.current.length);
        
        // Send batch of requests
        for (let i = 0; i < batchSize; i++) {
            const item = pendingQueue.current.shift();
            if (!item) break;
            
            if (isCancelledRef.current) {
                // Put item back if cancelled during batch creation
                pendingQueue.current.unshift(item);
                break;
            }
            
            // Add to current iteration tracking before sending
            currentIterationIds.current.add(item.id);
            
            // Fire and forget - sendRequest handles its own errors
            sendRequest(item);
        }
    }, []);

    // Send a single request using the HTTP adapter
    const sendRequest = useCallback(async (item: RunRequestItem) => {
        if (isCancelledRef.current) {
            // Remove from iteration tracking if cancelled
            currentIterationIds.current.delete(item.id);
            return;
        }

        // Mark as running
        activeRequestIds.current.add(item.id);
        activeCountRef.current++;

        setState(prev => {
            const newResults = new Map(prev.results);
            newResults.set(item.id, {
                requestId: item.id,
                status: 'running',
                validationStatus: 'pending'
            });
            return { ...prev, results: newResults };
        });

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
            // Build error - mark as failed
            handleResponseComplete(item.id, null, buildResult.error || 'Failed to build request');
            return;
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
            // Execute request via adapter
            const result = await httpAdapter.executeRequest(config);
            
            if (isCancelledRef.current) {
                // Request was cancelled while in flight
                return;
            }

            if (result.isOk) {
                handleResponseComplete(item.id, result.value);
            } else {
                handleResponseComplete(item.id, null, result.error);
            }
        } catch (error) {
            if (!isCancelledRef.current) {
                handleResponseComplete(
                    item.id, 
                    null, 
                    error instanceof Error ? error.message : 'Unknown error'
                );
            }
        }
    }, [httpAdapter, environments, auths, handleResponseComplete]);

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
        activeRequestIds.current.clear();
        activeCountRef.current = 0;
        currentIterationIds.current.clear();
        runSettingsRef.current = settings;
        environmentIdRef.current = environmentId;
        defaultAuthIdRef.current = defaultAuthId;
        
        // Clear any pending delay timer from previous run
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }

        // Initialize results with pending status
        const initialResults = new Map<string, RunResult>();
        requests.forEach(req => {
            initialResults.set(req.id, {
                requestId: req.id,
                status: 'pending',
                validationStatus: 'idle'
            });
        });

        // Set up queue
        pendingQueue.current = [...requests];

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

        // Start processing first batch
        processQueue();
    }, [processQueue]);

    // Cancel run
    const cancelRun = useCallback(() => {
        isCancelledRef.current = true;
        pendingQueue.current = [];
        currentIterationIds.current.clear();
        
        // Cancel any in-flight requests via adapter
        activeRequestIds.current.forEach(id => {
            httpAdapter.cancelRequest?.(id);
        });
        activeRequestIds.current.clear();
        activeCountRef.current = 0;
        
        // Clear any pending delay timer
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }
        
        setState(prev => ({
            ...prev,
            isRunning: false
        }));
    }, [httpAdapter]);

    // Reset results
    const resetResults = useCallback(() => {
        isCancelledRef.current = false;
        activeRequestIds.current.clear();
        activeCountRef.current = 0;
        pendingQueue.current = [];
        currentIterationIds.current.clear();
        
        // Clear any pending delay timer
        if (delayTimerRef.current) {
            clearTimeout(delayTimerRef.current);
            delayTimerRef.current = null;
        }

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
