/**
 * Flow Canvas Component
 * 
 * Main canvas component for building and running flows.
 * Displays nodes and connectors, handles drag-and-drop, and manages connections.
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { Collection, Environment } from '../../types/collection';
import type { Auth } from '../../hooks/store/createAuthSlice';
import type { 
    Flow, 
    FlowNode as FlowNodeType, 
    FlowConnector as FlowConnectorType,
    FlowRunResult,
    ConnectorCondition,
} from '../../types/flow';
import {
    generateNodeId,
    generateConnectorId,
    autoLayoutFlow,
    getOutgoingConnectors,
    getIncomingConnectors,
} from '../../types/flow';
import { FlowNode } from './FlowNode';
import { FlowConnector, FlowConnectorDefs } from './FlowConnector';
import { FlowToolbar } from './FlowToolbar';
import { FlowRequestSearch, SearchableRequest } from './FlowRequestSearch';
import { FlowResultsPanel } from './FlowResultsPanel';
import { ConnectorConditionPopover } from './ConnectorConditionPopover';
import { cn } from '../../utils/common';

// ============================================================================
// Types
// ============================================================================

export interface FlowCanvasProps {
    /** The flow to display/edit */
    flow: Flow;
    /** Callback when flow changes */
    onFlowChange: (flow: Flow) => void;
    /** Flow run result (from useFlowRunner) */
    runResult?: FlowRunResult | null;
    /** Currently running node IDs */
    runningNodeIds?: Set<string>;
    /** Whether the flow is running */
    isRunning?: boolean;
    /** Callback to run the flow */
    onRun?: () => void;
    /** Callback to cancel the running flow */
    onCancel?: () => void;
    /** Callback to save the flow */
    onSave?: () => void;
    /** Available collections for adding requests */
    collections: Collection[];
    /** Available environments */
    environments: Environment[];
    /** Available auth configurations */
    auths: Auth[];
    /** Whether there are unsaved changes */
    hasUnsavedChanges?: boolean;
    /** Show results panel */
    showResults?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;
const HANDLE_OFFSET_X = 8; // Distance from node edge to handle center

// ============================================================================
// Main Component
// ============================================================================

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
    flow,
    onFlowChange,
    runResult,
    runningNodeIds = new Set(),
    isRunning = false,
    onRun,
    onCancel,
    onSave,
    collections,
    environments,
    auths,
    hasUnsavedChanges = false,
    showResults = true,
}) => {
    // State
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
    const [conditionPopoverOpen, setConditionPopoverOpen] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    
    const canvasRef = useRef<HTMLDivElement>(null);
    
    // Derived state
    const nodeMap = useMemo(() => 
        new Map(flow.nodes.map(n => [n.id, n])), 
        [flow.nodes]
    );
    
    // Calculate connector positions
    const getConnectorPositions = useCallback((connector: FlowConnectorType) => {
        const sourceNode = nodeMap.get(connector.sourceNodeId);
        const targetNode = nodeMap.get(connector.targetNodeId);
        
        if (!sourceNode || !targetNode) {
            return null;
        }
        
        // Output handle is on the right side of source node
        const startPos = {
            x: sourceNode.position.x + NODE_WIDTH - HANDLE_OFFSET_X,
            y: sourceNode.position.y + NODE_HEIGHT / 2,
        };
        
        // Input handle is on the left side of target node
        const endPos = {
            x: targetNode.position.x + HANDLE_OFFSET_X,
            y: targetNode.position.y + NODE_HEIGHT / 2,
        };
        
        return { startPos, endPos };
    }, [nodeMap]);
    
    // Handle canvas click (deselect)
    const handleCanvasClick = useCallback(() => {
        setSelectedNodeId(null);
        setSelectedConnectorId(null);
        setConnectingFrom(null);
    }, []);
    
    // Handle mouse move for connection preview
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (connectingFrom && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            setMousePos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
    }, [connectingFrom]);
    
    // Handle node selection
    const handleNodeClick = useCallback((nodeId: string) => {
        setSelectedNodeId(nodeId);
        setSelectedConnectorId(null);
    }, []);
    
    // Handle node position change
    const handleNodePositionChange = useCallback((nodeId: string, position: { x: number; y: number }) => {
        const updatedNodes = flow.nodes.map(n =>
            n.id === nodeId ? { ...n, position } : n
        );
        onFlowChange({
            ...flow,
            nodes: updatedNodes,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, onFlowChange]);
    
    // Handle node delete
    const handleNodeDelete = useCallback((nodeId: string) => {
        // Remove node and all connected connectors
        const updatedNodes = flow.nodes.filter(n => n.id !== nodeId);
        const updatedConnectors = flow.connectors.filter(
            c => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
        );
        
        onFlowChange({
            ...flow,
            nodes: updatedNodes,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
        
        setSelectedNodeId(null);
    }, [flow, onFlowChange]);
    
    // Handle connection start
    const handleConnectStart = useCallback((nodeId: string) => {
        setConnectingFrom(nodeId);
        setSelectedNodeId(null);
        setSelectedConnectorId(null);
    }, []);
    
    // Handle connection end
    const handleConnectEnd = useCallback((targetNodeId: string) => {
        if (!connectingFrom || connectingFrom === targetNodeId) {
            setConnectingFrom(null);
            return;
        }
        
        // Check if connector already exists
        const exists = flow.connectors.some(
            c => c.sourceNodeId === connectingFrom && c.targetNodeId === targetNodeId
        );
        
        if (exists) {
            setConnectingFrom(null);
            return;
        }
        
        // Create new connector with default condition
        const newConnector: FlowConnectorType = {
            id: generateConnectorId(),
            sourceNodeId: connectingFrom,
            targetNodeId,
            condition: 'success', // Default condition
        };
        
        onFlowChange({
            ...flow,
            connectors: [...flow.connectors, newConnector],
            updatedAt: new Date().toISOString(),
        });
        
        setConnectingFrom(null);
    }, [connectingFrom, flow, onFlowChange]);
    
    // Check if a node is a valid connection target
    const isValidConnectionTarget = useCallback((nodeId: string) => {
        if (!connectingFrom) return false;
        if (connectingFrom === nodeId) return false;
        
        // Check if connector already exists
        return !flow.connectors.some(
            c => c.sourceNodeId === connectingFrom && c.targetNodeId === nodeId
        );
    }, [connectingFrom, flow.connectors]);
    
    // Handle connector selection
    const handleConnectorClick = useCallback((connectorId: string) => {
        setSelectedConnectorId(connectorId);
        setSelectedNodeId(null);
        setConditionPopoverOpen(true);
    }, []);
    
    // Handle connector delete
    const handleConnectorDelete = useCallback((connectorId: string) => {
        const updatedConnectors = flow.connectors.filter(c => c.id !== connectorId);
        onFlowChange({
            ...flow,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
        setSelectedConnectorId(null);
    }, [flow, onFlowChange]);
    
    // Handle connector condition change
    const handleConnectorConditionChange = useCallback((condition: ConnectorCondition) => {
        if (!selectedConnectorId) return;
        
        const updatedConnectors = flow.connectors.map(c =>
            c.id === selectedConnectorId ? { ...c, condition } : c
        );
        
        onFlowChange({
            ...flow,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
    }, [selectedConnectorId, flow, onFlowChange]);
    
    // Handle add request from search
    const handleAddRequest = useCallback((request: SearchableRequest) => {
        // Generate unique alias from request name
        const baseAlias = request.name
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 20) || 'request';
        
        let alias = baseAlias;
        let counter = 1;
        while (flow.nodes.some(n => n.alias.toLowerCase() === alias.toLowerCase())) {
            alias = `${baseAlias}${counter}`;
            counter++;
        }
        
        // Calculate position (right of the last node, or start position)
        const lastNode = flow.nodes[flow.nodes.length - 1];
        const position = lastNode
            ? { x: lastNode.position.x + 250, y: lastNode.position.y }
            : { x: 50, y: 50 };
        
        const newNode: FlowNodeType = {
            id: generateNodeId(),
            alias,
            requestId: request.collectionFilename 
                ? `${request.collectionFilename}:${request.id}`
                : request.id,
            name: request.name,
            method: request.method,
            position,
        };
        
        onFlowChange({
            ...flow,
            nodes: [...flow.nodes, newNode],
            updatedAt: new Date().toISOString(),
        });
        
        setIsSearchOpen(false);
    }, [flow, onFlowChange]);
    
    // Handle auto-layout
    const handleAutoLayout = useCallback(() => {
        const layoutedFlow = autoLayoutFlow(flow);
        onFlowChange(layoutedFlow);
    }, [flow, onFlowChange]);
    
    // Handle name change
    const handleNameChange = useCallback((name: string) => {
        onFlowChange({
            ...flow,
            name,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, onFlowChange]);
    
    // Handle env change
    const handleEnvChange = useCallback((envId: string | undefined) => {
        onFlowChange({
            ...flow,
            defaultEnvId: envId,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, onFlowChange]);
    
    // Handle auth change
    const handleAuthChange = useCallback((authId: string | undefined) => {
        onFlowChange({
            ...flow,
            defaultAuthId: authId,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, onFlowChange]);
    
    // Get node status from run result
    const getNodeStatus = useCallback((nodeId: string) => {
        if (runningNodeIds.has(nodeId)) return 'running';
        return runResult?.nodeResults.get(nodeId)?.status || 'idle';
    }, [runResult, runningNodeIds]);
    
    // Get selected connector for popover
    const selectedConnector = selectedConnectorId 
        ? flow.connectors.find(c => c.id === selectedConnectorId)
        : null;
    
    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <FlowToolbar
                flowName={flow.name}
                onNameChange={handleNameChange}
                onAddRequest={() => setIsSearchOpen(true)}
                onRun={onRun || (() => {})}
                onCancel={onCancel || (() => {})}
                onAutoLayout={handleAutoLayout}
                onSave={onSave}
                isRunning={isRunning}
                hasUnsavedChanges={hasUnsavedChanges}
                environments={environments}
                selectedEnvId={flow.defaultEnvId}
                onEnvChange={handleEnvChange}
                auths={auths}
                selectedAuthId={flow.defaultAuthId}
                onAuthChange={handleAuthChange}
                hasNodes={flow.nodes.length > 0}
            />
            
            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Canvas Area */}
                <div
                    ref={canvasRef}
                    className={cn(
                        'flex-1 relative bg-slate-50 dark:bg-slate-900 overflow-auto',
                        connectingFrom && 'cursor-crosshair'
                    )}
                    onClick={handleCanvasClick}
                    onMouseMove={handleMouseMove}
                    style={{
                        backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                >
                    {/* SVG Layer for Connectors */}
                    <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        style={{ minWidth: '100%', minHeight: '100%' }}
                    >
                        <FlowConnectorDefs />
                        
                        {/* Render connectors */}
                        {flow.connectors.map(connector => {
                            const positions = getConnectorPositions(connector);
                            if (!positions) return null;
                            
                            const isActive = runResult?.activeConnectorIds.includes(connector.id) || false;
                            const isSkipped = runResult?.skippedConnectorIds.includes(connector.id) || false;
                            
                            return (
                                <FlowConnector
                                    key={connector.id}
                                    connector={connector}
                                    startPos={positions.startPos}
                                    endPos={positions.endPos}
                                    isSelected={connector.id === selectedConnectorId}
                                    isActive={isActive}
                                    isSkipped={isSkipped}
                                    onClick={handleConnectorClick}
                                    onDelete={handleConnectorDelete}
                                />
                            );
                        })}
                        
                        {/* Connection preview line */}
                        {connectingFrom && nodeMap.get(connectingFrom) && (
                            <line
                                x1={nodeMap.get(connectingFrom)!.position.x + NODE_WIDTH - HANDLE_OFFSET_X}
                                y1={nodeMap.get(connectingFrom)!.position.y + NODE_HEIGHT / 2}
                                x2={mousePos.x}
                                y2={mousePos.y}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                strokeDasharray="5,5"
                            />
                        )}
                    </svg>
                    
                    {/* Nodes Layer */}
                    {flow.nodes.map(node => (
                        <FlowNode
                            key={node.id}
                            node={node}
                            isSelected={node.id === selectedNodeId}
                            status={getNodeStatus(node.id)}
                            onClick={handleNodeClick}
                            onPositionChange={handleNodePositionChange}
                            onDelete={handleNodeDelete}
                            onConnectStart={handleConnectStart}
                            onConnectEnd={handleConnectEnd}
                            isConnecting={!!connectingFrom}
                            isValidConnectionTarget={isValidConnectionTarget(node.id)}
                        />
                    ))}
                    
                    {/* Empty State */}
                    {flow.nodes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center text-slate-400">
                                <div className="text-lg mb-2">No requests in this flow</div>
                                <button
                                    onClick={() => setIsSearchOpen(true)}
                                    className="text-blue-600 hover:text-blue-700 font-medium"
                                >
                                    + Add your first request
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Results Panel */}
                {showResults && (
                    <div className="w-80 flex-shrink-0">
                        <FlowResultsPanel
                            result={runResult || null}
                            selectedNodeId={selectedNodeId || undefined}
                            onNodeClick={handleNodeClick}
                        />
                    </div>
                )}
            </div>
            
            {/* Request Search Modal */}
            <FlowRequestSearch
                isOpen={isSearchOpen}
                onClose={() => setIsSearchOpen(false)}
                collections={collections}
                onSelectRequest={handleAddRequest}
                existingRequestIds={flow.nodes.map(n => n.requestId)}
            />
            
            {/* Connector Condition Popover */}
            {selectedConnector && (
                <ConnectorConditionPopover
                    condition={selectedConnector.condition}
                    onChange={handleConnectorConditionChange}
                    open={conditionPopoverOpen}
                    onOpenChange={setConditionPopoverOpen}
                >
                    {/* Hidden trigger - popover is positioned via selected connector */}
                    <div className="hidden" />
                </ConnectorConditionPopover>
            )}
        </div>
    );
};

export default FlowCanvas;
