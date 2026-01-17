/**
 * Test Suite Toolbar Component
 * 
 * Toolbar for test suite actions: add items, select env/auth, save/run controls.
 * Mirrors the FlowToolbar for consistent styling across the app.
 */

import React from 'react';
import { 
    PlusCircle, 
    PlayIcon, 
    StopCircleIcon, 
    SaveIcon,
    Lock,
    SettingsIcon,
} from 'lucide-react';
import type { Environment } from '../../types/collection';
import type { Auth } from '../../hooks/store/createAuthSlice';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../utils/common';
import useAppStateStore from '../../hooks/store/useAppStateStore';

// ============================================================================
// Types
// ============================================================================

interface TestSuiteToolbarProps {
    /** Test Suite ID (to check running state from store) */
    suiteId: string;
    /** Test Suite name */
    suiteName: string;
    /** Callback when name changes */
    onNameChange?: (name: string) => void;
    /** Callback to open add items dialog */
    onAddItems: () => void;
    /** Callback to run the test suite */
    onRun: () => void;
    /** Callback to cancel the running test suite */
    onCancel: () => void;
    /** Callback to toggle settings panel */
    onToggleSettings?: () => void;
    /** Whether settings panel is expanded */
    isSettingsExpanded?: boolean;
    /** Callback to save the test suite */
    onSave?: () => void;
    /** Whether there are unsaved changes */
    isDirty?: boolean;
    /** Available environments */
    environments: Environment[];
    /** Selected environment ID */
    selectedEnvId?: string;
    /** Callback when environment changes */
    onEnvChange: (envId: string | undefined) => void;
    /** Available auth configurations */
    auths: Auth[];
    /** Selected default auth ID */
    selectedAuthId?: string;
    /** Callback when auth changes */
    onAuthChange: (authId: string | undefined) => void;
    /** Number of enabled test items */
    enabledItemCount: number;
}

// ============================================================================
// Main Component
// ============================================================================

export const TestSuiteToolbar: React.FC<TestSuiteToolbarProps> = ({
    suiteId,
    suiteName,
    onNameChange,
    onAddItems,
    onRun,
    onCancel,
    onToggleSettings,
    isSettingsExpanded = false,
    onSave,
    isDirty = false,
    environments,
    selectedEnvId,
    onEnvChange,
    auths,
    selectedAuthId,
    onAuthChange,
    enabledItemCount,
}) => {
    const isRunning = useAppStateStore((state) => state.isTestSuiteRunning(suiteId));
    
    return (
        <TooltipProvider>
            <div className={cn(
                "flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700",
                isRunning && "opacity-80"
            )}>
                {/* Suite Name */}
                <div className="flex items-center gap-2 flex-1">
                    {isRunning && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Lock className="h-4 w-4 text-amber-600 flex-shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>Test suite is running - editing disabled</TooltipContent>
                        </Tooltip>
                    )}
                    <input
                        type="text"
                        value={suiteName}
                        onChange={(e) => onNameChange?.(e.target.value)}
                        disabled={isRunning}
                        className={cn(
                            'text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-500 rounded px-2 py-1',
                            'text-slate-800 dark:text-slate-200',
                            'disabled:cursor-not-allowed disabled:text-slate-400 disabled:focus:ring-0'
                        )}
                        placeholder="Test Suite Name"
                        aria-disabled={isRunning}
                    />
                </div>
                
                {/* Environment Select */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Env:</span>
                    <Select
                        value={selectedEnvId || 'none'}
                        onValueChange={(val) => onEnvChange(val === 'none' ? undefined : val)}
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
                        value={selectedAuthId || 'none'}
                        onValueChange={(val) => onAuthChange(val === 'none' ? undefined : val)}
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
                
                {/* Action Buttons */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <SecondaryButton
                            size="sm"
                            onClick={onAddItems}
                            disabled={isRunning}
                            colorTheme='purple'
                        >
                            <PlusCircle className="h-4 w-4 mr-1" />
                            Add Items
                        </SecondaryButton>
                    </TooltipTrigger>
                    <TooltipContent>Add requests or flows to this test suite</TooltipContent>
                </Tooltip>
                
                {onToggleSettings && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <SecondaryButton
                                size="sm"
                                onClick={onToggleSettings}
                                disabled={isRunning}
                                className={cn(isSettingsExpanded && 'bg-slate-100 dark:bg-slate-700')}
                                colorTheme='purple'
                            >
                                <SettingsIcon className="h-4 w-4" />
                            </SecondaryButton>
                        </TooltipTrigger>
                        <TooltipContent>Run settings</TooltipContent>
                    </Tooltip>
                )}
                
                {onSave && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <SecondaryButton
                                size="sm"
                                onClick={onSave}
                                disabled={isRunning || !isDirty}
                                colorTheme="success"
                            >
                                <SaveIcon className="h-4 w-4" />
                            </SecondaryButton>
                        </TooltipTrigger>
                        <TooltipContent>Save test suite</TooltipContent>
                    </Tooltip>
                )}
                
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
                
                {/* Run/Cancel Button */}
                {isRunning ? (
                    <PrimaryButton
                        onClick={onCancel}
                        colorTheme="error"
                    >
                        <StopCircleIcon className="h-4 w-4 mr-1" />
                        Stop
                    </PrimaryButton>
                ) : (
                    <PrimaryButton
                        onClick={onRun}
                        disabled={enabledItemCount === 0}
                        colorTheme="purple"
                    >
                        <PlayIcon className="h-4 w-4 mr-1" />
                        Run Suite
                    </PrimaryButton>
                )}
            </div>
        </TooltipProvider>
    );
};

export default TestSuiteToolbar;
