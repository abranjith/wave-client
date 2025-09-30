import { StateCreator } from 'zustand'
import { Environment } from '../../types/collection';

interface EnvironmentsSlice {
    environments: Environment[];
    activeEnvironment: Environment | null;
    isEnvironmentsLoading: boolean;
    environmentLoadError: string | null;
    setEnvironments: (environments: Environment[]) => void;
    addEnvironment: (environment: Environment) => void;
    removeEnvironment: (id: string) => void;
    updateEnvironment: (id: string, updates: Partial<Environment>) => void;
    setActiveEnvironment: (environment: Environment | null) => void;
    refreshEnvironments: (vsCodeApi: any) => void;
    setIsEnvironmentsLoading: (isLoading: boolean) => void;
    setEnvironmentLoadError: (error: string | null) => void;
}

const createEnvironmentsSlice: StateCreator<EnvironmentsSlice> = (set) => ({
    environments: [],
    activeEnvironment: null,
    isEnvironmentsLoading: false,
    environmentLoadError: null,

    setEnvironments: (environments) => set({ environments, environmentLoadError: null, isEnvironmentsLoading: false }),
    addEnvironment: (environment) => set((state) => ({
        environments: [...state.environments, environment]
    })),
    removeEnvironment: (id) => set((state) => ({
        environments: state.environments.filter((env) => env.id !== id),
        activeEnvironment: state.activeEnvironment?.id === id ? null : state.activeEnvironment
    })),
    updateEnvironment: (id, updates) => set((state) => ({
        environments: state.environments.map((env) => env.id === id ? { ...env, ...updates } : env),
        activeEnvironment: state.activeEnvironment?.id === id ? { ...state.activeEnvironment, ...updates } : state.activeEnvironment
    })),
    setActiveEnvironment: (environment) => set({ activeEnvironment: environment }),
    refreshEnvironments: (vsCodeApi) => {
        if (typeof vsCodeApi === 'undefined') {
            return;
        }
        set({ isEnvironmentsLoading: true, environmentLoadError: null });
        vsCodeApi.postMessage({ type: 'loadEnvironments' });
    },
    setIsEnvironmentsLoading: (isLoading) => set({ isEnvironmentsLoading: isLoading }),
    setEnvironmentLoadError: (error) => set({ environmentLoadError: error, isEnvironmentsLoading: false })
});

export default createEnvironmentsSlice;
