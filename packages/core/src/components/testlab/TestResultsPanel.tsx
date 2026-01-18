/**
 * Test Results Panel
 *
 * Side panel showing test suite execution results with summary and detailed item results.
 * Supports both request and flow items, with flow items expandable to show node results.
 */

import React, { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Circle, Trash2, ChevronDown, ChevronRight, GitBranchIcon, BeakerIcon } from 'lucide-react';
import type { TestSuite, TestSuiteRunResult, TestItemResult, TestItem, TestCaseResult, RequestTestItemResult } from '../../types/testSuite';
import type { FlowRunResult, FlowNodeResult, FlowNode, Flow } from '../../types/flow';
import type { Collection, CollectionItem, CollectionRequest } from '../../types/collection';
import { isRequest } from '../../types/collection';
import { isRequestTestItem, isFlowTestItem, isRequestTestItemResult, isFlowTestItemResult } from '../../types/testSuite';
import { urlToString } from '../../utils/collectionParser';
import { cn } from '../../utils/common';
import RunRequestCard, { RunRequestData, RunStatus, ValidationStatus } from '../common/RunRequestCard';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

// ============================================================================
// Types
// ============================================================================

interface TestResultsPanelProps {
    /** Current test suite definition */
    suite: TestSuite;
    /** Available collections to resolve requests */
    collections: Collection[];
    /** Available flows to resolve flow items */
    flows: Flow[];
    /** Test suite run result */
    result: TestSuiteRunResult | null;
    /** Callback when an item is clicked to view details */
    onItemClick?: (itemId: string) => void;
    /** Currently selected item ID */
    selectedItemId?: string;
    /** Callback to clear results */
    onClearResults?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

interface RequestLookupResult {
    request: CollectionRequest;
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
                method: item.request.method,
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

function findRequestMeta(referenceId: string, collections: Collection[]): RequestLookupResult | null {
    let collectionFilename: string | undefined;
    let itemId = referenceId;

    if (referenceId.includes(':')) {
        [collectionFilename, itemId] = referenceId.split(':');
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

function toRunStatus(status: string | undefined): RunStatus {
    switch (status) {
        case 'running':
            return 'running';
        case 'pending':
            return 'pending';
        case 'success':
            return 'success';
        case 'failed':
            return 'error';
        case 'skipped':
            return 'idle';
        default:
            return 'idle';
    }
}

function toValidationStatus(status: string | undefined): ValidationStatus {
    switch (status) {
        case 'pass':
            return 'pass';
        case 'fail':
            return 'fail';
        case 'pending':
            return 'pending';
        default:
            return 'idle';
    }
}

function deriveError(result?: TestItemResult): string | undefined {
    if (!result) return undefined;
    if (result.status === 'skipped') return 'Skipped';
    if (result.error) return result.error;
    if (result.status === 'failed') {
        if (result.type === 'request' && result.response) {
            return `HTTP ${result.response.status}`;
        }
        if (result.type === 'flow' && result.flowResult) {
            return `Flow failed: ${result.flowResult.progress.failed} node(s) failed`;
        }
    }
    return undefined;
}

// ============================================================================
// Flow Item Sub-Panel
// ============================================================================

interface FlowResultSubPanelProps {
    flowResult: FlowRunResult;
    flow: Flow;
    collections: Collection[];
}

const FlowResultSubPanel: React.FC<FlowResultSubPanelProps> = ({
    flowResult,
    flow,
    collections,
}) => {
    const nodeCards = useMemo(() => {
        return flow.nodes.map((node) => {
            const nodeResult = flowResult.nodeResults.get(node.id);
            const lookup = findRequestMeta(node.requestId, collections);
            const request = lookup?.request ?? { method: node.method, url: 'Unknown URL' };
            const url = lookup?.url || (typeof request.url === 'string' ? request.url : urlToString(request.url));

            let validationStatus: ValidationStatus = 'idle';
            if (nodeResult?.response?.validationResult) {
                validationStatus = nodeResult.response.validationResult.allPassed ? 'pass' : 'fail';
            }

            return {
                id: node.id,
                name: node.alias || lookup?.name || node.name,
                method: (request.method || node.method || 'GET').toUpperCase(),
                url,
                request,
                folderPath: lookup?.folderPath ?? [],
                runStatus: toRunStatus(nodeResult?.status),
                responseStatus: nodeResult?.response?.status,
                responseTime: nodeResult?.response?.elapsedTime,
                validationStatus,
                responseHeaders: nodeResult?.response?.headers,
                responseBody: nodeResult?.response?.body,
                isResponseEncoded: nodeResult?.response?.is_encoded,
                error: nodeResult?.error || (nodeResult?.status === 'skipped' ? 'Skipped (condition not met)' : undefined),
            } as RunRequestData;
        });
    }, [flow.nodes, flowResult.nodeResults, collections]);

    return (
        <div className="ml-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-2 mt-2">
            {nodeCards.map((card) => (
                <RunRequestCard
                    key={card.id}
                    data={card}
                    showSelection={false}
                />
            ))}
        </div>
    );
};

// ============================================================================
// Test Case Result Card (for data-driven testing)
// ============================================================================

interface TestCaseResultCardProps {
    testCaseResult: TestCaseResult;
}

const TestCaseResultCard: React.FC<TestCaseResultCardProps> = ({
    testCaseResult,
}) => {
    const statusColor = 
        testCaseResult.status === 'success' ? 'text-green-600' :
        testCaseResult.status === 'failed' ? 'text-red-600' :
        testCaseResult.status === 'running' ? 'text-blue-600' :
        testCaseResult.status === 'skipped' ? 'text-slate-400' :
        'text-slate-500';

    const StatusIcon = 
        testCaseResult.status === 'success' ? CheckCircle2 :
        testCaseResult.status === 'failed' ? XCircle :
        Circle;
    
    const validationColor = 
        testCaseResult.validationStatus === 'pass' ? 'text-green-600' :
        testCaseResult.validationStatus === 'fail' ? 'text-red-600' :
        'text-slate-400';

        const [isExpanded, setIsExpanded] = useState(false);
        const [activeTab, setActiveTab] = useState<'Response Headers' | 'Response Body' | 'Validation' | 'Error'>('Response Headers');

        const hasError = !!testCaseResult.error || testCaseResult.validationStatus === 'fail';
        const hasResponse = !!testCaseResult.response;
    
        const tabs: Array<'Error' | 'Response Headers' | 'Response Body' | 'Validation'> = hasError && testCaseResult.error
            ? ['Error', 'Response Headers', 'Response Body', 'Validation']
            : ['Response Headers', 'Response Body', 'Validation'];

        // Auto-switch to Error tab when error appears
        React.useEffect(() => {
            if (hasError && testCaseResult.error && activeTab !== 'Error') {
                setActiveTab('Error');
            }
        }, [hasError, testCaseResult.error, activeTab]);

        const renderHeaders = (headers: Record<string, string> | undefined) => {
            if (!headers || Object.keys(headers).length === 0) {
                return <div className="text-slate-500 text-sm italic">No headers</div>;
            }

            return (
                <div className="space-y-1">
                    {Object.entries(headers).map(([key, value]) => (
                        <div key={key} className="flex text-sm font-mono">
                            <span className="text-blue-600 dark:text-blue-400 min-w-40">{key}:</span>
                            <span className="text-slate-700 dark:text-slate-300 break-all">{value}</span>
                        </div>
                    ))}
                </div>
            );
        };

        const renderTabContent = (tab: typeof activeTab) => {
            switch (tab) {
                case 'Error':
                    return (
                        <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-700 dark:text-red-300 break-all">
                                {testCaseResult.error || 'Validation failed'}
                            </div>
                        </div>
                    );

                case 'Response Headers':
                    return renderHeaders(testCaseResult.response?.headers);

                case 'Response Body': {
                    if (!testCaseResult.response?.body) {
                        return <div className="text-slate-500 text-sm italic">No response body</div>;
                    }

                    let displayBody = testCaseResult.response.body;

                    // Decode base64 if response is encoded
                    if (testCaseResult.response.is_encoded && testCaseResult.response.body) {
                        try {
                            displayBody = atob(testCaseResult.response.body);
                        } catch (e) {
                            // Keep original if decoding fails
                            displayBody = testCaseResult.response.body;
                        }
                    }

                    return (
                        <pre className="text-sm font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-800 p-3 rounded-md max-h-64 overflow-auto">
                            {displayBody}
                        </pre>
                    );
                }

                case 'Validation': {
                    const validationResult = testCaseResult.response?.validationResult;
                
                    if (!validationResult) {
                        return <div className="text-slate-500 text-sm italic">No validation rules run</div>;
                    }

                    return (
                        <div className="space-y-3">
                            {/* Validation Summary */}
                            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-md">
                                {validationResult.allPassed ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                <span className={cn(
                                    'text-sm font-medium',
                                    validationResult.allPassed ? 'text-green-600' : 'text-red-600'
                                )}>
                                    {validationResult.passedRules}/{validationResult.totalRules} rules passed
                                </span>
                            </div>

                            {/* Validation Rules List */}
                            {validationResult.results && validationResult.results.length > 0 && (
                                <div className="space-y-2">
                                    {validationResult.results.map((result, idx) => (
                                        <div 
                                            key={idx}
                                            className={cn(
                                                'p-2 rounded-md text-xs border',
                                                result.passed
                                                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                            )}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                {result.passed ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                                                ) : (
                                                    <XCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
                                                )}
                                                <span className={cn(
                                                    'font-medium',
                                                    result.passed ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'
                                                )}>
                                                    {result.ruleName}
                                                </span>
                                            </div>
                                            <div className={cn(
                                                'text-xs',
                                                result.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                            )}>
                                                {result.message}
                                            </div>
                                            {(result.expected || result.actual) && (
                                                <div className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                                    {result.expected && (
                                                        <div><span className="font-mono">Expected:</span> {result.expected}</div>
                                                    )}
                                                    {result.actual && (
                                                        <div><span className="font-mono">Actual:</span> {result.actual}</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                }

                default:
                    return null;
            }
        };

        return (
            <div className="rounded-md border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                {/* Header */}
                <div
                    className="flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {/* Expand/collapse icon */}
                    {hasResponse && (
                        isExpanded 
                            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    )}
                    {!hasResponse && <div className="w-3.5" />}

                    {/* Status icon */}
                    <StatusIcon className={cn('h-3.5 w-3.5 flex-shrink-0', statusColor)} />

                    {/* Test case name */}
                    <span className="flex-1 text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {testCaseResult.testCaseName}
                    </span>

                    {/* Response status */}
                    {testCaseResult.response?.status && (
                        <span className={cn(
                            'text-xs font-mono flex-shrink-0',
                            testCaseResult.response.status >= 200 && testCaseResult.response.status < 300 
                                ? 'text-green-600' 
                                : testCaseResult.response.status >= 400 
                                    ? 'text-red-600' 
                                    : 'text-yellow-600'
                        )}>
                            {testCaseResult.response.status}
                        </span>
                    )}

                    {/* Response time */}
                    {testCaseResult.response?.elapsedTime && (
                        <span className="text-xs text-slate-400 flex-shrink-0">
                            {testCaseResult.response.elapsedTime}ms
                        </span>
                    )}

                    {/* Validation status */}
                    {testCaseResult.validationStatus !== 'idle' && (
                        <span className={cn('text-xs flex-shrink-0', validationColor)}>
                            {testCaseResult.validationStatus === 'pass' ? '✓' : '✗'}
                        </span>
                    )}
                </div>

                {/* Expanded content */}
                {isExpanded && hasResponse && (
                    <div className="border-t border-slate-100 dark:border-slate-700">
                        {/* Tabs */}
                        <div className="flex gap-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
                            {tabs.map((tab) => (
                                <button
                                    key={tab}
                                    className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                                        activeTab === tab
                                            ? tab === 'Error'
                                                ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-b-2 border-red-500'
                                                : 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                            : tab === 'Error'
                                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400'
                                    }`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="p-3 max-h-64 overflow-auto">
                            {renderTabContent(activeTab)}
                        </div>
                    </div>
                )}
            </div>
        );
};

// ============================================================================
// Test Item Card
// ============================================================================

interface TestItemCardProps {
    item: TestItem;
    itemResult: TestItemResult | undefined;
    collections: Collection[];
    flows: Flow[];
    isSelected: boolean;
    onClick?: () => void;
}

const TestItemCard: React.FC<TestItemCardProps> = ({
    item,
    itemResult,
    collections,
    flows,
    isSelected,
    onClick,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (isRequestTestItem(item)) {
        // Request item handling
        const lookup = findRequestMeta(item.referenceId, collections);
        const request = lookup?.request ?? { method: 'GET', url: 'Unknown URL' };
        const url = lookup?.url || (typeof request.url === 'string' ? request.url : urlToString(request.url));

        const requestResult = itemResult && isRequestTestItemResult(itemResult) ? itemResult : undefined;
        
        // Check if this item has test case results
        const hasTestCases = requestResult?.testCaseResults && requestResult.testCaseResults.size > 0;
        const testCaseResultsArray = hasTestCases 
            ? Array.from(requestResult!.testCaseResults!.values()) 
            : [];
        
        // Calculate test case summary
        const passedCases = testCaseResultsArray.filter(r => r.status === 'success' && r.validationStatus !== 'fail').length;
        const failedCases = testCaseResultsArray.filter(r => r.status === 'failed' || r.validationStatus === 'fail').length;

        // For items with test cases, show an expandable card instead of RunRequestCard
        if (hasTestCases) {
            const statusColor = 
                itemResult?.status === 'success' ? 'text-green-600' :
                itemResult?.status === 'failed' ? 'text-red-600' :
                itemResult?.status === 'running' ? 'text-blue-600' :
                'text-slate-500';

            const StatusIcon = 
                itemResult?.status === 'success' ? CheckCircle2 :
                itemResult?.status === 'failed' ? XCircle :
                Circle;

            const methodColors: Record<string, string> = {
                GET: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                PUT: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                PATCH: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            };

            return (
                <div className={cn(
                    'rounded-lg border bg-white dark:bg-slate-800',
                    isSelected 
                        ? 'border-purple-500 ring-1 ring-purple-500' 
                        : 'border-slate-200 dark:border-slate-700'
                )}>
                    {/* Main row */}
                    <div
                        className="flex items-center gap-2 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        onClick={() => {
                            setIsExpanded(!isExpanded);
                            onClick?.();
                        }}
                    >
                        {/* Expand/collapse icon */}
                        {isExpanded 
                            ? <ChevronDown className="h-4 w-4 text-slate-400" />
                            : <ChevronRight className="h-4 w-4 text-slate-400" />
                        }

                        {/* Method badge */}
                        <span className={cn(
                            'text-xs font-mono font-semibold px-1.5 py-0.5 rounded flex-shrink-0',
                            methodColors[(request.method || 'GET').toUpperCase()] || 'bg-slate-100 text-slate-700'
                        )}>
                            {(request.method || 'GET').toUpperCase()}
                        </span>

                        {/* Name */}
                        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {item.name || lookup?.name || 'Unknown Request'}
                        </span>

                        {/* Test case badge */}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            <BeakerIcon className="h-3 w-3" />
                            {passedCases}/{testCaseResultsArray.length}
                        </span>

                        {/* Status */}
                        <StatusIcon className={cn('h-4 w-4 flex-shrink-0', statusColor)} />
                    </div>

                    {/* Test case results expansion */}
                    {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-700 p-2 space-y-1 bg-slate-50 dark:bg-slate-900/50">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                    Test Cases
                                </span>
                                <span className="text-xs text-green-600">{passedCases} passed</span>
                                {failedCases > 0 && (
                                    <span className="text-xs text-red-600">{failedCases} failed</span>
                                )}
                            </div>
                            {testCaseResultsArray.map((tcResult) => (
                                <TestCaseResultCard
                                    key={tcResult.testCaseId}
                                    testCaseResult={tcResult}
                                />
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        // No test cases - use regular RunRequestCard
        const data: RunRequestData = {
            id: item.id,
            name: item.name || lookup?.name || 'Unknown Request',
            method: (request.method || 'GET').toUpperCase(),
            url,
            request: request as CollectionRequest,
            folderPath: lookup?.folderPath ?? [],
            runStatus: toRunStatus(itemResult?.status),
            responseStatus: requestResult?.response?.status,
            responseTime: requestResult?.response?.elapsedTime,
            validationStatus: toValidationStatus(itemResult?.validationStatus),
            responseHeaders: requestResult?.response?.headers,
            responseBody: requestResult?.response?.body,
            isResponseEncoded: requestResult?.response?.is_encoded,
            error: deriveError(itemResult),
        };

        return (
            <RunRequestCard
                data={data}
                showSelection={false}
                onCardClick={onClick ? () => onClick() : undefined}
            />
        );
    }

    // Flow item - show expandable card with flow results
    const flowItem = item as typeof item & { type: 'flow' };
    const flow = flows.find(f => f.id === flowItem.referenceId);
    const flowResult = itemResult && isFlowTestItemResult(itemResult) ? itemResult : undefined;

    const statusColor = 
        itemResult?.status === 'success' ? 'text-green-600' :
        itemResult?.status === 'failed' ? 'text-red-600' :
        itemResult?.status === 'running' ? 'text-blue-600' :
        'text-slate-500';

    const StatusIcon = 
        itemResult?.status === 'success' ? CheckCircle2 :
        itemResult?.status === 'failed' ? XCircle :
        Circle;

    return (
        <div className={cn(
            'rounded-lg border bg-white dark:bg-slate-800',
            isSelected 
                ? 'border-purple-500 ring-1 ring-purple-500' 
                : 'border-slate-200 dark:border-slate-700'
        )}>
            <div
                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                onClick={() => {
                    if (flowResult?.flowResult) {
                        setIsExpanded(!isExpanded);
                    }
                    onClick?.();
                }}
            >
                {/* Expand/collapse icon for flows */}
                {flowResult?.flowResult ? (
                    isExpanded 
                        ? <ChevronDown className="h-4 w-4 text-slate-400" />
                        : <ChevronRight className="h-4 w-4 text-slate-400" />
                ) : (
                    <div className="w-4" />
                )}

                {/* Flow icon */}
                <GitBranchIcon className="h-4 w-4 text-purple-500 flex-shrink-0" />

                {/* Name */}
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                    {item.name || flow?.name || 'Unknown Flow'}
                </span>

                {/* Status */}
                <StatusIcon className={cn('h-4 w-4', statusColor)} />

                {/* Progress for flows */}
                {flowResult?.flowResult && (
                    <span className="text-xs text-slate-500">
                        {flowResult.flowResult.progress.succeeded}/{flowResult.flowResult.progress.total}
                    </span>
                )}
            </div>

            {/* Flow nodes sub-panel */}
            {isExpanded && flowResult?.flowResult && flow && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-3">
                    <FlowResultSubPanel
                        flowResult={flowResult.flowResult}
                        flow={flow}
                        collections={collections}
                    />
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const TestResultsPanel: React.FC<TestResultsPanelProps> = ({
    suite,
    collections,
    flows,
    result,
    onItemClick,
    selectedItemId,
    onClearResults,
}) => {
    const progress = result?.progress ?? {
        total: suite.items.length,
        completed: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
    };

    const status = result?.status ?? 'idle';
    const totalForBar = Math.max(progress.total, 1);

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
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
                    <div className="text-sm text-red-700 dark:text-red-400">
                        {result.error}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                {/* Status + Clear Button Row */}
                <div className="flex items-center justify-between mb-3">
                    <span className={cn(
                        'text-xs font-medium px-2 py-1 rounded-full capitalize',
                        statusColors[status] || statusColors.idle
                    )}>
                        {status}
                    </span>

                    {onClearResults && result && status !== 'running' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={onClearResults}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-slate-500" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Clear Results</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                {/* Summary Stats */}
                <div className="flex items-center justify-between text-xs mb-2">
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {progress.passed}
                        </span>
                        <span className="flex items-center gap-1 text-red-600">
                            <XCircle className="h-3.5 w-3.5" />
                            {progress.failed}
                        </span>
                        {progress.skipped > 0 && (
                            <span className="flex items-center gap-1 text-slate-500">
                                <Circle className="h-3.5 w-3.5" />
                                {progress.skipped}
                            </span>
                        )}
                    </div>
                    <span className="text-slate-500">
                        {progress.completed}/{progress.total}
                    </span>
                </div>

                {/* Average Time */}
                {result?.averageTime !== undefined && result.averageTime > 0 && (
                    <div className="text-xs text-slate-500 mb-2">
                        Avg: {Math.round(result.averageTime)}ms
                    </div>
                )}

                {/* Progress Bar */}
                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex">
                    <div
                        className="h-full bg-green-500 transition-all duration-300"
                        style={{ width: `${(progress.passed / totalForBar) * 100}%` }}
                    />
                    <div
                        className="h-full bg-red-500 transition-all duration-300"
                        style={{ width: `${(progress.failed / totalForBar) * 100}%` }}
                    />
                    <div
                        className="h-full bg-slate-300 transition-all duration-300"
                        style={{ width: `${(progress.skipped / totalForBar) * 100}%` }}
                    />
                </div>
            </div>

            {/* Item Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {suite.items
                    .filter(item => item.enabled)
                    .sort((a, b) => a.order - b.order)
                    .map((item) => {
                        const itemResult = result?.itemResults.get(item.id);
                        return (
                            <TestItemCard
                                key={item.id}
                                item={item}
                                itemResult={itemResult}
                                collections={collections}
                                flows={flows}
                                isSelected={selectedItemId === item.id}
                                onClick={() => onItemClick?.(item.id)}
                            />
                        );
                    })
                }
            </div>
        </div>
    );
};

export default TestResultsPanel;
