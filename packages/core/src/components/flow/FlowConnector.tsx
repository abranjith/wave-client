/**
 * Flow Connector Component
 * 
 * SVG connector (edge) between two flow nodes.
 * Shows condition type with color coding and supports click-to-edit.
 */

import React, { useMemo } from 'react';
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
            return 'Validation ✓';
        case 'validation_fail':
            return 'Validation ✗';
        case 'any':
            return 'Always';
        default:
            return condition;
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
}) => {
    const path = useMemo(() => calculatePath(startPos, endPos), [startPos, endPos]);
    const midpoint = useMemo(() => calculateMidpoint(startPos, endPos), [startPos, endPos]);
    const color = getConditionColor(connector.condition, isActive, isSkipped);
    const label = getConditionLabel(connector.condition);
    
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onClick?.(connector.id);
    };
    
    const handleDeleteClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onDelete?.(connector.id);
    };
    
    return (
        <g className="flow-connector" onClick={handleClick}>
            {/* Invisible wider path for easier clicking */}
            <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                className="cursor-pointer"
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
            
            {/* Condition label */}
            <g transform={`translate(${midpoint.x}, ${midpoint.y})`}>
                <rect
                    x={-30}
                    y={-10}
                    width={60}
                    height={20}
                    rx={4}
                    fill={isSelected ? color : 'white'}
                    stroke={color}
                    strokeWidth={1}
                    className="cursor-pointer"
                />
                <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fontSize={10}
                    fill={isSelected ? 'white' : color}
                    className="pointer-events-none font-medium"
                >
                    {label}
                </text>
            </g>
            
            {/* Delete button (shown when selected) */}
            {isSelected && onDelete && (
                <g 
                    transform={`translate(${midpoint.x + 40}, ${midpoint.y})`}
                    onClick={handleDeleteClick}
                    className="cursor-pointer"
                >
                    <circle r={10} fill="#fef2f2" stroke="#ef4444" strokeWidth={1} />
                    <text
                        x={0}
                        y={4}
                        textAnchor="middle"
                        fontSize={12}
                        fill="#ef4444"
                        className="font-bold"
                    >
                        ×
                    </text>
                </g>
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
