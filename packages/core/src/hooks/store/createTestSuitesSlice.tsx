import { StateCreator } from 'zustand';
import { TestSuite, TestItem, TestSuiteRunState, TestCase, RequestTestItem, isRequestTestItem } from '../../types/testSuite';

interface TestSuitesSlice {
    testSuites: TestSuite[];
    isTestSuitesLoading: boolean;
    testSuitesLoadError: string | null;
    currentEditingTestSuiteId: string | null;
    testSuiteDirtyStates: Record<string, boolean>; // Track dirty state per suite ID
    testSuiteRunStates: Record<string, TestSuiteRunState>; // Track execution state per suite ID
    
    // Basic setters
    setTestSuites: (suites: TestSuite[]) => void;
    setIsTestSuitesLoading: (isLoading: boolean) => void;
    setTestSuitesLoadError: (error: string | null) => void;
    
    // CRUD operations
    addTestSuite: (suite: TestSuite) => void;
    removeTestSuite: (id: string) => void;
    updateTestSuite: (id: string, updates: Partial<TestSuite>) => void;
    
    // Getters
    getTestSuiteById: (id: string) => TestSuite | undefined;
    getTestSuiteByName: (name: string) => TestSuite | undefined;
    isTestSuiteNameUnique: (name: string, excludeId?: string) => boolean;
    
    // Editing state
    setCurrentEditingTestSuiteId: (suiteId: string | null) => void;
    
    // Status checks
    isTestSuiteRunning: (suiteId: string) => boolean;
    isTestSuiteDirty: (suiteId: string) => boolean;
    
    // Test suite run state management
    getTestSuiteRunState: (suiteId: string) => TestSuiteRunState;
    setTestSuiteRunState: (suiteId: string, state: TestSuiteRunState) => void;
    clearTestSuiteRunState: (suiteId: string) => void;
    
    // Test suite mutation methods (auto-mark dirty)
    updateTestSuiteItems: (suiteId: string, items: TestItem[]) => void;
    updateTestSuiteName: (suiteId: string, name: string) => void;
    updateTestSuiteDescription: (suiteId: string, description: string) => void;
    updateTestSuiteDefaultEnv: (suiteId: string, envId: string | undefined) => void;
    updateTestSuiteDefaultAuth: (suiteId: string, authId: string | undefined) => void;
    updateTestSuiteSettings: (suiteId: string, settings: Partial<TestSuite['settings']>) => void;
    markTestSuiteClean: (suiteId: string) => void;
    
    // Test case CRUD operations (for data-driven testing)
    addTestCase: (suiteId: string, itemId: string, testCase: TestCase) => void;
    updateTestCase: (suiteId: string, itemId: string, testCaseId: string, updates: Partial<TestCase>) => void;
    deleteTestCase: (suiteId: string, itemId: string, testCaseId: string) => void;
    reorderTestCases: (suiteId: string, itemId: string, testCases: TestCase[]) => void;
    getTestCases: (suiteId: string, itemId: string) => TestCase[];
}

const DEFAULT_TEST_SUITE_RUN_STATE: TestSuiteRunState = {
    isRunning: false,
    result: null,
    runningItemIds: new Set(),
};

const createTestSuitesSlice: StateCreator<TestSuitesSlice> = (set, get) => ({
    testSuites: [],
    isTestSuitesLoading: false,
    testSuitesLoadError: null,
    currentEditingTestSuiteId: null,
    testSuiteDirtyStates: {},
    testSuiteRunStates: {},

    setTestSuites: (suites) => set({ testSuites: suites, testSuitesLoadError: null }),

    setIsTestSuitesLoading: (isLoading) => set({ isTestSuitesLoading: isLoading }),

    setTestSuitesLoadError: (error) => set({ testSuitesLoadError: error, isTestSuitesLoading: false }),

    addTestSuite: (suite) => set((state) => ({
        testSuites: [...state.testSuites, suite]
    })),

    removeTestSuite: (id) => set((state) => ({
        testSuites: state.testSuites.filter((suite) => suite.id !== id),
        testSuiteDirtyStates: Object.fromEntries(
            Object.entries(state.testSuiteDirtyStates).filter(([suiteId]) => suiteId !== id)
        ),
        testSuiteRunStates: Object.fromEntries(
            Object.entries(state.testSuiteRunStates).filter(([suiteId]) => suiteId !== id)
        )
    })),

    updateTestSuite: (id, updates) => set((state) => ({
        testSuites: state.testSuites.map((suite) => 
            suite.id === id ? { ...suite, ...updates } : suite
        )
    })),

    getTestSuiteById: (id) => {
        return get().testSuites.find((suite) => suite.id === id);
    },

    getTestSuiteByName: (name) => {
        return get().testSuites.find((suite) => suite.name.toLowerCase() === name.toLowerCase());
    },

    isTestSuiteNameUnique: (name, excludeId) => {
        const suites = get().testSuites;
        const normalizedName = name.toLowerCase().trim();
        return !suites.some((suite) => 
            suite.name.toLowerCase().trim() === normalizedName && suite.id !== excludeId
        );
    },

    setCurrentEditingTestSuiteId: (suiteId) => set({ currentEditingTestSuiteId: suiteId }),

    isTestSuiteRunning: (suiteId) => {
        const runState = get().testSuiteRunStates[suiteId];
        return runState?.isRunning || false;
    },

    isTestSuiteDirty: (suiteId) => {
        return get().testSuiteDirtyStates[suiteId] || false;
    },
    
    // Test suite run state management
    getTestSuiteRunState: (suiteId) => {
        return get().testSuiteRunStates[suiteId] || DEFAULT_TEST_SUITE_RUN_STATE;
    },
    
    setTestSuiteRunState: (suiteId, state) => {
        set((prevState) => ({
            testSuiteRunStates: { ...prevState.testSuiteRunStates, [suiteId]: state }
        }));
    },
    
    clearTestSuiteRunState: (suiteId) => {
        set((state) => {
            const newRunStates = { ...state.testSuiteRunStates };
            delete newRunStates[suiteId];
            return { testSuiteRunStates: newRunStates };
        });
    },
    
    // Test suite mutation methods - automatically mark dirty and update timestamp
    updateTestSuiteItems: (suiteId, items) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => 
                suite.id === suiteId 
                    ? { ...suite, items, updatedAt: new Date().toISOString() } 
                    : suite
            )
        }));
    },
    
    updateTestSuiteName: (suiteId, name) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => 
                suite.id === suiteId 
                    ? { ...suite, name, updatedAt: new Date().toISOString() } 
                    : suite
            )
        }));
    },
    
    updateTestSuiteDescription: (suiteId, description) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => 
                suite.id === suiteId 
                    ? { ...suite, description, updatedAt: new Date().toISOString() } 
                    : suite
            )
        }));
    },
    
    updateTestSuiteDefaultEnv: (suiteId, envId) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => 
                suite.id === suiteId 
                    ? { ...suite, defaultEnvId: envId, updatedAt: new Date().toISOString() } 
                    : suite
            )
        }));
    },
    
    updateTestSuiteDefaultAuth: (suiteId, authId) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => 
                suite.id === suiteId 
                    ? { ...suite, defaultAuthId: authId, updatedAt: new Date().toISOString() } 
                    : suite
            )
        }));
    },
    
    updateTestSuiteSettings: (suiteId, settings) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => 
                suite.id === suiteId 
                    ? { 
                        ...suite, 
                        settings: { ...suite.settings, ...settings },
                        updatedAt: new Date().toISOString() 
                      } 
                    : suite
            )
        }));
    },
    
    markTestSuiteClean: (suiteId) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: false }
        }));
    },
    
    // Test case CRUD operations (for data-driven testing)
    addTestCase: (suiteId, itemId, testCase) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => {
                if (suite.id !== suiteId) return suite;
                return {
                    ...suite,
                    updatedAt: new Date().toISOString(),
                    items: suite.items.map((item) => {
                        if (item.id !== itemId || !isRequestTestItem(item)) return item;
                        const existingCases = item.testCases || [];
                        return {
                            ...item,
                            testCases: [...existingCases, testCase],
                        } as RequestTestItem;
                    }),
                };
            }),
        }));
    },
    
    updateTestCase: (suiteId, itemId, testCaseId, updates) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => {
                if (suite.id !== suiteId) return suite;
                return {
                    ...suite,
                    updatedAt: new Date().toISOString(),
                    items: suite.items.map((item) => {
                        if (item.id !== itemId || !isRequestTestItem(item)) return item;
                        return {
                            ...item,
                            testCases: (item.testCases || []).map((tc) =>
                                tc.id === testCaseId ? { ...tc, ...updates } : tc
                            ),
                        } as RequestTestItem;
                    }),
                };
            }),
        }));
    },
    
    deleteTestCase: (suiteId, itemId, testCaseId) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => {
                if (suite.id !== suiteId) return suite;
                return {
                    ...suite,
                    updatedAt: new Date().toISOString(),
                    items: suite.items.map((item) => {
                        if (item.id !== itemId || !isRequestTestItem(item)) return item;
                        return {
                            ...item,
                            testCases: (item.testCases || []).filter((tc) => tc.id !== testCaseId),
                        } as RequestTestItem;
                    }),
                };
            }),
        }));
    },
    
    reorderTestCases: (suiteId, itemId, testCases) => {
        set((state) => ({
            testSuiteDirtyStates: { ...state.testSuiteDirtyStates, [suiteId]: true },
            testSuites: state.testSuites.map((suite) => {
                if (suite.id !== suiteId) return suite;
                return {
                    ...suite,
                    updatedAt: new Date().toISOString(),
                    items: suite.items.map((item) => {
                        if (item.id !== itemId || !isRequestTestItem(item)) return item;
                        return {
                            ...item,
                            testCases,
                        } as RequestTestItem;
                    }),
                };
            }),
        }));
    },
    
    getTestCases: (suiteId, itemId) => {
        const suite = get().testSuites.find((s) => s.id === suiteId);
        if (!suite) return [];
        const item = suite.items.find((i) => i.id === itemId);
        if (!item || !isRequestTestItem(item)) return [];
        return item.testCases || [];
    },
});

export default createTestSuitesSlice;
export type { TestSuitesSlice };
