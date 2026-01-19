/**
 * Batch Executor
 * 
 * Handles batch execution of items with:
 * - Concurrency control (configurable number of parallel items)
 * - Delay between batches
 * - Cancellation support
 * - Progress tracking via callbacks
 * - Stop-on-failure option
 * 
 * Used by useCollectionRunner and useTestSuiteRunner.
 */

import type { ExecutionConfig, ExecutionProgress } from '../types/execution';
import { createInitialProgress, updateProgress } from '../types/execution';

// ============================================================================
// Types
// ============================================================================

/**
 * Callbacks for batch execution events
 */
export interface BatchExecutorCallbacks<TResult> {
    /** Called when an item starts executing */
    onItemStart?: (itemId: string) => void;
    /** Called when an item completes (success or failure) */
    onItemComplete?: (result: TResult) => void;
    /** Called when a batch completes */
    onBatchComplete?: (results: TResult[]) => void;
    /** Called when progress updates */
    onProgress?: (progress: ExecutionProgress) => void;
}

/**
 * Result of batch execution
 */
export interface BatchExecutionResult<TResult> {
    /** All results from execution */
    results: TResult[];
    /** Final progress state */
    progress: ExecutionProgress;
    /** Whether execution was cancelled */
    cancelled: boolean;
    /** Whether execution stopped due to failure */
    stoppedOnFailure: boolean;
}

/**
 * Item to execute in batch
 */
export interface BatchItem {
    /** Unique identifier for the item */
    id: string;
}

/**
 * Extract result status and validation for progress tracking
 */
export interface ResultStatusExtractor<TResult> {
    (result: TResult): { 
        status: 'success' | 'failed' | 'skipped' | 'cancelled';
        validationStatus: 'idle' | 'pending' | 'pass' | 'fail';
    };
}

// ============================================================================
// Batch Executor Class
// ============================================================================

/**
 * Generic batch executor for running items with concurrency control
 */
export class BatchExecutor<TItem extends BatchItem, TResult> {
    private delayTimer: ReturnType<typeof setTimeout> | null = null;
    
    /**
     * Executes a batch of items with concurrency control
     * 
     * @param items - Items to execute
     * @param executor - Function to execute a single item
     * @param config - Execution configuration
     * @param isCancelled - Callback to check if cancelled
     * @param extractStatus - Function to extract status from result for progress tracking
     * @param callbacks - Optional callbacks for events
     */
    async execute(
        items: TItem[],
        executor: (item: TItem) => Promise<TResult>,
        config: ExecutionConfig,
        isCancelled: () => boolean,
        extractStatus: ResultStatusExtractor<TResult>,
        callbacks?: BatchExecutorCallbacks<TResult>
    ): Promise<BatchExecutionResult<TResult>> {
        const results: TResult[] = [];
        let progress = createInitialProgress(items.length);
        let stoppedOnFailure = false;
        
        // Create a queue of pending items
        const pendingQueue = [...items];
        
        // Process batches
        while (pendingQueue.length > 0 && !isCancelled()) {
            // Get batch of items to execute
            const batchSize = Math.min(config.concurrentCalls, pendingQueue.length);
            const batch = pendingQueue.splice(0, batchSize);
            
            // Notify item starts
            if (callbacks?.onItemStart) {
                for (const item of batch) {
                    callbacks.onItemStart(item.id);
                }
            }
            
            // Execute batch in parallel
            const batchPromises = batch.map(async (item): Promise<TResult> => {
                return executor(item);
            });
            
            const batchResults = await Promise.all(batchPromises);
            
            // Process results
            let hasFailure = false;
            for (const result of batchResults) {
                results.push(result);
                
                // Notify item complete
                if (callbacks?.onItemComplete) {
                    callbacks.onItemComplete(result);
                }
                
                // Update progress
                const { status, validationStatus } = extractStatus(result);
                progress = updateProgress(progress, status, validationStatus);
                
                // Check for failure
                if (status === 'failed') {
                    hasFailure = true;
                }
            }
            
            // Notify batch complete
            if (callbacks?.onBatchComplete) {
                callbacks.onBatchComplete(batchResults);
            }
            
            // Notify progress
            if (callbacks?.onProgress) {
                callbacks.onProgress(progress);
            }
            
            // Check stop on failure
            if (config.stopOnFailure && hasFailure) {
                stoppedOnFailure = true;
                
                // Mark remaining items as skipped (handled by caller since we don't have results yet)
                break;
            }
            
            // Apply delay between batches (if not cancelled and more items pending)
            if (config.delayBetweenCalls > 0 && pendingQueue.length > 0 && !isCancelled()) {
                await this.delay(config.delayBetweenCalls, isCancelled);
            }
        }
        
        return {
            results,
            progress,
            cancelled: isCancelled(),
            stoppedOnFailure,
        };
    }
    
    /**
     * Cancels any pending delay
     */
    cancelDelay(): void {
        if (this.delayTimer) {
            clearTimeout(this.delayTimer);
            this.delayTimer = null;
        }
    }
    
    /**
     * Waits for a delay, checking for cancellation
     */
    private delay(ms: number, isCancelled: () => boolean): Promise<void> {
        return new Promise(resolve => {
            this.delayTimer = setTimeout(() => {
                this.delayTimer = null;
                resolve();
            }, ms);
            
            // Poll for cancellation during delay
            const checkCancellation = setInterval(() => {
                if (isCancelled()) {
                    clearInterval(checkCancellation);
                    this.cancelDelay();
                    resolve();
                }
            }, 50);
            
            // Clear interval when delay completes
            setTimeout(() => {
                clearInterval(checkCancellation);
            }, ms + 10);
        });
    }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new BatchExecutor instance
 */
export function createBatchExecutor<TItem extends BatchItem, TResult>(): BatchExecutor<TItem, TResult> {
    return new BatchExecutor<TItem, TResult>();
}
