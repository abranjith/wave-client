import { StateCreator } from 'zustand';
import { Flow, FlowNode, FlowConnector } from '../../types/flow';

interface FlowsSlice {
    flows: Flow[];
    isFlowsLoading: boolean;
    flowsLoadError: string | null;
    currentEditingFlowId: string | null;
    flowDirtyStates: Record<string, boolean>; // Track dirty state per flow ID
    setFlows: (flows: Flow[]) => void;
    setIsFlowsLoading: (isLoading: boolean) => void;
    setFlowsLoadError: (error: string | null) => void;
    addFlow: (flow: Flow) => void;
    removeFlow: (id: string) => void;
    updateFlow: (id: string, updates: Partial<Flow>) => void;
    getFlowById: (id: string) => Flow | undefined;
    getFlowByName: (name: string) => Flow | undefined;
    isFlowNameUnique: (name: string, excludeId?: string) => boolean;
    setCurrentEditingFlowId: (flowId: string | null) => void;
    setFlowRunning: (flowId: string, isRunning: boolean) => void; // Set running state for a specific flow
    isFlowRunning: (flowId: string) => boolean; // Check if specific flow is running
    isFlowDirty: (flowId: string) => boolean; // Check if specific flow is dirty
    
    // Flow mutation methods (auto-mark dirty)
    updateFlowNodes: (flowId: string, nodes: FlowNode[]) => void;
    updateFlowConnectors: (flowId: string, connectors: FlowConnector[]) => void;
    updateFlowName: (flowId: string, name: string) => void;
    updateFlowDefaultEnv: (flowId: string, envId: string | undefined) => void;
    updateFlowDefaultAuth: (flowId: string, authId: string | undefined) => void;
    markFlowClean: (flowId: string) => void;
}

const createFlowsSlice: StateCreator<FlowsSlice> = (set, get) => ({
    flows: [],
    isFlowsLoading: false,
    flowsLoadError: null,
    currentEditingFlowId: null,
    flowDirtyStates: {},

    setFlows: (flows) => set({ flows, flowsLoadError: null }),

    setIsFlowsLoading: (isLoading) => set({ isFlowsLoading: isLoading }),

    setFlowsLoadError: (error) => set({ flowsLoadError: error, isFlowsLoading: false }),

    addFlow: (flow) => set((state) => ({
        flows: [...state.flows, flow]
    })),

    removeFlow: (id) => set((state) => ({
        flows: state.flows.filter((flow) => flow.id !== id),
        flowDirtyStates: Object.fromEntries(
            Object.entries(state.flowDirtyStates).filter(([flowId]) => flowId !== id)
        )
    })),

    updateFlow: (id, updates) => set((state) => ({
        flows: state.flows.map((flow) => 
            flow.id === id ? { ...flow, ...updates } : flow
        )
    })),

    getFlowById: (id) => {
        return get().flows.find((flow) => flow.id === id);
    },

    getFlowByName: (name) => {
        return get().flows.find((flow) => flow.name.toLowerCase() === name.toLowerCase());
    },

    isFlowNameUnique: (name, excludeId) => {
        const flows = get().flows;
        const normalizedName = name.toLowerCase().trim();
        return !flows.some((flow) => 
            flow.name.toLowerCase().trim() === normalizedName && flow.id !== excludeId
        );
    },

    setCurrentEditingFlowId: (flowId) => set({ currentEditingFlowId: flowId }),

    setFlowRunning: (flowId, isRunning) => {
        set((state) => ({
            flows: state.flows.map((flow) => 
                flow.id === flowId ? { ...flow, isRunning } : flow
            )
        }));
    },

    isFlowRunning: (flowId) => {
        const flow = get().flows.find((f) => f.id === flowId);
        return flow?.isRunning || false;
    },

    isFlowDirty: (flowId) => {
        return get().flowDirtyStates[flowId] || false;
    },
    
    // Flow mutation methods - automatically mark dirty and update timestamp
    updateFlowNodes: (flowId, nodes) => {
        set((state) => ({
            flowDirtyStates: { ...state.flowDirtyStates, [flowId]: true },
            flows: state.flows.map((flow) => 
                flow.id === flowId 
                    ? { ...flow, nodes, updatedAt: new Date().toISOString() } 
                    : flow
            )
        }));
    },
    
    updateFlowConnectors: (flowId, connectors) => {
        set((state) => ({
            flowDirtyStates: { ...state.flowDirtyStates, [flowId]: true },
            flows: state.flows.map((flow) => 
                flow.id === flowId 
                    ? { ...flow, connectors, updatedAt: new Date().toISOString() } 
                    : flow
            )
        }));
    },
    
    updateFlowName: (flowId, name) => {
        set((state) => ({
            flowDirtyStates: { ...state.flowDirtyStates, [flowId]: true },
            flows: state.flows.map((flow) => 
                flow.id === flowId 
                    ? { ...flow, name, updatedAt: new Date().toISOString() } 
                    : flow
            )
        }));
    },
    
    updateFlowDefaultEnv: (flowId, envId) => {
        set((state) => ({
            flowDirtyStates: { ...state.flowDirtyStates, [flowId]: true },
            flows: state.flows.map((flow) => 
                flow.id === flowId 
                    ? { ...flow, defaultEnvId: envId, updatedAt: new Date().toISOString() } 
                    : flow
            )
        }));
    },
    
    updateFlowDefaultAuth: (flowId, authId) => {
        set((state) => ({
            flowDirtyStates: { ...state.flowDirtyStates, [flowId]: true },
            flows: state.flows.map((flow) => 
                flow.id === flowId 
                    ? { ...flow, defaultAuthId: authId, updatedAt: new Date().toISOString() } 
                    : flow
            )
        }));
    },
    
    markFlowClean: (flowId) => {
        set((state) => ({
            flowDirtyStates: { ...state.flowDirtyStates, [flowId]: false }
        }));
    },
});

export default createFlowsSlice;
export type { FlowsSlice };
