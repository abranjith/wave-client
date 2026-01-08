/**
 * Flow Node Component
 * 
 * Represents a single request node on the Flow canvas.
 * Displays request method badge, name, and provides connection handles.
 * Supports drag-and-drop for repositioning.
 */

import React, { useCallback, useRef, useState } from 'react';
import { 
    GripVertical, 
    Circle, 
    CheckCircle2, 
    XCircle, 
    Loader2,
    Trash2,
} from 'lucide-react';
import type { FlowNode as FlowNodeType, FlowNodeStatus } from '../../types/flow';
import { getHttpMethodColor, cn } from '../../utils/common';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

// ============================================================================
// Types
// ============================================================================

export interface FlowNodeProps {
    /** Node data */
    node: FlowNodeType;
    /** Whether this node is selected */
    isSelected?: boolean;
    /** Current execution status */
    status?: FlowNodeStatus;
    /** Callback when node is clicked */
    onClick?: (nodeId: string) => void;
    /** Callback when node position changes (after drag) */
    onPositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
    /** Callback when delete is clicked */
    onDelete?: (nodeId: string) => void;
    /** Callback when starting a connection from output handle */
    onConnectStart?: (nodeId: string, handleType: 'output') => void;
    /** Callback when ending a connection on input handle */
    onConnectEnd?: (nodeId: string, handleType: 'input') => void;
    /** Whether the canvas is in connecting mode */
    isConnecting?: boolean;
    /** Whether this node is a valid connection target */
    isValidConnectionTarget?: boolean;
}

// ============================================================================
// Status Icon Component
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
            return null;
    }
};

// ============================================================================
// Main Component
// ============================================================================

export const FlowNode: React.FC<FlowNodeProps> = ({
    node,
    isSelected = false,
    status = 'idle',
    onClick,
    onPositionChange,
    onDelete,
    onConnectStart,
    onConnectEnd,
    isConnecting = false,
    isValidConnectionTarget = false,
}) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    
    // Handle drag start
    const handleDragStart = useCallback((e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('.handle')) {
            return; // Don't drag when clicking handles
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        const rect = nodeRef.current?.getBoundingClientRect();
        if (rect) {
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
        
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, []);
    
    // Handle drag move
    const handleDragMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !nodeRef.current) return;
        
        const parent = nodeRef.current.parentElement;
        if (!parent) return;
        
        const parentRect = parent.getBoundingClientRect();
        const newX = e.clientX - parentRect.left - dragOffset.x;
        const newY = e.clientY - parentRect.top - dragOffset.y;
        
        // Constrain to canvas bounds
        const x = Math.max(0, Math.min(newX, parentRect.width - 160));
        const y = Math.max(0, Math.min(newY, parentRect.height - 60));
        
        nodeRef.current.style.left = `${x}px`;
        nodeRef.current.style.top = `${y}px`;
    }, [isDragging, dragOffset]);
    
    // Handle drag end
    const handleDragEnd = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        
        if (nodeRef.current && onPositionChange) {
            const x = parseInt(nodeRef.current.style.left) || node.position.x;
            const y = parseInt(nodeRef.current.style.top) || node.position.y;
            onPositionChange(node.id, { x, y });
        }
    }, [isDragging, node.id, node.position, onPositionChange]);
    
    // Handle node click
    const handleClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onClick?.(node.id);
    }, [node.id, onClick]);
    
    // Handle output connection start
    const handleOutputClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onConnectStart?.(node.id, 'output');
    }, [node.id, onConnectStart]);
    
    // Handle input connection end
    const handleInputClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (isConnecting && isValidConnectionTarget) {
            onConnectEnd?.(node.id, 'input');
        }
    }, [node.id, isConnecting, isValidConnectionTarget, onConnectEnd]);
    
    // Handle delete
    const handleDelete = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete?.(node.id);
    }, [node.id, onDelete]);
    
    // Status-based border color
    const getBorderColor = () => {
        if (isSelected) return 'border-blue-500 ring-2 ring-blue-200';
        if (isValidConnectionTarget) return 'border-green-500 ring-2 ring-green-200';
        switch (status) {
            case 'running': return 'border-blue-400';
            case 'success': return 'border-green-400';
            case 'failed': return 'border-red-400';
            case 'skipped': return 'border-slate-300';
            default: return 'border-slate-200 dark:border-slate-700';
        }
    };
    
    return (
        <TooltipProvider>
            <div
                ref={nodeRef}
                className={cn(
                    'absolute flex items-center gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border-2 shadow-sm cursor-move transition-colors',
                    getBorderColor(),
                    isDragging && 'shadow-lg opacity-90',
                    'min-w-[140px]'
                )}
                style={{
                    left: node.position.x,
                    top: node.position.y,
                }}
                onClick={handleClick}
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
            >
                {/* Input Handle */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            className={cn(
                                'handle absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-slate-300 bg-white dark:bg-slate-700 cursor-crosshair hover:border-blue-500 hover:bg-blue-50 transition-colors',
                                isConnecting && isValidConnectionTarget && 'border-green-500 bg-green-50 animate-pulse'
                            )}
                            onClick={handleInputClick}
                        />
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                        Input
                    </TooltipContent>
                </Tooltip>
                
                {/* Drag Handle */}
                <GripVertical className="h-4 w-4 text-slate-400 flex-shrink-0" />
                
                {/* Method Badge */}
                <span className={cn(
                    'text-xs font-semibold px-1.5 py-0.5 rounded',
                    getHttpMethodColor(node.method)
                )}>
                    {node.method}
                </span>
                
                {/* Node Name */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[80px]">
                            {node.alias || node.name}
                        </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                        <div className="text-xs">
                            <div className="font-medium">{node.name}</div>
                            <div className="text-slate-400">Alias: {node.alias}</div>
                        </div>
                    </TooltipContent>
                </Tooltip>
                
                {/* Status Indicator */}
                {status !== 'idle' && (
                    <div className="ml-auto">
                        <StatusIcon status={status} />
                    </div>
                )}
                
                {/* Delete Button (shown on hover/selection) */}
                {isSelected && onDelete && (
                    <button
                        className="absolute -top-2 -right-2 p-1 bg-red-100 hover:bg-red-200 rounded-full text-red-600 transition-colors"
                        onClick={handleDelete}
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                )}
                
                {/* Output Handle */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            className="handle absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-slate-300 bg-white dark:bg-slate-700 cursor-crosshair hover:border-blue-500 hover:bg-blue-50 transition-colors"
                            onClick={handleOutputClick}
                        />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                        Output (click to connect)
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
};

export default FlowNode;
