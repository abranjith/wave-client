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
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get color for connector condition
 */
function getConditionColor(condition: ConnectorCondition, isActive: boolean, isSkipped: boolean): string {
    if (isSkipped) return '#94a3b8'; // slate-400
    if (!isActive && condition !== 'any') return '#cbd5e1'; // slate-300
    
    switch (condition) {
        case 'success':
            return '#22c55e'; // green-500
        case 'failure':
            return '#ef4444'; // red-500
        case 'validation_pass':
            return '#3b82f6'; // blue-500
        case 'validation_fail':
            return '#f97316'; // orange-500
        case 'any':
        default:
            return '#64748b'; // slate-500
    }
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
            return 60;
        case 'success':
        case 'failure':
        case 'any':
        default:
            return 55;
    }
}

/**
 * Calculate bezier curve path between two points
 */
function calculatePath(
    start: { x: number; y: number },
    end: { x: number; y: number }
): string {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    
    // Control points for smooth curve
    const curvature = Math.min(Math.abs(dx) * 0.5, 80);
    
    const cx1 = start.x + curvature;
    const cy1 = start.y;
    const cx2 = end.x - curvature;
    const cy2 = end.y;
    
    return `M ${start.x} ${start.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`;
}

/**
 * Calculate midpoint of bezier curve for label placement
 */
function calculateMidpoint(
    start: { x: number; y: number },
    end: { x: number; y: number }
): { x: number; y: number } {
    // Approximate midpoint of bezier
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
}) => {
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const path = useMemo(() => calculatePath(startPos, endPos), [startPos, endPos]);
    const midpoint = useMemo(() => calculateMidpoint(startPos, endPos), [startPos, endPos]);
    const color = getConditionColor(connector.condition, isActive, isSkipped);
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
        // Only select if not editing condition
        if (!onConditionChange) {
            onClick?.(connector.id);
        }
    };
    
    const handleLabelClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onConditionChange) {
            setShowDropdown(!showDropdown);
        } else {
            onClick?.(connector.id);
        }
    };
    
    const handleConditionSelect = (condition: ConnectorCondition) => {
        onConditionChange?.(connector.id, condition);
        setShowDropdown(false);
    };
    
    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete?.(connector.id);
    };
    
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
                stroke={color}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isSkipped ? '5,5' : 'none'}
                className={cn(
                    'transition-all duration-200',
                    isSelected && 'filter drop-shadow-md'
                )}
                markerEnd="url(#arrowhead)"
            />
            
            {/* Condition label - clickable to edit */}
            <g 
                transform={`translate(${midpoint.x}, ${midpoint.y})`}
                onClick={handleLabelClick}
                style={{ pointerEvents: 'auto' }}
                className={cn('cursor-pointer', onConditionChange && 'hover:opacity-75 transition-opacity')}
            >
                <rect
                    x={-labelWidth / 2}
                    y={-10}
                    width={labelWidth}
                    height={20}
                    rx={4}
                    fill={isSelected || showDropdown ? color : 'white'}
                    stroke={color}
                    strokeWidth={2}
                    style={{ pointerEvents: 'auto' }}
                />
                <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fontSize={10}
                    fill={isSelected || showDropdown ? 'white' : color}
                    className="pointer-events-none font-medium select-none"
                >
                    {label}
                </text>
                {/* Small edit indicator */}
                {onConditionChange && !isSelected && !showDropdown && (
                    <text
                        x={labelWidth / 2 - 8}
                        y={4}
                        fontSize={8}
                        fill={color}
                        className="pointer-events-none opacity-60"
                    >
                        ▼
                    </text>
                )}
            </g>
            
            {/* Condition dropdown (using foreignObject for HTML dropdown) */}
            {showDropdown && (
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
                                        connector.condition === opt.value
                                            ? 'bg-slate-50 dark:bg-slate-700'
                                            : ''
                                    )}
                                    style={{ 
                                        color: getConditionColor(opt.value, true, false),
                                        pointerEvents: 'auto',
                                    }}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {onDelete && (
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
 */
export const FlowConnectorDefs: React.FC = () => (
    <defs>
        <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
        >
            <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#64748b"
            />
        </marker>
        <marker
            id="arrowhead-success"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
        >
            <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
        </marker>
        <marker
            id="arrowhead-failure"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
            markerUnits="strokeWidth"
        >
            <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
        </marker>
    </defs>
);

export default FlowConnector;
