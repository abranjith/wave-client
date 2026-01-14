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
    ConnectorCondition,
} from '../../types/flow';
import {
    generateNodeId,
    generateConnectorId,
    autoLayoutFlow,
} from '../../utils/flowUtils';
import { useFlowRunner } from '../../hooks/useFlowRunner';
import useAppStateStore from '../../hooks/store/useAppStateStore';
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
    /** Callback to save the flow (receives current flow state) */
    onSave?: (flow: Flow) => void;
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

// ============================================================================
// Main Component
// ============================================================================

export const FlowCanvas: React.FC<FlowCanvasProps> = ({
    flow,
    onFlowChange,
    onSave,
    collections,
    environments,
    auths,
    showResults = true,
}) => {
    // Flow runner hook - manages flow execution
    const flowRunner = useFlowRunner({
        flowId: flow.id,
        environments,
        auths,
        collections,
    });
    const isLocked = flowRunner.isRunning;

    // Store for tracking dirty state and current editing flow
    const setCurrentEditingFlowId = useAppStateStore((state) => state.setCurrentEditingFlowId);
    const updateFlowNodes = useAppStateStore((state) => state.updateFlowNodes);
    const updateFlowConnectors = useAppStateStore((state) => state.updateFlowConnectors);
    const updateFlowName = useAppStateStore((state) => state.updateFlowName);
    const updateFlowDefaultEnv = useAppStateStore((state) => state.updateFlowDefaultEnv);
    const updateFlowDefaultAuth = useAppStateStore((state) => state.updateFlowDefaultAuth);
    const markFlowClean = useAppStateStore((state) => state.markFlowClean);
    const isFlowDirty = useAppStateStore((state) => state.isFlowDirty);
    const currentFlowIsDirty = isFlowDirty(flow.id);

    // State
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
    const [conditionPopoverOpen, setConditionPopoverOpen] = useState(false);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    // Lock down interactive editors while running
    useEffect(() => {
        if (isLocked) {
            setConnectingFrom(null);
            setIsSearchOpen(false);
            setConditionPopoverOpen(false);
        }
    }, [isLocked]);
    
    // Set current editing flow ID on mount
    useEffect(() => {
        setCurrentEditingFlowId(flow.id);
    }, [flow.id, setCurrentEditingFlowId]);
    
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
        
        // Output handle: -right-2 positions handle 8px outside right edge
        // Handle is 16px (w-4), so center is at: node.x + NODE_WIDTH + 8 - 8 = node.x + NODE_WIDTH
        // But we want connector to start from outside edge of handle circle (radius 8px)
        const startPos = {
            x: sourceNode.position.x + NODE_WIDTH + 8, // Right edge of handle circle
            y: sourceNode.position.y + NODE_HEIGHT / 2,
        };
        
        // Input handle: -left-2 positions handle 8px outside left edge  
        // Handle center is at node.x - 8 + 8 = node.x, but connector should end at left edge
        const endPos = {
            x: targetNode.position.x - 8, // Left edge of handle circle
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
        if (isLocked) return;
        const updatedNodes = flow.nodes.map(n =>
            n.id === nodeId ? { ...n, position } : n
        );
        updateFlowNodes(flow.id, updatedNodes);
        onFlowChange?.({
            ...flow,
            nodes: updatedNodes,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, updateFlowNodes, onFlowChange, isLocked]);
    
    // Handle node delete
    const handleNodeDelete = useCallback((nodeId: string) => {
        if (isLocked) return;
        // Remove node and all connected connectors
        const updatedNodes = flow.nodes.filter(n => n.id !== nodeId);
        const updatedConnectors = flow.connectors.filter(
            c => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
        );
        
        updateFlowNodes(flow.id, updatedNodes);
        updateFlowConnectors(flow.id, updatedConnectors);
        onFlowChange?.({
            ...flow,
            nodes: updatedNodes,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
        
        setSelectedNodeId(null);
    }, [flow, updateFlowNodes, updateFlowConnectors, onFlowChange, isLocked]);
    
    // Handle connection start
    const handleConnectStart = useCallback((nodeId: string) => {
        if (isLocked) return;
        setConnectingFrom(nodeId);
        setSelectedNodeId(null);
        setSelectedConnectorId(null);
    }, [isLocked]);
    
    // Handle connection end
    const handleConnectEnd = useCallback((targetNodeId: string) => {
        if (isLocked) {
            setConnectingFrom(null);
            return;
        }
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
        
        updateFlowConnectors(flow.id, [...flow.connectors, newConnector]);
        onFlowChange?.({
            ...flow,
            connectors: [...flow.connectors, newConnector],
            updatedAt: new Date().toISOString(),
        });
        
        setConnectingFrom(null);
    }, [connectingFrom, flow, updateFlowConnectors, onFlowChange, isLocked]);
    
    // Check if a node is a valid connection target
    const isValidConnectionTarget = useCallback((nodeId: string) => {
        if (isLocked) return false;
        if (!connectingFrom) return false;
        if (connectingFrom === nodeId) return false;
        
        // Check if connector already exists
        return !flow.connectors.some(
            c => c.sourceNodeId === connectingFrom && c.targetNodeId === nodeId
        );
    }, [connectingFrom, flow.connectors, isLocked]);
    
    // Handle connector selection
    const handleConnectorClick = useCallback((connectorId: string) => {
        setSelectedConnectorId(connectorId);
        setSelectedNodeId(null);
        if (!isLocked) {
            setConditionPopoverOpen(true);
        }
    }, [isLocked]);
    
    // Handle connector delete
    const handleConnectorDelete = useCallback((connectorId: string) => {
        if (isLocked) return;
        const updatedConnectors = flow.connectors.filter(c => c.id !== connectorId);
        updateFlowConnectors(flow.id, updatedConnectors);
        onFlowChange?.({
            ...flow,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
        setSelectedConnectorId(null);
    }, [flow, updateFlowConnectors, onFlowChange, isLocked]);
    
    // Handle connector condition change (from popover - uses selected connector)
    const handleConnectorConditionChange = useCallback((condition: ConnectorCondition) => {
        if (!selectedConnectorId) return;
        if (isLocked) return;
        
        const updatedConnectors = flow.connectors.map(c =>
            c.id === selectedConnectorId ? { ...c, condition } : c
        );
        
        updateFlowConnectors(flow.id, updatedConnectors);
        onFlowChange?.({
            ...flow,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
    }, [selectedConnectorId, flow, updateFlowConnectors, onFlowChange, isLocked]);
    
    // Handle connector condition change (from inline dropdown - receives connector ID)
    const handleConnectorConditionChangeById = useCallback((connectorId: string, condition: ConnectorCondition) => {
        if (isLocked) return;
        const updatedConnectors = flow.connectors.map(c =>
            c.id === connectorId ? { ...c, condition } : c
        );
        
        updateFlowConnectors(flow.id, updatedConnectors);
        onFlowChange?.({
            ...flow,
            connectors: updatedConnectors,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, updateFlowConnectors, onFlowChange, isLocked]);
    
    // Handle add request from search
    const handleAddRequest = useCallback((request: SearchableRequest) => {
        if (isLocked) return;
        // Generate unique alias from request name
        let baseAlias = request.name
            .replace(/[^a-zA-Z0-9]/g, '-')
            .substring(0, 20) || 'request';
        //remove trailing - if any
        baseAlias = baseAlias.replace(/-+$/g, '');

        let alias = baseAlias;
        let counter = 1;
        while (flow.nodes.some(n => n.alias.toLowerCase() === alias.toLowerCase())) {
            alias = `${baseAlias}${counter}`;
            counter++;
        }
        
        // Calculate position (right of the last node, or start position)
        const lastNode = flow.nodes[flow.nodes.length - 1];
        const position = lastNode
            ? { x: lastNode.position.x + 300, y: lastNode.position.y }
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
        
        updateFlowNodes(flow.id, [...flow.nodes, newNode]);
        onFlowChange?.({
            ...flow,
            nodes: [...flow.nodes, newNode],
            updatedAt: new Date().toISOString(),
        });
        
        setIsSearchOpen(false);
    }, [flow, updateFlowNodes, onFlowChange, isLocked]);
    
    // Handle auto-layout
    const handleAutoLayout = useCallback(() => {
        if (isLocked) return;
        const layoutedFlow = autoLayoutFlow(flow);
        updateFlowNodes(flow.id, layoutedFlow.nodes);
        onFlowChange?.(layoutedFlow);
    }, [flow, updateFlowNodes, onFlowChange, isLocked]);
    
    // Handle name change
    const handleNameChange = useCallback((name: string) => {
        if (isLocked) return;
        updateFlowName(flow.id, name);
        onFlowChange?.({
            ...flow,
            name,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, updateFlowName, onFlowChange, isLocked]);
    
    // Handle env change
    const handleEnvChange = useCallback((envId: string | undefined) => {
        if (isLocked) return;
        updateFlowDefaultEnv(flow.id, envId);
        onFlowChange?.({
            ...flow,
            defaultEnvId: envId,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, updateFlowDefaultEnv, onFlowChange, isLocked]);
    
    // Handle auth change
    const handleAuthChange = useCallback((authId: string | undefined) => {
        if (isLocked) return;
        updateFlowDefaultAuth(flow.id, authId);
        onFlowChange?.({
            ...flow,
            defaultAuthId: authId,
            updatedAt: new Date().toISOString(),
        });
    }, [flow, updateFlowDefaultAuth, onFlowChange, isLocked]);
    
    // Get node status from run result
    const getNodeStatus = useCallback((nodeId: string) => {
        if (flowRunner.runningNodeIds.has(nodeId)) return 'running';
        return flowRunner.result?.nodeResults.get(nodeId)?.status || 'idle';
    }, [flowRunner.result, flowRunner.runningNodeIds]);
    
    // Get selected connector for popover
    const selectedConnector = selectedConnectorId 
        ? flow.connectors.find(c => c.id === selectedConnectorId)
        : null;
    
    // Handle save and clear dirty flag
    const handleSave = useCallback(() => {
        markFlowClean(flow.id);
        onSave?.(flow);
    }, [flow, markFlowClean, onSave]);
    
    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <FlowToolbar
                flowId={flow.id}
                flowName={flow.name}
                onNameChange={handleNameChange}
                onAddRequest={() => !isLocked && setIsSearchOpen(true)}
                onRun={() => flowRunner.runFlow(flow, {
                    environmentId: flow.defaultEnvId,
                    defaultAuthId: flow.defaultAuthId,
                })}
                onCancel={flowRunner.cancelFlow}
                onAutoLayout={handleAutoLayout}
                onSave={onSave ? handleSave : undefined}
                isDirty={currentFlowIsDirty}
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
                        style={{ 
                            minWidth: '100%', 
                            minHeight: '100%', 
                            zIndex: 10
                        }}
                    >
                        <FlowConnectorDefs />
                        
                        {/* Render connectors */}
                        {flow.connectors.map(connector => {
                            const positions = getConnectorPositions(connector);
                            if (!positions) return null;
                            
                            const isActive = flowRunner.result?.activeConnectorIds.includes(connector.id) || false;
                            const isSkipped = flowRunner.result?.skippedConnectorIds.includes(connector.id) || false;
                            
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
                                    onConditionChange={handleConnectorConditionChangeById}
                                    isReadOnly={isLocked}
                                />
                            );
                        })}
                        
                        {/* Connection preview line */}
                        {connectingFrom && nodeMap.get(connectingFrom) && (
                            <line
                                x1={nodeMap.get(connectingFrom)!.position.x + NODE_WIDTH + 8}
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
                            isReadOnly={isLocked}
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
                    <div className="w-96 min-w-80 max-w-2xl flex-shrink-0 resize-x overflow-auto">
                        <FlowResultsPanel
                                    flow={flow}
                                    collections={collections}
                            result={flowRunner.result}
                            selectedNodeId={selectedNodeId || undefined}
                            onNodeClick={handleNodeClick}
                            onClearResults={flowRunner.resetFlow}
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
                isDisabled={isLocked}
            />
            
            {/* Connector Condition Popover */}
            {selectedConnector && (
                <ConnectorConditionPopover
                    condition={selectedConnector.condition}
                    onChange={handleConnectorConditionChange}
                    open={!isLocked && conditionPopoverOpen}
                    onOpenChange={(open) => !isLocked && setConditionPopoverOpen(open)}
                >
                    {/* Hidden trigger - popover is positioned via selected connector */}
                    <div className="hidden" />
                </ConnectorConditionPopover>
            )}
        </div>
    );
};

export default FlowCanvas;
