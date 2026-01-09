import { StateCreator } from 'zustand';
import { Flow } from '../../types/flow';

interface FlowsSlice {
    flows: Flow[];
    isFlowsLoading: boolean;
    flowsLoadError: string | null;
    setFlows: (flows: Flow[]) => void;
    setIsFlowsLoading: (isLoading: boolean) => void;
    setFlowsLoadError: (error: string | null) => void;
    addFlow: (flow: Flow) => void;
    removeFlow: (id: string) => void;
    updateFlow: (id: string, updates: Partial<Flow>) => void;
    getFlowById: (id: string) => Flow | undefined;
    getFlowByName: (name: string) => Flow | undefined;
    isFlowNameUnique: (name: string, excludeId?: string) => boolean;
}

const createFlowsSlice: StateCreator<FlowsSlice> = (set, get) => ({
    flows: [],
    isFlowsLoading: false,
    flowsLoadError: null,

    setFlows: (flows) => set({ flows, flowsLoadError: null }),

    setIsFlowsLoading: (isLoading) => set({ isFlowsLoading: isLoading }),

    setFlowsLoadError: (error) => set({ flowsLoadError: error, isFlowsLoading: false }),

    addFlow: (flow) => set((state) => ({
        flows: [...state.flows, flow]
    })),

    removeFlow: (id) => set((state) => ({
        flows: state.flows.filter((flow) => flow.id !== id)
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
});

export default createFlowsSlice;
export type { FlowsSlice };
