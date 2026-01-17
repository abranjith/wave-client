/**
 * TestLabPane Component
 * 
 * Sidebar pane for managing test suites (collections of requests and flows).
 * Similar to FlowsPane but for test suites.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
    PlusIcon, 
    PlayIcon, 
    Trash2Icon, 
    FlaskConicalIcon,
    AlertCircleIcon,
    RefreshCwIcon,
    MoreVerticalIcon,
    PencilIcon,
    CircleIcon,
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
import type { TestSuite } from '../../types/testSuite';
import { createNewTestSuite } from '../../types/testSuite';

// ============================================================================
// Types
// ============================================================================

export interface TestLabPaneProps {
    /** Callback when a test suite is selected for editing */
    onTestSuiteSelect?: (suite: TestSuite) => void;
    /** Callback to run a test suite */
    onTestSuiteRun?: (suite: TestSuite) => void;
    /** Callback to retry loading test suites */
    onRetry?: () => void;
}

// ============================================================================
// Component
// ============================================================================

const TestLabPane: React.FC<TestLabPaneProps> = ({ 
    onTestSuiteSelect, 
    onTestSuiteRun,
    onRetry
}) => {
    const storageAdapter = useStorageAdapter();
    const notification = useNotificationAdapter();
    
    // Use store state for test suites
    const testSuites = useAppStateStore((state) => state.testSuites);
    const setTestSuites = useAppStateStore((state) => state.setTestSuites);
    const isLoading = useAppStateStore((state) => state.isTestSuitesLoading);
    const setIsLoading = useAppStateStore((state) => state.setIsTestSuitesLoading);
    const error = useAppStateStore((state) => state.testSuitesLoadError);
    const setError = useAppStateStore((state) => state.setTestSuitesLoadError);
    const updateTestSuite = useAppStateStore((state) => state.updateTestSuite);
    const removeTestSuite = useAppStateStore((state) => state.removeTestSuite);
    const addTestSuite = useAppStateStore((state) => state.addTestSuite);
    const isTestSuiteNameUnique = useAppStateStore((state) => state.isTestSuiteNameUnique);
    const setCurrentEditingTestSuiteId = useAppStateStore((state) => state.setCurrentEditingTestSuiteId);
    const isTestSuiteDirty = useAppStateStore((state) => state.isTestSuiteDirty);
    // Subscribe to run state map so this component re-renders when run state changes
    const testSuiteRunStates = useAppStateStore((state) => state.testSuiteRunStates);
    const isSuiteRunning = useCallback(
        (suiteId: string) => !!testSuiteRunStates[suiteId]?.isRunning,
        [testSuiteRunStates]
    );
    
    // Local state for UI
    const [searchText, setSearchText] = useState('');
    const [editingSuiteId, setEditingSuiteId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Load test suites
    const loadTestSuites = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        const result = await storageAdapter.loadTestSuites();
        
        if (result.isOk) {
            setTestSuites(result.value);
        } else {
            setError(result.error);
        }
        
        setIsLoading(false);
    }, [storageAdapter, setTestSuites, setIsLoading, setError]);

    // Initial load - only if test suites are empty
    useEffect(() => {
        if (testSuites.length === 0 && !isLoading && !error) {
            loadTestSuites();
        }
    }, []);

    // Create new test suite
    const handleCreateTestSuite = useCallback(async () => {
        // Generate a unique name
        let baseName = 'New Test Suite';
        let name = baseName;
        let counter = 1;
        while (!isTestSuiteNameUnique(name)) {
            counter++;
            name = `${baseName} ${counter}`;
        }
        
        const newSuite = createNewTestSuite(name);
        
        const result = await storageAdapter.saveTestSuite(newSuite);
        
        if (result.isOk) {
            addTestSuite(result.value);
            onTestSuiteSelect?.(result.value);
            notification.showNotification('success', 'Test suite created');
        } else {
            notification.showNotification('error', result.error);
        }
    }, [storageAdapter, notification, onTestSuiteSelect, addTestSuite, isTestSuiteNameUnique]);

    // Delete test suite
    const handleDeleteTestSuite = useCallback(async (suiteId: string, suiteName: string) => {
        const result = await storageAdapter.deleteTestSuite(suiteId);
        
        if (result.isOk) {
            removeTestSuite(suiteId);
            notification.showNotification('success', `Deleted "${suiteName}"`);
        } else {
            notification.showNotification('error', result.error);
        }
    }, [storageAdapter, notification, removeTestSuite]);

    // Rename test suite
    const handleRenameStart = useCallback((suite: TestSuite) => {
        setEditingSuiteId(suite.id);
        setEditingName(suite.name);
    }, []);

    const handleRenameEnd = useCallback(async () => {
        if (!editingSuiteId) return;
        
        const suite = testSuites.find(s => s.id === editingSuiteId);
        if (!suite || suite.name === editingName.trim()) {
            setEditingSuiteId(null);
            return;
        }
        
        // Check if the new name is unique
        const trimmedName = editingName.trim() || 'Untitled Test Suite';
        if (!isTestSuiteNameUnique(trimmedName, editingSuiteId)) {
            notification.showNotification('error', `A test suite with the name "${trimmedName}" already exists.`);
            setEditingSuiteId(null);
            return;
        }
        
        const updatedSuite: TestSuite = {
            ...suite,
            name: trimmedName,
            updatedAt: new Date().toISOString(),
        };
        
        const result = await storageAdapter.saveTestSuite(updatedSuite);
        
        if (result.isOk) {
            updateTestSuite(editingSuiteId, result.value);
        } else {
            notification.showNotification('error', result.error);
        }
        
        setEditingSuiteId(null);
    }, [editingSuiteId, editingName, testSuites, storageAdapter, notification, updateTestSuite, isTestSuiteNameUnique]);

    // Filter test suites by search text
    const filteredSuites = searchText.trim()
        ? testSuites.filter(s => 
            s.name.toLowerCase().includes(searchText.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchText.toLowerCase())
          )
        : testSuites;

    // Format date for display
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
        });
    };

    // Count test items
    const getItemCount = (suite: TestSuite) => {
        const requests = suite.items.filter(item => item.type === 'request').length;
        const flows = suite.items.filter(item => item.type === 'flow').length;
        const parts: string[] = [];
        if (requests > 0) parts.push(`${requests} request${requests !== 1 ? 's' : ''}`);
        if (flows > 0) parts.push(`${flows} flow${flows !== 1 ? 's' : ''}`);
        return parts.length > 0 ? parts.join(', ') : 'Empty';
    };

    // ========== Render ==========

    // Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col h-full p-4">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Test Lab</h2>
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
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Test Lab</h2>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                    <AlertCircleIcon className="h-8 w-8 text-red-500 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{error}</p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry || loadTestSuites}
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
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Test Lab</h2>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCreateTestSuite}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                        >
                            <PlusIcon className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create New Test Suite</TooltipContent>
                </Tooltip>
            </div>

            {/* Search */}
            <div className="px-4 pb-2">
                <Input
                    placeholder="Search test suites..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="h-8 text-sm"
                />
            </div>

            {/* Test Suite List */}
            <div className="flex-1 overflow-y-auto px-2">
                {filteredSuites.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        <FlaskConicalIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            {searchText ? 'No test suites match your search' : 'No test suites yet'}
                        </p>
                        {!searchText && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCreateTestSuite}
                            >
                                <PlusIcon className="h-4 w-4 mr-2" />
                                Create Test Suite
                            </Button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-1 py-2">
                        {filteredSuites.map((suite) => (
                            <div
                                key={suite.id}
                                className="group flex items-center gap-2 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                onClick={() => {
                                    setCurrentEditingTestSuiteId(suite.id);
                                    onTestSuiteSelect?.(suite);
                                }}
                            >
                                <FlaskConicalIcon className="h-4 w-4 text-purple-500 flex-shrink-0" />
                                
                                <div className="flex-1 min-w-0">
                                    {editingSuiteId === suite.id ? (
                                        <Input
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onBlur={handleRenameEnd}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRenameEnd();
                                                if (e.key === 'Escape') setEditingSuiteId(null);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-6 text-sm py-0"
                                            autoFocus
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                                {suite.name}
                                            </p>
                                            {isTestSuiteDirty(suite.id) && (
                                                <CircleIcon 
                                                    size={6} 
                                                    className="flex-shrink-0 fill-current text-purple-500 dark:text-purple-400" 
                                                />
                                            )}
                                        </div>
                                    )}
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {getItemCount(suite)} • {formatDate(suite.updatedAt)}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {isSuiteRunning(suite.id) ? (
                                        <span className="text-xs text-purple-600 dark:text-purple-400 font-medium px-2">Running...</span>
                                    ) : (
                                        <>
                                            {onTestSuiteRun && suite.items.length > 0 && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onTestSuiteRun(suite);
                                                            }}
                                                        >
                                                            <PlayIcon className="h-3 w-3 text-green-600" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Run Test Suite</TooltipContent>
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
                                                            handleRenameStart(suite);
                                                        }}
                                                    >
                                                        <PencilIcon className="h-4 w-4 mr-2" />
                                                        Rename
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem 
                                                        className="text-red-600"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteTestSuite(suite.id, suite.name);
                                                        }}
                                                    >
                                                        <Trash2Icon className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TestLabPane;
