/**
 * Flow Toolbar Component
 * 
 * Toolbar for flow canvas actions: add request, select env/auth, run/cancel flow.
 */

import React from 'react';
import { 
    PlusCircle, 
    PlayIcon, 
    StopCircleIcon, 
    LayoutGrid,
    SaveIcon,
    Lock,
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

interface FlowToolbarProps {
    /** Flow ID (to check running state from store) */
    flowId: string;
    /** Flow name */
    flowName: string;
    /** Callback when name changes */
    onNameChange?: (name: string) => void;
    /** Callback to add a new request */
    onAddRequest: () => void;
    /** Callback to run the flow */
    onRun: () => void;
    /** Callback to cancel the running flow */
    onCancel: () => void;
    /** Callback to auto-layout nodes */
    onAutoLayout: () => void;
    /** Callback to save the flow */
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
    /** Whether the flow has any nodes */
    hasNodes: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export const FlowToolbar: React.FC<FlowToolbarProps> = ({
    flowId,
    flowName,
    onNameChange,
    onAddRequest,
    onRun,
    onCancel,
    onAutoLayout,
    onSave,
    isDirty = false,
    environments,
    selectedEnvId,
    onEnvChange,
    auths,
    selectedAuthId,
    onAuthChange,
    hasNodes,
}) => {
    const isRunning = useAppStateStore((state) => state.isFlowRunning(flowId));
    
    return (
        <TooltipProvider>
            <div className={cn(
                "flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700",
                isRunning && "opacity-80"
            )}>
                {/* Flow Name */}
                <div className="flex items-center gap-2 flex-1">
                    {isRunning && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Lock className="h-4 w-4 text-amber-600 flex-shrink-0 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent>Flow is running - editing disabled</TooltipContent>
                        </Tooltip>
                    )}
                    <input
                        type="text"
                        value={flowName}
                        onChange={(e) => onNameChange?.(e.target.value)}
                        disabled={isRunning}
                        className={cn(
                            'text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1',
                            'text-slate-800 dark:text-slate-200',
                            'disabled:cursor-not-allowed disabled:text-slate-400 disabled:focus:ring-0'
                        )}
                        placeholder="Flow Name"
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
                            onClick={onAddRequest}
                            disabled={isRunning}
                        >
                            <PlusCircle className="h-4 w-4 mr-1" />
                            Add Request
                        </SecondaryButton>
                    </TooltipTrigger>
                    <TooltipContent>Add an existing request to the flow</TooltipContent>
                </Tooltip>
                
                <Tooltip>
                    <TooltipTrigger asChild>
                        <SecondaryButton
                            size="sm"
                            onClick={onAutoLayout}
                            disabled={isRunning || !hasNodes}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </SecondaryButton>
                    </TooltipTrigger>
                    <TooltipContent>Auto-arrange nodes</TooltipContent>
                </Tooltip>
                
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
                        <TooltipContent>Save flow</TooltipContent>
                    </Tooltip>
                )}
                
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
                
                {/* Run/Cancel Button */}
                {isRunning ? (
                    <PrimaryButton
                        onClick={onCancel}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        <StopCircleIcon className="h-4 w-4 mr-1" />
                        Stop
                    </PrimaryButton>
                ) : (
                    <PrimaryButton
                        onClick={onRun}
                        disabled={!hasNodes}
                    >
                        <PlayIcon className="h-4 w-4 mr-1" />
                        Run Flow
                    </PrimaryButton>
                )}
            </div>
        </TooltipProvider>
    );
};

export default FlowToolbar;
