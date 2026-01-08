/**
 * Connector Condition Popover
 * 
 * Popover component for editing the condition of a flow connector.
 */

import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import type { ConnectorCondition } from '../../types/flow';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../../utils/common';

// ============================================================================
// Types
// ============================================================================

interface ConnectorConditionPopoverProps {
    /** Current condition */
    condition: ConnectorCondition;
    /** Callback when condition changes */
    onChange: (condition: ConnectorCondition) => void;
    /** Children trigger element */
    children: React.ReactNode;
    /** Whether the popover is open */
    open?: boolean;
    /** Callback when open state changes */
    onOpenChange?: (open: boolean) => void;
}

interface ConditionOption {
    value: ConnectorCondition;
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

// ============================================================================
// Constants
// ============================================================================

const CONDITIONS: ConditionOption[] = [
    {
        value: 'success',
        label: 'Success',
        description: 'Execute when HTTP status is 2xx',
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: 'text-green-600 bg-green-50 border-green-200',
    },
    {
        value: 'failure',
        label: 'Failure',
        description: 'Execute when HTTP status is not 2xx or request fails',
        icon: <XCircle className="h-4 w-4" />,
        color: 'text-red-600 bg-red-50 border-red-200',
    },
    {
        value: 'validation_pass',
        label: 'Validation Pass',
        description: 'Execute when all validation rules pass',
        icon: <CheckCircle2 className="h-4 w-4" />,
        color: 'text-blue-600 bg-blue-50 border-blue-200',
    },
    {
        value: 'validation_fail',
        label: 'Validation Fail',
        description: 'Execute when any validation rule fails',
        icon: <AlertCircle className="h-4 w-4" />,
        color: 'text-orange-600 bg-orange-50 border-orange-200',
    },
    {
        value: 'any',
        label: 'Always',
        description: 'Execute regardless of result (unconditional)',
        icon: <ArrowRight className="h-4 w-4" />,
        color: 'text-slate-600 bg-slate-50 border-slate-200',
    },
];

// ============================================================================
// Main Component
// ============================================================================

export const ConnectorConditionPopover: React.FC<ConnectorConditionPopoverProps> = ({
    condition,
    onChange,
    children,
    open,
    onOpenChange,
}) => {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                {children}
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="center">
                <div className="space-y-1">
                    <div className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
                        Connector Condition
                    </div>
                    {CONDITIONS.map((opt) => (
                        <button
                            key={opt.value}
                            onClick={() => {
                                onChange(opt.value);
                                onOpenChange?.(false);
                            }}
                            className={cn(
                                'w-full flex items-start gap-3 p-2 rounded-md border transition-colors text-left',
                                condition === opt.value
                                    ? opt.color
                                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                            )}
                        >
                            <div className={cn(
                                'flex-shrink-0 mt-0.5',
                                condition === opt.value ? '' : 'text-slate-400'
                            )}>
                                {opt.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={cn(
                                    'text-sm font-medium',
                                    condition === opt.value ? '' : 'text-slate-700 dark:text-slate-300'
                                )}>
                                    {opt.label}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    {opt.description}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default ConnectorConditionPopover;
