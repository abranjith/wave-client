/**
 * TabsBar Component
 * Displays the list of open request tabs with add/close functionality.
 * Supports keyboard shortcuts (Ctrl+T for new tab, Ctrl+W for close tab).
 */

import React, { useEffect, useCallback, useState } from 'react';
import { PlusIcon, XIcon, CircleIcon, SaveIcon, BanIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { getTabDisplayName, TAB_CONSTANTS } from '../../types/tab';
import { cn } from '../../utils/common';

interface TabsBarProps {
    className?: string;
    onSave?: (tabId: string) => void;
}

const TabsBar: React.FC<TabsBarProps> = ({ className, onSave }) => {
    const tabs = useAppStateStore((state) => state.tabs);
    const activeTabId = useAppStateStore((state) => state.activeTabId);
    const addTab = useAppStateStore((state) => state.addTab);
    const closeTab = useAppStateStore((state) => state.closeTab);
    const setActiveTab = useAppStateStore((state) => state.setActiveTab);
    const canAddTab = useAppStateStore((state) => state.canAddTab);

    const [tabToClose, setTabToClose] = useState<string | null>(null);

    // Keyboard shortcuts handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Ctrl+T: New Tab
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            if (canAddTab()) {
                addTab();
            }
        }
        
        // Ctrl+W: Close current tab
        if (e.ctrlKey && e.key === 'w') {
            e.preventDefault();
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab?.isDirty) {
                setTabToClose(activeTabId);
            } else {
                closeTab(activeTabId);
            }
        }
    }, [activeTabId, addTab, closeTab, canAddTab, tabs]);

    // Register keyboard shortcuts
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);

    const handleTabClick = (tabId: string) => {
        setActiveTab(tabId);
    };

    const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation(); // Prevent tab activation when clicking close
        const tab = tabs.find(t => t.id === tabId);
        if (tab?.isDirty) {
            setTabToClose(tabId);
        } else {
            closeTab(tabId);
        }
    };

    const handleAddTab = () => {
        if (canAddTab()) {
            addTab();
        }
    };

    // Get method color for visual distinction
    const getMethodColor = (method: string): string => {
        switch (method?.toUpperCase()) {
            case 'GET':
                return 'text-green-600 dark:text-green-400';
            case 'POST':
                return 'text-yellow-600 dark:text-yellow-400';
            case 'PUT':
                return 'text-blue-600 dark:text-blue-400';
            case 'DELETE':
                return 'text-red-600 dark:text-red-400';
            case 'PATCH':
                return 'text-purple-600 dark:text-purple-400';
            case 'HEAD':
                return 'text-gray-600 dark:text-gray-400';
            case 'OPTIONS':
                return 'text-indigo-600 dark:text-indigo-400';
            default:
                return 'text-slate-600 dark:text-slate-400';
        }
    };

    const handleConfirmClose = () => {
        if (tabToClose) {
            closeTab(tabToClose);
            setTabToClose(null);
        }
    };

    const handleSaveAndClose = () => {
        if (tabToClose && onSave) {
            onSave(tabToClose);
            setTabToClose(null);
        }
    };

    const tabToCloseObj = tabs.find(t => t.id === tabToClose);

    return (
        <div 
            className={cn(
                "relative flex items-center bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700",
                className
            )}
        >
            {/* Scrollable Tab Container */}
            <div className="flex items-center overflow-x-auto flex-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-600">
                {/* Tab List */}
                {tabs.map((tab) => (
                    <TooltipProvider delayDuration={500} key={tab.id}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div
                                    onClick={() => handleTabClick(tab.id)}
                                    className={cn(
                                        "group flex items-center gap-2 px-4 py-2 min-w-[120px] max-w-[200px] cursor-pointer border-r border-slate-200 dark:border-slate-700 transition-colors",
                                        tab.id === activeTabId
                                            ? "bg-white dark:bg-slate-900 border-b-2 border-b-blue-500"
                                            : "bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    )}
                                >
                                    {/* Method Badge */}
                                    <span className={cn(
                                        "text-xs font-bold flex-shrink-0",
                                        getMethodColor(tab.method)
                                    )}>
                                        {tab.method?.substring(0, 3) || 'GET'}
                                    </span>

                                    {/* Tab Name */}
                                    <span className="flex-1 text-sm truncate text-slate-700 dark:text-slate-300">
                                        {getTabDisplayName(tab)}
                                    </span>

                                    {/* Dirty Indicator */}
                                    {tab.isDirty && (
                                        <CircleIcon 
                                            size={6} 
                                            className="flex-shrink-0 fill-current text-blue-500 dark:text-blue-400" 
                                        />
                                    )}

                                    {/* Close Button */}
                                    <button
                                        onClick={(e) => handleCloseClick(e, tab.id)}
                                        className={cn(
                                            "flex-shrink-0 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors",
                                            "opacity-0 group-hover:opacity-100",
                                            tab.id === activeTabId && "opacity-100"
                                        )}
                                        aria-label="Close tab"
                                    >
                                        <XIcon size={14} className="text-slate-500 dark:text-slate-400" />
                                    </button>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className="px-2 py-1 text-xs max-w-xs">
                                <div className="font-medium">{getTabDisplayName(tab)}</div>
                                {tab.url && <div className="text-slate-400 dark:text-slate-500 truncate">{tab.url}</div>}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ))}
            </div>

            {/* Sticky Add Tab Button - always visible on the right */}
            {canAddTab() && (
                <div className="flex-shrink-0 bg-slate-100 dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700">
                    <TooltipProvider delayDuration={300}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <SecondaryButton
                                    variant="ghost"
                                    onClick={handleAddTab}
                                    icon={<PlusIcon size={20} />}
                                    text="New Tab"
                                    colorTheme="main"
                                    className="h-[38px] w-[120px] px-4 py-2 rounded-none"
                                    aria-label="New tab"
                                />
                            </TooltipTrigger>
                            <TooltipContent className="px-2 py-1 text-xs">
                                New Tab (Ctrl+T) • {tabs.length}/{TAB_CONSTANTS.MAX_TABS}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            <Dialog open={!!tabToClose} onOpenChange={(open) => !open && setTabToClose(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">Unsaved Changes</DialogTitle>
                        <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
                            Do you want to save the changes you made to "{tabToCloseObj ? getTabDisplayName(tabToCloseObj) : 'Request'}"?
                            <br/>
                            Your changes will be lost if you don't save them.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <SecondaryButton
                            onClick={handleConfirmClose}
                            colorTheme="error"
                            icon={<BanIcon />}
                            text="Don't Save"
                        />
                        <SecondaryButton
                            onClick={() => setTabToClose(null)}
                            colorTheme="warning"
                            icon={<XIcon />}
                            text="Cancel"
                        />
                        <PrimaryButton
                            onClick={handleSaveAndClose}
                            colorTheme="main"
                            icon={<SaveIcon />}
                            text="Save"
                        />
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default TabsBar;
