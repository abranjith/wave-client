/**
 * Collection Runner Hook
 * Manages execution of multiple HTTP requests with concurrency control.
 * Uses request ID for correlation between requests and responses.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Environment, ResponseData, CollectionRequest } from '../types/collection';
import { Auth } from './store/createAuthSlice';
import { buildHttpRequest, CollectionRequestInput } from '../utils/requestBuilder';
import { RequestValidation } from '../types/validation';

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
    response?: ResponseData;
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
    vsCodeApi: any;
    environments: Environment[];
    auths: Auth[];
}

// ==================== Hook ====================

export function useCollectionRunner({ vsCodeApi, environments, auths }: UseCollectionRunnerOptions) {
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

    // Response handler - listens for httpResponse messages
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            
            if (message.type === 'httpResponse' && message.response) {
                const responseId = message.response.id;
                
                // Check if this response belongs to our active run
                if (activeRequestIds.current.has(responseId)) {
                    activeRequestIds.current.delete(responseId);
                    activeCountRef.current = Math.max(0, activeCountRef.current - 1);

                    const response = message.response as ResponseData;
                    const isSuccess = response.status >= 200 && response.status < 400;
                    const validationResult = response.validationResult;
                    
                    // Determine validation status
                    let validationStatus: ValidationStatus = 'idle';
                    if (validationResult) {
                        validationStatus = validationResult.allPassed ? 'pass' : 'fail';
                    }

                    setState(prev => {
                        const newResults = new Map(prev.results);
                        newResults.set(responseId, {
                            requestId: responseId,
                            status: isSuccess ? 'success' : 'error',
                            validationStatus,
                            response,
                            elapsedTime: response.elapsedTime
                        });

                        // Calculate new progress
                        const completed = prev.progress.completed + 1;
                        const passed = prev.progress.passed + (isSuccess && validationStatus !== 'fail' ? 1 : 0);
                        const failed = prev.progress.failed + (!isSuccess || validationStatus === 'fail' ? 1 : 0);

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

                    // Process next item from queue
                    processQueue();
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Process queue with concurrency control
    const processQueue = useCallback(async () => {
        if (isCancelledRef.current) {
            return;
        }

        const settings = runSettingsRef.current;
        
        while (
            pendingQueue.current.length > 0 && 
            activeCountRef.current < settings.concurrentCalls &&
            !isCancelledRef.current
        ) {
            const item = pendingQueue.current.shift();
            if (!item) break;

            // Apply delay if configured and not the first request
            if (settings.delayBetweenCalls > 0 && activeCountRef.current > 0) {
                await new Promise(resolve => setTimeout(resolve, settings.delayBetweenCalls));
            }

            if (isCancelledRef.current) break;

            // Build and send request
            await sendRequest(item);
        }
    }, []);

    // Send a single request
    const sendRequest = useCallback(async (item: RunRequestItem) => {
        if (!vsCodeApi || isCancelledRef.current) {
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

        const result = await buildHttpRequest(
            input,
            environmentIdRef.current,
            environments,
            auths,
            defaultAuthIdRef.current
        );

        if (result.error || !result.request) {
            // Build error - mark as failed
            activeRequestIds.current.delete(item.id);
            activeCountRef.current = Math.max(0, activeCountRef.current - 1);

            setState(prev => {
                const newResults = new Map(prev.results);
                newResults.set(item.id, {
                    requestId: item.id,
                    status: 'error',
                    validationStatus: 'idle',
                    error: result.error || 'Failed to build request'
                });

                const completed = prev.progress.completed + 1;
                const failed = prev.progress.failed + 1;
                const isRunning = completed < prev.progress.total;

                return {
                    ...prev,
                    results: newResults,
                    progress: { ...prev.progress, completed, failed },
                    isRunning
                };
            });

            // Process next
            processQueue();
            return;
        }

        // Send request to extension
        vsCodeApi.postMessage({
            type: 'httpRequest',
            request: result.request,
            id: item.id,
            validation: item.validation
        });
    }, [vsCodeApi, environments, auths, processQueue]);

    // Start collection run
    const runCollection = useCallback(async (
        requests: RunRequestItem[],
        settings: RunSettings,
        environmentId: string | null,
        defaultAuthId: string | null
    ) => {
        if (!vsCodeApi || requests.length === 0) {
            return;
        }

        // Reset state
        isCancelledRef.current = false;
        activeRequestIds.current.clear();
        activeCountRef.current = 0;
        runSettingsRef.current = settings;
        environmentIdRef.current = environmentId;
        defaultAuthIdRef.current = defaultAuthId;

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

        // Start processing
        processQueue();
    }, [vsCodeApi, processQueue]);

    // Cancel run
    const cancelRun = useCallback(() => {
        isCancelledRef.current = true;
        pendingQueue.current = [];
        
        setState(prev => ({
            ...prev,
            isRunning: false
        }));
    }, []);

    // Reset results
    const resetResults = useCallback(() => {
        isCancelledRef.current = false;
        activeRequestIds.current.clear();
        activeCountRef.current = 0;
        pendingQueue.current = [];

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
