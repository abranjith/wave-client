/**
 * Flow Results Panel
 * 
 * Side panel showing flow execution results with pass/fail summary
 * and per-node details including response data.
 */

import React, { useState } from 'react';
import { 
    CheckCircle2, 
    XCircle, 
    Circle, 
    Loader2, 
    ChevronDownIcon, 
    ChevronRightIcon,
    Clock,
    FileJson,
} from 'lucide-react';
import type { FlowRunResult, FlowNodeResult, FlowNodeStatus } from '../../types/flow';
import { getHttpMethodColor, cn, formatFileSize } from '../../utils/common';

// ============================================================================
// Types
// ============================================================================

interface FlowResultsPanelProps {
    /** Flow run result */
    result: FlowRunResult | null;
    /** Callback when a node is clicked to view details */
    onNodeClick?: (nodeId: string) => void;
    /** Currently selected node ID */
    selectedNodeId?: string;
}

// ============================================================================
// Status Components
// ============================================================================

const StatusIcon: React.FC<{ status: FlowNodeStatus }> = ({ status }) => {
    switch (status) {
        case 'running':
            return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
        case 'success':
            return <CheckCircle2 className="h-4 w-4 text-green-500" />;
        case 'failed':
            return <XCircle className="h-4 w-4 text-red-500" />;
        case 'skipped':
            return <Circle className="h-4 w-4 text-slate-400" />;
        case 'pending':
            return <Circle className="h-4 w-4 text-blue-400" />;
        default:
            return <Circle className="h-4 w-4 text-slate-300" />;
    }
};

const StatusBadge: React.FC<{ status: FlowNodeStatus }> = ({ status }) => {
    const colors: Record<FlowNodeStatus, string> = {
        idle: 'bg-slate-100 text-slate-600',
        pending: 'bg-blue-100 text-blue-600',
        running: 'bg-blue-100 text-blue-600',
        success: 'bg-green-100 text-green-600',
        failed: 'bg-red-100 text-red-600',
        skipped: 'bg-slate-100 text-slate-600',
    };
    
    return (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', colors[status])}>
            {status}
        </span>
    );
};

// ============================================================================
// Node Result Item
// ============================================================================

interface NodeResultItemProps {
    result: FlowNodeResult;
    isSelected: boolean;
    onClick: () => void;
}

const NodeResultItem: React.FC<NodeResultItemProps> = ({ result, isSelected, onClick }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const hasResponse = result.response !== undefined;
    const statusCode = result.response?.status;
    const elapsedTime = result.response?.elapsedTime;
    const responseSize = result.response?.size;
    
    return (
        <div
            className={cn(
                'border rounded-lg transition-colors',
                isSelected 
                    ? 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' 
                    : 'border-slate-200 dark:border-slate-700'
            )}
        >
            {/* Header */}
            <div
                className="flex items-center gap-2 p-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded-t-lg"
                onClick={onClick}
            >
                <StatusIcon status={result.status} />
                
                <span className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate flex-1">
                    {result.alias}
                </span>
                
                {statusCode !== undefined && (
                    <span className={cn(
                        'text-xs font-mono',
                        statusCode >= 200 && statusCode < 300 ? 'text-green-600' :
                        statusCode >= 400 ? 'text-red-600' : 'text-slate-600'
                    )}>
                        {statusCode}
                    </span>
                )}
                
                {elapsedTime !== undefined && (
                    <span className="text-xs text-slate-400">
                        {elapsedTime}ms
                    </span>
                )}
                
                {hasResponse && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
                    >
                        {isExpanded ? (
                            <ChevronDownIcon className="h-4 w-4 text-slate-400" />
                        ) : (
                            <ChevronRightIcon className="h-4 w-4 text-slate-400" />
                        )}
                    </button>
                )}
            </div>
            
            {/* Error Message */}
            {result.error && (
                <div className="px-3 py-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border-t border-red-100">
                    {result.error}
                </div>
            )}
            
            {/* Expanded Response Details */}
            {isExpanded && hasResponse && (
                <div className="border-t border-slate-200 dark:border-slate-700 p-2 space-y-2">
                    {/* Response Stats */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{elapsedTime}ms</span>
                        </div>
                        {responseSize !== undefined && (
                            <div className="flex items-center gap-1">
                                <FileJson className="h-3 w-3" />
                                <span>{formatFileSize(responseSize)}</span>
                            </div>
                        )}
                    </div>
                    
                    {/* Response Body Preview */}
                    {result.response?.body && (
                        <div className="mt-2">
                            <div className="text-xs font-medium text-slate-500 mb-1">Response Body:</div>
                            <pre className="text-xs bg-slate-100 dark:bg-slate-900 p-2 rounded overflow-x-auto max-h-40">
                                {(() => {
                                    try {
                                        // Try to pretty print JSON
                                        const parsed = JSON.parse(result.response!.body);
                                        return JSON.stringify(parsed, null, 2).substring(0, 500);
                                    } catch {
                                        // Not JSON, show raw
                                        return result.response!.body.substring(0, 500);
                                    }
                                })()}
                                {result.response.body.length > 500 && '...'}
                            </pre>
                        </div>
                    )}
                    
                    {/* Validation Result */}
                    {result.response?.validationResult && (
                        <div className="mt-2">
                            <div className="text-xs font-medium text-slate-500 mb-1">Validation:</div>
                            <div className={cn(
                                'text-xs px-2 py-1 rounded',
                                result.response.validationResult.allPassed
                                    ? 'bg-green-50 text-green-700'
                                    : 'bg-red-50 text-red-700'
                            )}>
                                {result.response.validationResult.passedRules}/{result.response.validationResult.totalRules} rules passed
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const FlowResultsPanel: React.FC<FlowResultsPanelProps> = ({
    result,
    onNodeClick,
    selectedNodeId,
}) => {
    if (!result) {
        return (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Run the flow to see results
            </div>
        );
    }
    
    const { progress, status, nodeResults } = result;
    const nodeResultsArray = Array.from(nodeResults.values());
    
    // Status colors
    const statusColors: Record<string, string> = {
        idle: 'bg-slate-100 text-slate-600',
        running: 'bg-blue-100 text-blue-600',
        success: 'bg-green-100 text-green-600',
        failed: 'bg-red-100 text-red-600',
        cancelled: 'bg-amber-100 text-amber-600',
    };
    
    return (
        <div className="h-full flex flex-col bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
            {/* Header */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">
                        Results
                    </h3>
                    <span className={cn(
                        'text-xs px-2 py-1 rounded-full font-medium capitalize',
                        statusColors[status]
                    )}>
                        {status}
                    </span>
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
                            style={{ width: `${(progress.succeeded / progress.total) * 100}%` }} 
                        />
                        <div 
                            className="bg-red-500 transition-all" 
                            style={{ width: `${(progress.failed / progress.total) * 100}%` }} 
                        />
                        <div 
                            className="bg-slate-300 transition-all" 
                            style={{ width: `${(progress.skipped / progress.total) * 100}%` }} 
                        />
                    </div>
                </div>
                
                <div className="text-xs text-slate-500 mt-1">
                    {progress.completed} / {progress.total} completed
                </div>
            </div>
            
            {/* Node Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {nodeResultsArray.map((nodeResult) => (
                    <NodeResultItem
                        key={nodeResult.nodeId}
                        result={nodeResult}
                        isSelected={nodeResult.nodeId === selectedNodeId}
                        onClick={() => onNodeClick?.(nodeResult.nodeId)}
                    />
                ))}
            </div>
            
            {/* Error Footer */}
            {result.error && status !== 'running' && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-800">
                    <div className="text-sm text-red-700 dark:text-red-400">
                        <strong>Error:</strong> {result.error}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlowResultsPanel;
