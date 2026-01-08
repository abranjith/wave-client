/**
 * FlowsPane Component
 * 
 * Sidebar pane for managing flows (request orchestration chains).
 * Similar to CollectionsPane but for flows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
    PlusIcon, 
    PlayIcon, 
    Trash2Icon, 
    GitBranchIcon,
    AlertCircleIcon,
    RefreshCwIcon,
    MoreVerticalIcon,
    PencilIcon
} from 'lucide-react';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { useStorageAdapter, useNotificationAdapter } from '../../hooks/useAdapter';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { Flow } from '../../types/flow';

// ============================================================================
// Types
// ============================================================================

export interface FlowsPaneProps {
    /** Callback when a flow is selected for editing */
    onFlowSelect: (flow: Flow) => void;
    /** Callback to run a flow */
    onFlowRun?: (flow: Flow) => void;
    /** Callback to retry loading flows */
    onRetry?: () => void;
}

// ============================================================================
// Component
// ============================================================================

const FlowsPane: React.FC<FlowsPaneProps> = ({ 
    onFlowSelect, 
    onFlowRun,
    onRetry 
}) => {
    const storageAdapter = useStorageAdapter();
    const notification = useNotificationAdapter();
    
    // Local state
    const [flows, setFlows] = useState<Flow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchText, setSearchText] = useState('');
    const [editingFlowId, setEditingFlowId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Load flows
    const loadFlows = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        const result = await storageAdapter.loadFlows();
        
        if (result.isOk) {
            setFlows(result.value);
        } else {
            setError(result.error);
        }
        
        setIsLoading(false);
    }, [storageAdapter]);

    // Initial load
    useEffect(() => {
        loadFlows();
    }, [loadFlows]);

    // Create new flow
    const handleCreateFlow = useCallback(async () => {
        const newFlow: Flow = {
            id: `flow-${Date.now()}`,
            name: 'New Flow',
            description: '',
            nodes: [],
            connectors: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        
        const result = await storageAdapter.saveFlow(newFlow);
        
        if (result.isOk) {
            setFlows(prev => [result.value, ...prev]);
            onFlowSelect(result.value);
            notification.showNotification('success', 'Flow created');
        } else {
            notification.showNotification('error', result.error);
        }
    }, [storageAdapter, notification, onFlowSelect]);

    // Delete flow
    const handleDeleteFlow = useCallback(async (flowId: string, flowName: string) => {
        const result = await storageAdapter.deleteFlow(flowId);
        
        if (result.isOk) {
            setFlows(prev => prev.filter(f => f.id !== flowId));
            notification.showNotification('success', `Deleted "${flowName}"`);
        } else {
            notification.showNotification('error', result.error);
        }
    }, [storageAdapter, notification]);

    // Rename flow
    const handleRenameStart = useCallback((flow: Flow) => {
        setEditingFlowId(flow.id);
        setEditingName(flow.name);
    }, []);

    const handleRenameEnd = useCallback(async () => {
        if (!editingFlowId) return;
        
        const flow = flows.find(f => f.id === editingFlowId);
        if (!flow || flow.name === editingName.trim()) {
            setEditingFlowId(null);
            return;
        }
        
        const updatedFlow: Flow = {
            ...flow,
            name: editingName.trim() || 'Untitled Flow',
            updatedAt: new Date().toISOString(),
        };
        
        const result = await storageAdapter.saveFlow(updatedFlow);
        
        if (result.isOk) {
            setFlows(prev => prev.map(f => f.id === editingFlowId ? result.value : f));
        } else {
            notification.showNotification('error', result.error);
        }
        
        setEditingFlowId(null);
    }, [editingFlowId, editingName, flows, storageAdapter, notification]);

    // Filter flows by search text
    const filteredFlows = searchText.trim()
        ? flows.filter(f => 
            f.name.toLowerCase().includes(searchText.toLowerCase()) ||
            f.description?.toLowerCase().includes(searchText.toLowerCase())
          )
        : flows;

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
        });
    };

    // ========== Render ==========

    // Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col h-full p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Flows</h2>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <RefreshCwIcon className="h-6 w-6 animate-spin text-slate-400" />
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex flex-col h-full p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Flows</h2>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <AlertCircleIcon className="h-8 w-8 text-red-500 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry || loadFlows}
                    >
                        <RefreshCwIcon className="h-4 w-4 mr-2" />
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 pb-2">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Flows</h2>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCreateFlow}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                            <PlusIcon className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create New Flow</TooltipContent>
                </Tooltip>
            </div>

            {/* Search */}
            <div className="px-4 pb-2">
                <Input
                    placeholder="Search flows..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="h-8 text-sm"
                />
            </div>

            {/* Flow List */}
            <div className="flex-1 overflow-y-auto px-2">
                {filteredFlows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        <GitBranchIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            {searchText ? 'No flows match your search' : 'No flows yet'}
                        </p>
                        {!searchText && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCreateFlow}
                            >
                                <PlusIcon className="h-4 w-4 mr-2" />
                                Create Flow
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-1 py-2">
                        {filteredFlows.map((flow) => (
                            <div
                                key={flow.id}
                                className="group flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                onClick={() => onFlowSelect(flow)}
                            >
                                <GitBranchIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                
                                <div className="flex-1 min-w-0">
                                    {editingFlowId === flow.id ? (
                                        <Input
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onBlur={handleRenameEnd}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRenameEnd();
                                                if (e.key === 'Escape') setEditingFlowId(null);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-6 text-sm py-0"
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {flow.name}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {flow.nodes.length} node{flow.nodes.length !== 1 ? 's' : ''} • {formatDate(flow.updatedAt)}
                                            </p>
                                        </>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {onFlowRun && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onFlowRun(flow);
                                                    }}
                                                >
                                                    <PlayIcon className="h-3 w-3 text-green-600" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Run Flow</TooltipContent>
                                        </Tooltip>
                                    )}
                                    
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <MoreVerticalIcon className="h-3 w-3" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRenameStart(flow);
                                                }}
                                            >
                                                <PencilIcon className="h-4 w-4 mr-2" />
                                                Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuItem 
                                                className="text-red-600"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteFlow(flow.id, flow.name);
                                                }}
                                            >
                                                <Trash2Icon className="h-4 w-4 mr-2" />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FlowsPane;
