/**
 * Test Suite Editor Component
 * 
 * Main editor for configuring and running test suites.
 * Features:
 * - Toolbar with name, env/auth selection, save/run controls
 * - Item list with drag-to-reorder and remove actions
 * - Add requests/flows dialog
 * - Results panel showing execution progress
 */

import React, { useState, useCallback, useMemo } from 'react';
import { 
    PlusCircleIcon, 
    PlayIcon, 
    StopCircleIcon, 
    SaveIcon,
    Lock,
    Trash2Icon,
    GripVerticalIcon,
    SearchIcon,
    GitBranchIcon,
    FileTextIcon,
    SettingsIcon,
    ChevronDown,
    ChevronUp,
    BeakerIcon,
    PencilIcon,
} from 'lucide-react';
import type { Environment, CollectionItem, Collection } from '../../types/collection';
import type { Auth } from '../../hooks/store/createAuthSlice';
import type { Flow } from '../../types/flow';
import type { TestSuite, TestItem, TestSuiteSettings, TestCase, RequestTestItem } from '../../types/testSuite';
import { isRequest } from '../../types/collection';
import { urlToString } from '../../utils/collectionParser';
import { createRequestTestItem, createFlowTestItem, isRequestTestItem, isFlowTestItem, createTestCase } from '../../types/testSuite';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { useStorageAdapter, useNotificationAdapter } from '../../hooks/useAdapter';
import { useTestSuiteRunner } from '../../hooks/useTestSuiteRunner';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { cn } from '../../utils/common';
import TestResultsPanel from './TestResultsPanel';
import TestCaseEditor from './TestCaseEditor';

// ============================================================================
// Types
// ============================================================================

interface TestSuiteEditorProps {
    /** The test suite being edited */
    suite: TestSuite;
    /** Callback when editor should close */
    onClose?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

interface FlatRequest {
    id: string;
    referenceId: string;
    name: string;
    method: string;
    url: string;
    collectionName: string;
    folderPath: string[];
}

function flattenCollectionRequests(
    items: CollectionItem[],
    collectionName: string,
    collectionFilename: string,
    parentPath: string[] = []
): FlatRequest[] {
    const requests: FlatRequest[] = [];

    for (const item of items) {
        if (isRequest(item) && item.request) {
            const url = typeof item.request.url === 'string'
                ? item.request.url
                : urlToString(item.request.url);

            requests.push({
                id: item.id,
                referenceId: `${collectionFilename}:${item.id}`,
                name: item.name,
                method: item.request.method,
                url,
                collectionName,
                folderPath: parentPath,
            });
        }

        if (item.item && item.item.length > 0) {
            requests.push(
                ...flattenCollectionRequests(
                    item.item,
                    collectionName,
                    collectionFilename,
                    [...parentPath, item.name]
                )
            );
        }
    }

    return requests;
}

// ============================================================================
// Settings Section
// ============================================================================

interface SettingsSectionProps {
    settings: TestSuiteSettings;
    onSettingsChange: (settings: Partial<TestSuiteSettings>) => void;
    isRunning: boolean;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({ settings, onSettingsChange, isRunning }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
            <button
                type="button"
                className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                onClick={() => setIsExpanded(!isExpanded)}
                disabled={isRunning}
            >
                <div className="flex items-center gap-2">
                    <SettingsIcon className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Run Settings
                    </span>
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
            </button>

            {isExpanded && (
                <div className="p-3 pt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="concurrency" className="text-xs">
                                Concurrent Calls
                            </Label>
                            <Input
                                id="concurrency"
                                type="number"
                                min={1}
                                max={10}
                                value={settings.concurrentCalls}
                                onChange={(e) => onSettingsChange({ concurrentCalls: parseInt(e.target.value) || 1 })}
                                disabled={isRunning}
                                className="h-8 mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="delay" className="text-xs">
                                Delay Between Batches (ms)
                            </Label>
                            <Input
                                id="delay"
                                type="number"
                                min={0}
                                max={10000}
                                step={100}
                                value={settings.delayBetweenCalls}
                                onChange={(e) => onSettingsChange({ delayBetweenCalls: parseInt(e.target.value) || 0 })}
                                disabled={isRunning}
                                className="h-8 mt-1"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="stopOnFailure"
                            checked={settings.stopOnFailure}
                            onCheckedChange={(checked) => onSettingsChange({ stopOnFailure: !!checked })}
                            disabled={isRunning}
                        />
                        <Label htmlFor="stopOnFailure" className="text-xs cursor-pointer">
                            Stop on first failure
                        </Label>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// Add Item Dialog
// ============================================================================

interface AddItemDialogProps {
    isOpen: boolean;
    onClose: () => void;
    collections: Collection[];
    flows: Flow[];
    existingItemIds: Set<string>;
    onAddItems: (items: { type: 'request' | 'flow'; referenceId: string; name: string }[]) => void;
}

const AddItemDialog: React.FC<AddItemDialogProps> = ({
    isOpen,
    onClose,
    collections,
    flows,
    existingItemIds,
    onAddItems,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'requests' | 'flows'>('requests');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Get all available requests
    const allRequests = useMemo(() => {
        return collections.flatMap(c => 
            flattenCollectionRequests(c.item, c.info?.name || c.filename || 'Collection', c.filename || '')
        );
    }, [collections]);

    // Filter requests by search and exclude already added
    const filteredRequests = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return allRequests.filter(r => 
            !existingItemIds.has(r.referenceId) &&
            (r.name.toLowerCase().includes(query) ||
             r.url.toLowerCase().includes(query) ||
             r.method.toLowerCase().includes(query))
        );
    }, [allRequests, searchQuery, existingItemIds]);

    // Filter flows by search and exclude already added
    const filteredFlows = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return flows.filter(f => 
            !existingItemIds.has(f.id) &&
            (f.name.toLowerCase().includes(query) ||
             f.description?.toLowerCase().includes(query))
        );
    }, [flows, searchQuery, existingItemIds]);

    const handleToggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleAdd = () => {
        const items: { type: 'request' | 'flow'; referenceId: string; name: string }[] = [];

        if (activeTab === 'requests') {
            for (const id of selectedIds) {
                const request = allRequests.find(r => r.referenceId === id);
                if (request) {
                    items.push({ type: 'request', referenceId: id, name: request.name });
                }
            }
        } else {
            for (const id of selectedIds) {
                const flow = flows.find(f => f.id === id);
                if (flow) {
                    items.push({ type: 'flow', referenceId: id, name: flow.name });
                }
            }
        }

        onAddItems(items);
        setSelectedIds(new Set());
        onClose();
    };

    // Reset state when dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setSearchQuery('');
            setSelectedIds(new Set());
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Add Test Items</DialogTitle>
                </DialogHeader>

                {/* Tabs */}
                <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
                    <button
                        className={cn(
                            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
                            activeTab === 'requests'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        )}
                        onClick={() => {
                            setActiveTab('requests');
                            setSelectedIds(new Set());
                        }}
                    >
                        <FileTextIcon className="h-4 w-4 inline mr-2" />
                        Requests ({filteredRequests.length})
                    </button>
                    <button
                        className={cn(
                            'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
                            activeTab === 'flows'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        )}
                        onClick={() => {
                            setActiveTab('flows');
                            setSelectedIds(new Set());
                        }}
                    >
                        <GitBranchIcon className="h-4 w-4 inline mr-2" />
                        Flows ({filteredFlows.length})
                    </button>
                </div>

                {/* Search */}
                <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder={activeTab === 'requests' ? 'Search requests...' : 'Search flows...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto min-h-[300px] border border-slate-200 dark:border-slate-700 rounded-lg">
                    {activeTab === 'requests' ? (
                        filteredRequests.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                                No requests available
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                {filteredRequests.map(request => (
                                    <div
                                        key={request.referenceId}
                                        className={cn(
                                            'flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50',
                                            selectedIds.has(request.referenceId) && 'bg-blue-50 dark:bg-blue-900/20'
                                        )}
                                        onClick={() => handleToggleSelection(request.referenceId)}
                                    >
                                        <Checkbox
                                            checked={selectedIds.has(request.referenceId)}
                                            onCheckedChange={() => handleToggleSelection(request.referenceId)}
                                        />
                                        <span className={cn(
                                            'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                                            request.method === 'GET' && 'bg-green-100 text-green-700',
                                            request.method === 'POST' && 'bg-blue-100 text-blue-700',
                                            request.method === 'PUT' && 'bg-yellow-100 text-yellow-700',
                                            request.method === 'DELETE' && 'bg-red-100 text-red-700',
                                            request.method === 'PATCH' && 'bg-purple-100 text-purple-700',
                                        )}>
                                            {request.method}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {request.name}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {request.collectionName} {request.folderPath.length > 0 && `/ ${request.folderPath.join(' / ')}`}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        filteredFlows.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                                No flows available
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-200 dark:divide-slate-700">
                                {filteredFlows.map(flow => (
                                    <div
                                        key={flow.id}
                                        className={cn(
                                            'flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50',
                                            selectedIds.has(flow.id) && 'bg-blue-50 dark:bg-blue-900/20'
                                        )}
                                        onClick={() => handleToggleSelection(flow.id)}
                                    >
                                        <Checkbox
                                            checked={selectedIds.has(flow.id)}
                                            onCheckedChange={() => handleToggleSelection(flow.id)}
                                        />
                                        <GitBranchIcon className="h-4 w-4 text-purple-500" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {flow.name}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {flow.nodes.length} node{flow.nodes.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                    <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
                    <PrimaryButton 
                        onClick={handleAdd}
                        disabled={selectedIds.size === 0}
                    >
                        Add {selectedIds.size > 0 && `(${selectedIds.size})`}
                    </PrimaryButton>
                </div>
            </DialogContent>
        </Dialog>
    );
};

// ============================================================================
// Test Item Row
// ============================================================================

interface TestItemRowProps {
    item: TestItem;
    collections: Collection[];
    flows: Flow[];
    auths: Auth[];
    suiteId: string;
    onRemove: () => void;
    onToggleEnabled: () => void;
    isRunning: boolean;
}

const TestItemRow: React.FC<TestItemRowProps> = ({
    item,
    collections,
    flows,
    auths,
    suiteId,
    onRemove,
    onToggleEnabled,
    isRunning,
}) => {
    // State for expansion and test case editor
    const [isExpanded, setIsExpanded] = useState(false);
    const [isTestCaseEditorOpen, setIsTestCaseEditorOpen] = useState(false);
    const [editingTestCase, setEditingTestCase] = useState<TestCase | undefined>(undefined);

    // Store actions for test cases
    const addTestCase = useAppStateStore((s) => s.addTestCase);
    const updateTestCase = useAppStateStore((s) => s.updateTestCase);
    const deleteTestCase = useAppStateStore((s) => s.deleteTestCase);

    // Get display info
    let name = item.name;
    let subtitle = '';
    let icon: React.ReactNode;
    
    // Test case count (only for request items)
    const testCaseCount = isRequestTestItem(item) ? (item.testCases?.length || 0) : 0;
    const testCases = isRequestTestItem(item) ? (item.testCases || []) : [];
    const existingTestCaseNames = testCases.map(tc => tc.name);

    if (isRequestTestItem(item)) {
        // Find request details
        const allRequests = collections.flatMap(c => 
            flattenCollectionRequests(c.item, c.info?.name || c.filename || 'Collection', c.filename || '')
        );
        const request = allRequests.find(r => r.referenceId === item.referenceId);
        name = item.name || request?.name || 'Unknown Request';
        subtitle = request?.url || item.referenceId;

        const method = request?.method || 'GET';
        icon = (
            <span className={cn(
                'text-xs font-mono font-semibold px-1.5 py-0.5 rounded',
                method === 'GET' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                method === 'POST' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                method === 'PUT' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                method === 'DELETE' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                method === 'PATCH' && 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            )}>
                {method}
            </span>
        );
    } else {
        const flow = flows.find(f => f.id === item.referenceId);
        name = item.name || flow?.name || 'Unknown Flow';
        subtitle = `${flow?.nodes.length || 0} nodes`;
        icon = <GitBranchIcon className="h-4 w-4 text-purple-500" />;
    }

    // Handlers for test cases
    const handleAddTestCase = useCallback(() => {
        setEditingTestCase(undefined);
        setIsTestCaseEditorOpen(true);
    }, []);

    const handleEditTestCase = useCallback((tc: TestCase) => {
        setEditingTestCase(tc);
        setIsTestCaseEditorOpen(true);
    }, []);

    const handleSaveTestCase = useCallback((tc: TestCase) => {
        if (editingTestCase) {
            updateTestCase(suiteId, item.id, tc.id, tc);
        } else {
            addTestCase(suiteId, item.id, tc);
        }
        setIsTestCaseEditorOpen(false);
        setEditingTestCase(undefined);
    }, [suiteId, item.id, editingTestCase, addTestCase, updateTestCase]);

    const handleDeleteTestCase = useCallback((tcId: string) => {
        deleteTestCase(suiteId, item.id, tcId);
    }, [suiteId, item.id, deleteTestCase]);

    const handleToggleTestCaseEnabled = useCallback((tc: TestCase) => {
        updateTestCase(suiteId, item.id, tc.id, { enabled: !tc.enabled });
    }, [suiteId, item.id, updateTestCase]);

    return (
        <div className={cn(
            'rounded-lg border bg-white dark:bg-slate-800',
            item.enabled 
                ? 'border-slate-200 dark:border-slate-700' 
                : 'border-slate-100 dark:border-slate-800 opacity-50'
        )}>
            {/* Main Row */}
            <div className="flex items-center gap-2 p-2">
                {/* Drag handle (placeholder for future drag-to-reorder) */}
                <GripVerticalIcon className="h-4 w-4 text-slate-300 cursor-grab" />

                {/* Enable/disable checkbox */}
                <Checkbox
                    checked={item.enabled}
                    onCheckedChange={onToggleEnabled}
                    disabled={isRunning}
                />

                {/* Icon */}
                {icon}

                {/* Name and URL */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {name}
                        </span>
                        {/* Test case count badge (request items only) */}
                        {isRequestTestItem(item) && testCaseCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                <BeakerIcon className="h-3 w-3" />
                                {testCaseCount}
                            </span>
                        )}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                        {subtitle}
                    </div>
                </div>

                {/* Test Cases toggle (request items only) */}
                {isRequestTestItem(item) && !isRunning && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-slate-500 hover:text-purple-600"
                                onClick={() => setIsExpanded(!isExpanded)}
                            >
                                <BeakerIcon className="h-3.5 w-3.5 mr-1" />
                                Cases
                                {isExpanded ? (
                                    <ChevronUp className="h-3 w-3 ml-1" />
                                ) : (
                                    <ChevronDown className="h-3 w-3 ml-1" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Configure test cases for data-driven testing</TooltipContent>
                    </Tooltip>
                )}

                {/* Remove button */}
                {!isRunning && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                        onClick={onRemove}
                    >
                        <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>

            {/* Test Cases Expansion Panel (request items only) */}
            {isRequestTestItem(item) && isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-700 p-2 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            Test Cases ({testCaseCount})
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-purple-600 hover:text-purple-700"
                            onClick={handleAddTestCase}
                            disabled={isRunning}
                        >
                            <PlusCircleIcon className="h-3 w-3 mr-1" />
                            Add Case
                        </Button>
                    </div>

                    {testCases.length === 0 ? (
                        <div className="text-xs text-slate-500 italic py-2 text-center">
                            No test cases. Item will run once with default data.
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {testCases
                                .sort((a, b) => a.order - b.order)
                                .map((tc) => (
                                    <div
                                        key={tc.id}
                                        className={cn(
                                            'flex items-center gap-2 p-1.5 rounded text-xs',
                                            tc.enabled 
                                                ? 'bg-white dark:bg-slate-800' 
                                                : 'bg-slate-100 dark:bg-slate-800/50 opacity-60'
                                        )}
                                    >
                                        <Checkbox
                                            checked={tc.enabled}
                                            onCheckedChange={() => handleToggleTestCaseEnabled(tc)}
                                            disabled={isRunning}
                                            className="h-3.5 w-3.5"
                                        />
                                        <span className="flex-1 truncate font-medium text-slate-700 dark:text-slate-300">
                                            {tc.name}
                                        </span>
                                        {tc.description && (
                                            <span className="text-slate-400 truncate max-w-[150px]">
                                                {tc.description}
                                            </span>
                                        )}
                                        {!isRunning && (
                                            <>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 w-5 p-0 text-slate-400 hover:text-blue-500"
                                                    onClick={() => handleEditTestCase(tc)}
                                                >
                                                    <PencilIcon className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 w-5 p-0 text-slate-400 hover:text-red-500"
                                                    onClick={() => handleDeleteTestCase(tc.id)}
                                                >
                                                    <Trash2Icon className="h-3 w-3" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            )}

            {/* Test Case Editor Dialog */}
            <TestCaseEditor
                isOpen={isTestCaseEditorOpen}
                onClose={() => {
                    setIsTestCaseEditorOpen(false);
                    setEditingTestCase(undefined);
                }}
                testCase={editingTestCase}
                onSave={handleSaveTestCase}
                auths={auths}
                nextOrder={testCases.length}
                existingNames={existingTestCaseNames}
            />
        </div>
    );
};

// ============================================================================
// Main Component
// ============================================================================

export const TestSuiteEditor: React.FC<TestSuiteEditorProps> = ({
    suite,
    onClose,
}) => {
    const storageAdapter = useStorageAdapter();
    const notification = useNotificationAdapter();

    // Global state
    const collections = useAppStateStore((s) => s.collections);
    const environments = useAppStateStore((s) => s.environments);
    const auths = useAppStateStore((s) => s.auths);
    const flows = useAppStateStore((s) => s.flows);
    const isRunning = useAppStateStore((s) => s.isTestSuiteRunning(suite.id));
    const isDirty = useAppStateStore((s) => s.isTestSuiteDirty(suite.id));
    const updateTestSuiteName = useAppStateStore((s) => s.updateTestSuiteName);
    const updateTestSuiteDefaultEnv = useAppStateStore((s) => s.updateTestSuiteDefaultEnv);
    const updateTestSuiteDefaultAuth = useAppStateStore((s) => s.updateTestSuiteDefaultAuth);
    const updateTestSuiteItems = useAppStateStore((s) => s.updateTestSuiteItems);
    const updateTestSuiteSettings = useAppStateStore((s) => s.updateTestSuiteSettings);
    const markTestSuiteClean = useAppStateStore((s) => s.markTestSuiteClean);
    const updateTestSuite = useAppStateStore((s) => s.updateTestSuite);
    const getTestSuiteById = useAppStateStore((s) => s.getTestSuiteById);

    // Test suite runner
    const runner = useTestSuiteRunner({
        suiteId: suite.id,
        environments,
        auths,
        collections,
        flows,
    });

    // Local state
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [showResults, setShowResults] = useState(true);

    // Get current suite from store (may be updated)
    const currentSuite = getTestSuiteById(suite.id) || suite;

    // Existing item reference IDs
    const existingItemIds = useMemo(() => {
        return new Set(currentSuite.items.map(item => item.referenceId));
    }, [currentSuite.items]);

    // ====== Handlers ======

    const handleSave = useCallback(async () => {
        const result = await storageAdapter.saveTestSuite(currentSuite);
        if (result.isOk) {
            markTestSuiteClean(suite.id);
            notification.showNotification('success', 'Test suite saved');
        } else {
            notification.showNotification('error', result.error);
        }
    }, [currentSuite, storageAdapter, notification, markTestSuiteClean, suite.id]);

    const handleRun = useCallback(async () => {
        setShowResults(true);
        await runner.runTestSuite(currentSuite, {
            environmentId: currentSuite.defaultEnvId,
            defaultAuthId: currentSuite.defaultAuthId,
        });
    }, [runner, currentSuite]);

    const handleCancel = useCallback(() => {
        runner.cancelTestSuite();
    }, [runner]);

    const handleAddItems = useCallback((items: { type: 'request' | 'flow'; referenceId: string; name: string }[]) => {
        const newItems: TestItem[] = items.map((item, index) => {
            const order = currentSuite.items.length + index;
            if (item.type === 'request') {
                return createRequestTestItem(item.referenceId, item.name, order);
            } else {
                return createFlowTestItem(item.referenceId, item.name, order);
            }
        });
        updateTestSuiteItems(suite.id, [...currentSuite.items, ...newItems]);
    }, [currentSuite.items, updateTestSuiteItems, suite.id]);

    const handleRemoveItem = useCallback((itemId: string) => {
        const newItems = currentSuite.items
            .filter(item => item.id !== itemId)
            .map((item, index) => ({ ...item, order: index }));
        updateTestSuiteItems(suite.id, newItems);
    }, [currentSuite.items, updateTestSuiteItems, suite.id]);

    const handleToggleItemEnabled = useCallback((itemId: string) => {
        const newItems = currentSuite.items.map(item => 
            item.id === itemId ? { ...item, enabled: !item.enabled } : item
        );
        updateTestSuiteItems(suite.id, newItems);
    }, [currentSuite.items, updateTestSuiteItems, suite.id]);

    const handleClearResults = useCallback(() => {
        runner.resetTestSuite();
    }, [runner]);

    // ====== Render ======

    return (
        <TooltipProvider>
            <div className="flex h-full">
                {/* Main Editor Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className={cn(
                        "flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700",
                        isRunning && "opacity-80"
                    )}>
                        {/* Lock icon when running */}
                        {isRunning && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Lock className="h-4 w-4 text-amber-600 flex-shrink-0 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>Test suite is running - editing disabled</TooltipContent>
                            </Tooltip>
                        )}

                        {/* Name input */}
                        <input
                            type="text"
                            value={currentSuite.name}
                            onChange={(e) => updateTestSuiteName(suite.id, e.target.value)}
                            disabled={isRunning}
                            className={cn(
                                'text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-500 rounded px-2 py-1 flex-1',
                                'text-slate-800 dark:text-slate-200',
                                'disabled:cursor-not-allowed disabled:text-slate-400 disabled:focus:ring-0'
                            )}
                            placeholder="Test Suite Name"
                        />

                        {/* Environment Select */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Env:</span>
                            <Select
                                value={currentSuite.defaultEnvId || 'none'}
                                onValueChange={(val) => updateTestSuiteDefaultEnv(suite.id, val === 'none' ? undefined : val)}
                            >
                                <SelectTrigger className="w-[140px] h-8 text-sm" disabled={isRunning}>
                                    <SelectValue placeholder="No Environment" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Environment</SelectItem>
                                    {environments.map((env) => (
                                        <SelectItem key={env.id} value={env.id}>
                                            {env.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Auth Select */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Auth:</span>
                            <Select
                                value={currentSuite.defaultAuthId || 'none'}
                                onValueChange={(val) => updateTestSuiteDefaultAuth(suite.id, val === 'none' ? undefined : val)}
                            >
                                <SelectTrigger className="w-[140px] h-8 text-sm" disabled={isRunning}>
                                    <SelectValue placeholder="No Auth" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No Auth</SelectItem>
                                    {auths.map((auth) => (
                                        <SelectItem key={auth.id} value={auth.id}>
                                            {auth.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

                        {/* Add button */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <SecondaryButton
                                    onClick={() => setIsAddDialogOpen(true)}
                                    disabled={isRunning}
                                    icon={<PlusCircleIcon className="h-4 w-4" />}
                                >
                                    Add
                                </SecondaryButton>
                            </TooltipTrigger>
                            <TooltipContent>Add requests or flows to this test suite</TooltipContent>
                        </Tooltip>

                        {/* Save button */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <SecondaryButton
                                    onClick={handleSave}
                                    disabled={isRunning || !isDirty}
                                    icon={<SaveIcon className="h-4 w-4" />}
                                    className={isDirty ? 'text-purple-600' : ''}
                                >
                                    Save
                                </SecondaryButton>
                            </TooltipTrigger>
                            <TooltipContent>Save test suite</TooltipContent>
                        </Tooltip>

                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

                        {/* Run/Cancel button */}
                        {isRunning ? (
                            <PrimaryButton
                                onClick={handleCancel}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                <StopCircleIcon className="h-4 w-4 mr-1" />
                                Stop
                            </PrimaryButton>
                        ) : (
                            <PrimaryButton
                                onClick={handleRun}
                                disabled={currentSuite.items.filter(i => i.enabled).length === 0}
                                className="bg-purple-600 hover:bg-purple-700"
                            >
                                <PlayIcon className="h-4 w-4 mr-1" />
                                Run
                            </PrimaryButton>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {/* Settings Section */}
                        <SettingsSection
                            settings={currentSuite.settings}
                            onSettingsChange={(s) => updateTestSuiteSettings(suite.id, s)}
                            isRunning={isRunning}
                        />

                        {/* Items List */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Test Items ({currentSuite.items.length})
                                </h3>
                            </div>

                            {currentSuite.items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                                    <p className="text-sm text-slate-500 mb-4">
                                        No test items added yet
                                    </p>
                                    <SecondaryButton
                                        onClick={() => setIsAddDialogOpen(true)}
                                        disabled={isRunning}
                                        icon={<PlusCircleIcon className="h-4 w-4" />}
                                    >
                                        Add Items
                                    </SecondaryButton>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {currentSuite.items
                                        .sort((a, b) => a.order - b.order)
                                        .map((item) => (
                                            <TestItemRow
                                                key={item.id}
                                                item={item}
                                                collections={collections}
                                                flows={flows}
                                                auths={auths}
                                                suiteId={suite.id}
                                                onRemove={() => handleRemoveItem(item.id)}
                                                onToggleEnabled={() => handleToggleItemEnabled(item.id)}
                                                isRunning={isRunning}
                                            />
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Results Panel */}
                {showResults && (
                    <div className="w-[400px] flex-shrink-0">
                        <TestResultsPanel
                            suite={currentSuite}
                            collections={collections}
                            flows={flows}
                            result={runner.result}
                            onClearResults={handleClearResults}
                        />
                    </div>
                )}

                {/* Add Item Dialog */}
                <AddItemDialog
                    isOpen={isAddDialogOpen}
                    onClose={() => setIsAddDialogOpen(false)}
                    collections={collections}
                    flows={flows}
                    existingItemIds={existingItemIds}
                    onAddItems={handleAddItems}
                />
            </div>
        </TooltipProvider>
    );
};

export default TestSuiteEditor;
