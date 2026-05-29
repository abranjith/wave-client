/**
 * Flow Connector Component
 * 
 * SVG connector (edge) between two flow nodes.
 * Shows condition type with color coding and supports click-to-edit.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { FlowConnector as FlowConnectorType, ConnectorCondition } from '../../types/flow';
import { cn } from '../../utils/common';

// ============================================================================
// Types
// ============================================================================

export interface FlowConnectorProps {
    /** Connector data */
    connector: FlowConnectorType;
    /** Start position (from source node's output handle) */
    startPos: { x: number; y: number };
    /** End position (to target node's input handle) */
    endPos: { x: number; y: number };
    /** Whether this connector is selected */
    isSelected?: boolean;
    /** Whether this connector was active in the last run */
    isActive?: boolean;
    /** Whether this connector was skipped in the last run */
    isSkipped?: boolean;
    /** Callback when connector is clicked */
    onClick?: (connectorId: string) => void;
    /** Callback when delete is requested */
    onDelete?: (connectorId: string) => void;
    /** Callback when condition changes */
    onConditionChange?: (connectorId: string, condition: ConnectorCondition) => void;
    /** Whether the connector is read-only (e.g., flow running) */
    isReadOnly?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Tailwind class tokens for connector condition visuals
 */
interface ConnectorConditionStyle {
    strokeClass: string;
    labelFillClass: string;
    labelTextClass: string;
    selectedLabelFillClass: string;
    selectedLabelTextClass: string;
    dropdownTextClass: string;
}

const CONDITION_STYLES: Record<ConnectorCondition, ConnectorConditionStyle> = {
    success: {
        strokeClass: 'stroke-emerald-500 dark:stroke-emerald-400',
        labelFillClass: 'fill-emerald-50 dark:fill-emerald-950/45',
        labelTextClass: 'fill-emerald-700 dark:fill-emerald-200',
        selectedLabelFillClass: 'fill-emerald-500 dark:fill-emerald-400',
        selectedLabelTextClass: 'fill-white dark:fill-slate-950',
        dropdownTextClass: 'text-emerald-700 dark:text-emerald-300',
    },
    failure: {
        strokeClass: 'stroke-rose-500 dark:stroke-rose-400',
        labelFillClass: 'fill-rose-50 dark:fill-rose-950/45',
        labelTextClass: 'fill-rose-700 dark:fill-rose-200',
        selectedLabelFillClass: 'fill-rose-500 dark:fill-rose-400',
        selectedLabelTextClass: 'fill-white dark:fill-slate-950',
        dropdownTextClass: 'text-rose-700 dark:text-rose-300',
    },
    validation_pass: {
        strokeClass: 'stroke-blue-500 dark:stroke-blue-400',
        labelFillClass: 'fill-blue-50 dark:fill-blue-950/45',
        labelTextClass: 'fill-blue-700 dark:fill-blue-200',
        selectedLabelFillClass: 'fill-blue-500 dark:fill-blue-400',
        selectedLabelTextClass: 'fill-white dark:fill-slate-950',
        dropdownTextClass: 'text-blue-700 dark:text-blue-300',
    },
    validation_fail: {
        strokeClass: 'stroke-orange-500 dark:stroke-orange-400',
        labelFillClass: 'fill-orange-50 dark:fill-orange-950/45',
        labelTextClass: 'fill-orange-700 dark:fill-orange-200',
        selectedLabelFillClass: 'fill-orange-500 dark:fill-orange-400',
        selectedLabelTextClass: 'fill-white dark:fill-slate-950',
        dropdownTextClass: 'text-orange-700 dark:text-orange-300',
    },
    any: {
        strokeClass: 'stroke-slate-500 dark:stroke-slate-400',
        labelFillClass: 'fill-slate-100 dark:fill-slate-800',
        labelTextClass: 'fill-slate-700 dark:fill-slate-200',
        selectedLabelFillClass: 'fill-slate-600 dark:fill-slate-400',
        selectedLabelTextClass: 'fill-white dark:fill-slate-950',
        dropdownTextClass: 'text-slate-700 dark:text-slate-300',
    },
};

const SKIPPED_CONDITION_STYLE: ConnectorConditionStyle = {
    strokeClass: 'stroke-slate-400 dark:stroke-slate-500',
    labelFillClass: 'fill-slate-100 dark:fill-slate-800',
    labelTextClass: 'fill-slate-600 dark:fill-slate-300',
    selectedLabelFillClass: 'fill-slate-400 dark:fill-slate-500',
    selectedLabelTextClass: 'fill-white dark:fill-slate-950',
    dropdownTextClass: 'text-slate-600 dark:text-slate-300',
};

const INACTIVE_CONDITION_STYLE: ConnectorConditionStyle = {
    strokeClass: 'stroke-slate-300 dark:stroke-slate-600',
    labelFillClass: 'fill-slate-50 dark:fill-slate-800/80',
    labelTextClass: 'fill-slate-500 dark:fill-slate-400',
    selectedLabelFillClass: 'fill-slate-300 dark:fill-slate-600',
    selectedLabelTextClass: 'fill-slate-700 dark:fill-slate-100',
    dropdownTextClass: 'text-slate-500 dark:text-slate-300',
};

/**
 * Returns condition style tokens for stroke/fill/text with state-aware overrides.
 */
function getConditionStyle(condition: ConnectorCondition, isActive: boolean, isSkipped: boolean): ConnectorConditionStyle {
    if (isSkipped) return SKIPPED_CONDITION_STYLE;
    if (!isActive && condition !== 'any') return INACTIVE_CONDITION_STYLE;
    return CONDITION_STYLES[condition] ?? CONDITION_STYLES.any;
}

/**
 * Get stroke color classes for connector condition
 */
function getConditionColor(condition: ConnectorCondition, isActive: boolean, isSkipped: boolean): string {
    return getConditionStyle(condition, isActive, isSkipped).strokeClass;
}

/**
 * Get dropdown text color classes for connector condition
 */
function getConditionOptionTextColor(condition: ConnectorCondition): string {
    return CONDITION_STYLES[condition]?.dropdownTextClass ?? CONDITION_STYLES.any.dropdownTextClass;
}

/**
 * Get label for connector condition
 */
function getConditionLabel(condition: ConnectorCondition): string {
    switch (condition) {
        case 'success':
            return 'Success';
        case 'failure':
            return 'Failure';
        case 'validation_pass':
            return 'Validation Pass';
        case 'validation_fail':
            return 'Validation Fail';
        case 'any':
            return 'Always';
        default:
            return condition;
    }
}

/**
 * Get label width based on condition
 */
function getLabelWidth(condition: ConnectorCondition): number {
    switch (condition) {
        case 'validation_pass':
        case 'validation_fail':
            return 86;
        case 'success':
        case 'failure':
        case 'any':
        default:
            return 55;
    }
}

/**
 * Calculate bezier curve path between two points
 * For backwards connections (end.x < start.x), creates a loop going below
 */
function calculatePath(
    start: { x: number; y: number },
    end: { x: number; y: number }
): string {
    const dx = end.x - start.x;
    
    // Check if this is a backwards connection (target is to the left)
    const isBackwards = dx < -30;
    
    if (isBackwards) {
        // Create a loop path going BELOW the nodes (stays in viewport)
        const loopDrop = 50;
        const curveRadius = 25;
        
        const bottomY = Math.max(start.y, end.y) + loopDrop;
        
        // Path: start → curve down-right → horizontal left → curve up → end
        return `M ${start.x} ${start.y}
                C ${start.x + curveRadius} ${start.y}, 
                  ${start.x + curveRadius} ${bottomY}, 
                  ${start.x} ${bottomY}
                L ${end.x} ${bottomY}
                C ${end.x - curveRadius} ${bottomY}, 
                  ${end.x - curveRadius} ${end.y}, 
                  ${end.x} ${end.y}`;
    }
    
    // Forward connection - smooth bezier curve
    const curvature = Math.min(Math.abs(dx) * 0.4, 60);
    
    return `M ${start.x} ${start.y} C ${start.x + curvature} ${start.y}, ${end.x - curvature} ${end.y}, ${end.x} ${end.y}`;
}

/**
 * Calculate midpoint of bezier curve for label placement
 */
function calculateMidpoint(
    start: { x: number; y: number },
    end: { x: number; y: number }
): { x: number; y: number } {
    const dx = end.x - start.x;
    const isBackwards = dx < -20;
    
    if (isBackwards) {
        // For backwards connections, place label at the bottom of the loop
        const loopDrop = 50;
        const bottomY = Math.max(start.y, end.y) + loopDrop;
        const midX = (start.x + end.x) / 2;
        return {
            x: midX,
            y: bottomY,
        };
    }
    
    // Forward connections: midpoint between start and end
    return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2 - 10, // Slightly above the line
    };
}

// ============================================================================
// Condition Options for Dropdown
// ============================================================================

const CONDITION_OPTIONS: { value: ConnectorCondition; label: string }[] = [
    { value: 'success', label: 'Success' },
    { value: 'failure', label: 'Failure' },
    { value: 'validation_pass', label: 'Validation Pass' },
    { value: 'validation_fail', label: 'Validation Fail' },
    { value: 'any', label: 'Always' },
];

// ============================================================================
// Main Component
// ============================================================================

export const FlowConnector: React.FC<FlowConnectorProps> = ({
    connector,
    startPos,
    endPos,
    isSelected = false,
    isActive = false,
    isSkipped = false,
    onClick,
    onDelete,
    onConditionChange,
    isReadOnly = false,
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const path = useMemo(() => calculatePath(startPos, endPos), [startPos, endPos]);
    const midpoint = useMemo(() => calculateMidpoint(startPos, endPos), [startPos, endPos]);
    const conditionStyle = getConditionStyle(connector.condition, isActive, isSkipped);
    const strokeClass = getConditionColor(connector.condition, isActive, isSkipped);
    const label = getConditionLabel(connector.condition);
    const labelWidth = getLabelWidth(connector.condition);
    
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        
        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showDropdown]);
    
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Allow selection but block editing pathways when read-only
        if (!onConditionChange || isReadOnly) {
            onClick?.(connector.id);
        }
    };
    
    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isReadOnly) {
            onClick?.(connector.id);
            return;
        }
        if (onConditionChange) {
            setShowDropdown(!showDropdown);
        } else {
            onClick?.(connector.id);
        }
    };
    
    const handleConditionSelect = (condition: ConnectorCondition) => {
        if (isReadOnly) return;
        onConditionChange?.(connector.id, condition);
        setShowDropdown(false);
    };
    
    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isReadOnly) return;
        onDelete?.(connector.id);
    };

    // Close dropdown if we become read-only mid-edit
    useEffect(() => {
        if (isReadOnly) {
            setShowDropdown(false);
        }
    }, [isReadOnly]);
    
    return (
        <g className="flow-connector">
            {/* Invisible wider path for easier clicking the connector line */}
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer"
                onClick={handleClick}
            />
            
            {/* Visible connector path */}
            <path
                d={path}
                fill="none"
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isSkipped ? '5,5' : 'none'}
                className={cn(
                    'transition-all duration-200',
                    strokeClass,
                    isSelected && 'filter drop-shadow-md'
                )}
                markerEnd="url(#arrowhead)"
            />
            
            {/* Condition label - clickable to edit */}
            <g 
                transform={`translate(${midpoint.x}, ${midpoint.y})`}
                onClick={handleLabelClick}
                style={{ pointerEvents: 'auto' }}
                className={cn(
                    'cursor-pointer',
                    onConditionChange && !isReadOnly && 'hover:opacity-75 transition-opacity',
                    isReadOnly && 'cursor-default'
                )}
            >
                <rect
                    x={-labelWidth / 2}
                    y={-10}
                    width={labelWidth}
                    height={20}
                    rx={4}
                    strokeWidth={2}
                    style={{ pointerEvents: 'auto' }}
                    className={cn(
                        'transition-colors duration-200',
                        strokeClass,
                        isSelected || showDropdown
                            ? conditionStyle.selectedLabelFillClass
                            : conditionStyle.labelFillClass
                    )}
                />
                <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fontSize={10}
                    className={cn(
                        'pointer-events-none font-medium select-none transition-colors duration-200',
                        isSelected || showDropdown
                            ? conditionStyle.selectedLabelTextClass
                            : conditionStyle.labelTextClass
                    )}
                >
                    {label}
                </text>
                {/* Small edit indicator */}
                {onConditionChange && !isSelected && !showDropdown && !isReadOnly && (
                    <text
                        x={labelWidth / 2 - 8}
                        y={4}
                        fontSize={8}
                        className={cn('pointer-events-none opacity-60', conditionStyle.labelTextClass)}
                    >
                        ▼
                    </text>
                )}
            </g>
            
            {/* Condition dropdown (using foreignObject for HTML dropdown) */}
            {showDropdown && !isReadOnly && (
                <foreignObject
                    x={midpoint.x - 75}
                    y={midpoint.y + 15}
                    width={150}
                    height={220}
                    style={{ overflow: 'visible', pointerEvents: 'auto' }}
                >
                    <div 
                        ref={dropdownRef}
                        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700"
                        style={{ pointerEvents: 'auto' }}
                    >
                        <div className="py-1" style={{ pointerEvents: 'auto' }}>
                            {CONDITION_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleConditionSelect(opt.value);
                                    }}
                                    className={cn(
                                        'w-full px-4 py-2 text-left text-xs transition-colors cursor-pointer font-medium hover:bg-slate-100 dark:hover:bg-slate-700',
                                        getConditionOptionTextColor(opt.value),
                                        connector.condition === opt.value
                                            ? 'bg-slate-50 dark:bg-slate-700'
                                            : ''
                                    )}
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {onDelete && !isReadOnly && (
                            <>
                                <div className="border-t border-slate-200 dark:border-slate-700" style={{ pointerEvents: 'auto' }} />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteClick(e);
                                    }}
                                    className="w-full px-4 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition-colors font-medium cursor-pointer"
                                    style={{ pointerEvents: 'auto' }}
                                >
                                    🗑️ Delete
                                </button>
                            </>
                        )}
                    </div>
                </foreignObject>
            )}
        </g>
    );
};

/**
 * SVG Defs for arrow markers - include this once in your SVG container
 * refX=10 places the arrow tip exactly at the path endpoint
 */
export const FlowConnectorDefs: React.FC = () => (
    <defs>
        <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
        >
            <polygon
                points="0 0, 10 4, 0 8"
                fill="#64748b"
            />
        </marker>
        <marker
            id="arrowhead-success"
            markerWidth="10"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
        >
            <polygon points="0 0, 10 4, 0 8" fill="#22c55e" />
        </marker>
        <marker
            id="arrowhead-failure"
            markerWidth="10"
            markerHeight="8"
            refX="10"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
        >
            <polygon points="0 0, 10 4, 0 8" fill="#ef4444" />
        </marker>
    </defs>
);

export default FlowConnector;
