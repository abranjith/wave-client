/**
 * Flow Results Panel
 *
 * Side panel showing flow execution results with a reusable request view.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Circle, Trash2, DownloadIcon, Loader2, CheckIcon } from 'lucide-react';
import type { Flow, FlowRunResult, FlowNodeResult, FlowNodeStatus, FlowNode } from '../../types/flow';
import type { Collection, CollectionItem, CollectionRequest, AnyCollectionRequest } from '../../types/collection';
import { isRequest } from '../../types/collection';
import { isWsRequest } from '../../utils/requestTypeGuards';
import { urlToString } from '../../utils/collectionParser';
import { cn } from '../../utils/common';
import RunRequestCard, { RunRequestData, RunStatus, ValidationStatus } from '../common/RunRequestCard';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { useReportExport } from '../../hooks/useReportExport';
import type { FlowReportInput, ReportRequestNode } from '../../utils/reporting';

interface FlowResultsPanelProps {
    /** Current flow definition */
    flow: Flow;
    /** Available collections to resolve requests */
    collections: Collection[];
    /** Flow run result */
    result: FlowRunResult | null;
    /** Callback when a node is clicked to view details */
    onNodeClick?: (nodeId: string) => void;
    /** Currently selected node ID */
    selectedNodeId?: string;
    /** Callback to clear results */
    onClearResults?: () => void;
}

interface RequestLookupResult {
    request: AnyCollectionRequest;
    folderPath: string[];
    name: string;
    method: string;
    url: string;
}

function findRequestInItems(items: CollectionItem[], targetId: string, path: string[] = []): RequestLookupResult | null {
    for (const item of items) {
        const currentPath = [...path, item.name];

        if (isRequest(item) && item.id === targetId && item.request) {
            const url = typeof item.request.url === 'string'
                ? item.request.url
                : urlToString(item.request.url);

            return {
                request: item.request,
                folderPath: path,
                name: item.name,
                method: isWsRequest(item.request) ? 'WS' : item.request.method,
                url,
            };
        }

        if (item.item) {
            const found = findRequestInItems(item.item, targetId, currentPath);
            if (found) {
                return found;
            }
        }
    }

    return null;
}

function findRequestMeta(requestId: string, collections: Collection[]): RequestLookupResult | null {
    let collectionFilename: string | undefined;
    let itemId = requestId;

    if (requestId.includes(':')) {
        [collectionFilename, itemId] = requestId.split(':');
    }

    const collectionsToSearch = collectionFilename
        ? collections.filter(c => c.filename === collectionFilename)
        : collections;

    for (const collection of collectionsToSearch) {
        const found = findRequestInItems(collection.item, itemId, []);
        if (found) {
            return found;
        }
    }

    return null;
}

function toRunStatus(status?: FlowNodeStatus): RunStatus {
    switch (status) {
        case 'running':
            return 'running';
        case 'pending':
            return 'pending';
        case 'success':
            return 'success';
        case 'failed':
            return 'failed';
        case 'skipped':
            return 'skipped';
        default:
            return 'idle';
    }
}

function toValidationStatus(result?: FlowNodeResult): ValidationStatus {
    if (!result) return 'idle';
    if (result.status === 'running' || result.status === 'pending') return 'pending';

    const validation = result.response?.validationResult;
    if (!validation) return 'idle';

    return validation.allPassed ? 'pass' : 'fail';
}

function deriveError(result?: FlowNodeResult): string | undefined {
    if (!result) return undefined;
    if (result.status === 'skipped') return 'Skipped (condition not met)';
    if (result.error) return result.error;
    if (result.status === 'failed' && result.response) {
        return `HTTP ${result.response.status}`;
    }
    return undefined;
}

function buildRunRequestData(
    node: FlowNode,
    nodeResult: FlowNodeResult | undefined,
    collections: Collection[]
): RunRequestData {
    const lookup = findRequestMeta(node.requestId, collections);
    const request: AnyCollectionRequest = lookup?.request ?? {
        id: node.id,
        name: node.alias || node.name,
        method: node.method,
        url: lookup?.url || 'Unknown URL',
    };

    const url = lookup?.url || (typeof request.url === 'string' ? request.url : urlToString(request.url));

    return {
        id: node.id,
        name: node.alias || lookup?.name || node.name,
        method: ((!isWsRequest(request) ? request.method : undefined) || node.method || 'GET').toUpperCase(),
        url,
        request,
        folderPath: lookup?.folderPath ?? [],
        runStatus: toRunStatus(nodeResult?.status),
        responseStatus: nodeResult?.response?.status,
        responseTime: nodeResult?.response?.elapsedTime,
        validationStatus: toValidationStatus(nodeResult),
        validationResult: nodeResult?.response?.validationResult,
        responseHeaders: nodeResult?.response?.headers,
        responseBody: nodeResult?.response?.body,
        isResponseEncoded: nodeResult?.response?.isEncoded,
        error: deriveError(nodeResult),
    };
}

// ============================================================================
// Main Component
// ============================================================================

export const FlowResultsPanel: React.FC<FlowResultsPanelProps> = ({
    flow,
    collections,
    result,
    onNodeClick,
    selectedNodeId,
    onClearResults,
}) => {
    const { status: reportStatus, exportFlowRun } = useReportExport();

    // 3-second transient success indicator after a successful export.
    const [showExportSuccess, setShowExportSuccess] = useState(false);

    useEffect(() => {
        if (reportStatus.state === 'success') {
            setShowExportSuccess(true);
            const timer = setTimeout(() => setShowExportSuccess(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [reportStatus.state]);

    const progress = result?.progress ?? {
        total: flow.nodes.length,
        completed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
    };

    const status = result?.status ?? 'idle';
    const totalForBar = Math.max(progress.total, 1);

    const cards = useMemo<RunRequestData[]>(() => {
        return flow.nodes.map((node) => {
            const nodeResult = result?.nodeResults.get(node.id);
            return buildRunRequestData(node, nodeResult, collections);
        });
    }, [flow.nodes, result, collections]);

    /**
     * Builds the FlowReportInput from current flow/result state and triggers
     * the file download.
     *
     * Metadata note: `environmentName` and `defaultAuthName` are intentionally
     * `undefined` — the flow runner does not currently surface the resolved
     * environment / auth name to the results panel. See TODO.md:
     * "Per-request resolved auth recorded by runners and surfaced in the report header".
     */
    const handleExport = useCallback(async () => {
        if (!result) {
            return;
        }

        const startedAt = new Date(result.startedAt).getTime();
        const completedAt = result.completedAt
            ? new Date(result.completedAt).getTime()
            : undefined;
        const totalElapsedMs =
            completedAt !== undefined ? completedAt - startedAt : undefined;

        // Map RunRequestData cards to ReportRequestNode — the two types share
        // the same shape so this is a straightforward re-cast.
        const nodes: ReportRequestNode[] = cards.map((card) => ({
            id: card.id,
            name: card.name,
            method: card.method,
            url: card.url,
            folderPath: card.folderPath,
            runStatus: card.runStatus,
            responseStatus: card.responseStatus,
            responseTime: card.responseTime,
            validationStatus: card.validationStatus,
            validationResult: card.validationResult,
            responseHeaders: card.responseHeaders,
            responseBody: card.responseBody,
            isResponseEncoded: card.isResponseEncoded,
            error: card.error,
            request: card.request,
        }));

        // Compute average response time across nodes that received a response.
        const executedNodes = nodes.filter((n) => n.responseTime !== undefined);
        const averageTimeMs =
            executedNodes.length > 0
                ? executedNodes.reduce((sum, n) => sum + (n.responseTime ?? 0), 0) /
                  executedNodes.length
                : undefined;

        const input: FlowReportInput = {
            metadata: {
                runType: 'flow',
                subjectName: flow.name,
                startedAt,
                completedAt,
                totalElapsedMs,
                // environmentName and defaultAuthName are undefined for now — the
                // flow runner does not currently surface them to the results panel.
            },
            summary: {
                total: result.progress.total,
                passed: result.progress.succeeded,
                failed: result.progress.failed,
                skipped: result.progress.skipped,
                averageTimeMs,
            },
            nodes,
        };

        await exportFlowRun(input);
    }, [result, cards, flow.name, exportFlowRun]);

    const statusColors: Record<string, string> = {
        idle: 'bg-slate-100 text-slate-600',
        running: 'bg-blue-100 text-blue-600',
        success: 'bg-green-100 text-green-600',
        failed: 'bg-red-100 text-red-600',
        cancelled: 'bg-amber-100 text-amber-600',
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
            
            {/* Error Banner */}
            {result?.error && status !== 'running' && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-800">
                    <div className="text-sm text-red-700 dark:text-red-400">
                        <strong>Error:</strong> {result.error}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                        Results
                    </h3>
                    <div className="flex items-center gap-2">
                        {/* Export Report button — disabled when no result, running, or generating */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleExport}
                                    disabled={
                                        result === null ||
                                        result.status === 'running' ||
                                        reportStatus.state === 'generating'
                                    }
                                    className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                    aria-label="Export HTML report"
                                >
                                    {reportStatus.state === 'generating' ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : showExportSuccess ? (
                                        <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                        <DownloadIcon className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Export HTML report</TooltipContent>
                        </Tooltip>
                        {result && onClearResults && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={onClearResults}
                                        className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Clear Results</TooltipContent>
                            </Tooltip>
                        )}
                        <span className={cn(
                            'text-xs px-2 py-1 rounded-full font-medium capitalize',
                            statusColors[status]
                        )}>
                            {status}
                        </span>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="flex gap-4 mt-3 text-sm">
                    <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-slate-600 dark:text-slate-400">
                            {progress.succeeded}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-slate-600 dark:text-slate-400">
                            {progress.failed}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Circle className="h-4 w-4 text-slate-400" />
                        <span className="text-slate-600 dark:text-slate-400">
                            {progress.skipped}
                        </span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="flex h-full">
                        <div 
                            className="bg-green-500 transition-all" 
                            style={{ width: `${(progress.succeeded / totalForBar) * 100}%` }} 
                        />
                        <div 
                            className="bg-red-500 transition-all" 
                            style={{ width: `${(progress.failed / totalForBar) * 100}%` }} 
                        />
                        <div 
                            className="bg-slate-300 transition-all" 
                            style={{ width: `${(progress.skipped / totalForBar) * 100}%` }} 
                        />
                    </div>
                </div>

                <div className="text-xs text-slate-500 mt-1">
                    {progress.completed} / {progress.total} completed
                </div>
            </div>

            {/* Node Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {cards.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                        No requests in this flow
                    </div>
                ) : (
                    cards.map((card) => (
                        <RunRequestCard
                            key={card.id}
                            data={card}
                            isSelected={selectedNodeId === card.id}
                            showSelection={false}
                            onCardClick={onNodeClick}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default FlowResultsPanel;
