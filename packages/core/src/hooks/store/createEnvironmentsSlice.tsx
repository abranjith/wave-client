import { StateCreator } from 'zustand'
import { Result, ok, err } from '../../utils/result';
import { Environment } from '../../types/collection';

interface EnvironmentsSlice {
    environments: Environment[];
    activeEnvironment: Environment | null;
    isEnvironmentsLoading: boolean;
    environmentLoadError: string | null;
    setEnvironments: (environments: Environment[]) => void;
    addEnvironment: (environment: Environment) => Result<Environment, string>;
    getGlobalEnvironment: () => Environment | undefined;
    removeEnvironment: (id: string) => void;
    updateEnvironment: (id: string, updates: Partial<Environment>) => void;
    setActiveEnvironment: (environment: Environment | null) => void;
    setIsEnvironmentsLoading: (isLoading: boolean) => void;
    setEnvironmentLoadError: (error: string | null) => void;
    /**
     * Get merged environment variable keys from global + specified environment.
     * Returns a Set of variable keys that are enabled and have values.
     * @param environmentId - The ID of the environment to merge with global (optional)
     */
    getActiveEnvVariableKeys: (environmentId?: string | null) => Set<string>;
}

const createEnvironmentsSlice: StateCreator<EnvironmentsSlice> = (set, get) => ({
    environments: [],
    activeEnvironment: null,
    isEnvironmentsLoading: false,
    environmentLoadError: null,

    setEnvironments: (environments) => set({ environments, environmentLoadError: null, isEnvironmentsLoading: false }),
    addEnvironment: (environment) => {
        const nameExists = get().environments.some(e => e.name.toLowerCase() === environment.name.toLowerCase());
        if (nameExists) {
            return err(`Environment with name "${environment.name}" already exists`);
        }
        //if id is missing (should not happen), generate one (crypto randomUUID)
        if (!environment.id) {
            environment.id = `env-${crypto.randomUUID()}`;
        }
        set((state) => ({
            environments: [...state.environments, environment]
        }));
        return ok(environment);
    },
    getGlobalEnvironment: () => {
        return get().environments.find(e => e.name === 'global');
    },
    removeEnvironment: (id) => set((state) => ({
        environments: state.environments.filter((env) => env.id !== id),
        activeEnvironment: state.activeEnvironment?.id === id ? null : state.activeEnvironment
    })),
    updateEnvironment: (id, updates) => set((state) => ({
        environments: state.environments.map((env) => env.id === id ? { ...env, ...updates } : env),
        activeEnvironment: state.activeEnvironment?.id === id ? { ...state.activeEnvironment, ...updates } : state.activeEnvironment
    })),
    setActiveEnvironment: (environment) => set({ activeEnvironment: environment }),
    setIsEnvironmentsLoading: (isLoading) => set({
        isEnvironmentsLoading: isLoading,
        ...(isLoading ? { environmentLoadError: null } : {})
    }),
    setEnvironmentLoadError: (error) => set({ environmentLoadError: error, isEnvironmentsLoading: false }),
    
    getActiveEnvVariableKeys: (environmentId?: string | null) => {
        const { environments } = get();
        const vars = new Set<string>();
        
        // Add global environment variables first
        const globalEnv = environments.find(e => e.name.toLowerCase() === 'global');
        if (globalEnv?.values) {
            globalEnv.values.forEach((envVar) => {
                if (envVar.enabled && envVar.value) {
                    vars.add(envVar.key);
                }
            });
        }
        
        // Add/override with specified environment variables
        if (environmentId) {
            const selectedEnv = environments.find(e => e.id === environmentId);
            if (selectedEnv?.values) {
                selectedEnv.values.forEach((envVar) => {
                    if (envVar.enabled && envVar.value) {
                        vars.add(envVar.key);
                    }
                });
            }
        }
        
        return vars;
    },
});

export default createEnvironmentsSlice;
