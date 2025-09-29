import { create } from "zustand"
import createCollectionsSlice from "./createCollectionsSlice"
import createCurrentRequestSlice from "./createCurrentRequestSlice"
import createEnvironmentsSlice from "./createEnvironmentsSlice"

// Combined store type that includes all slices
type AppStateStore = 
    ReturnType<typeof createCollectionsSlice> & 
    ReturnType<typeof createCurrentRequestSlice> & 
    ReturnType<typeof createEnvironmentsSlice>

// Global App state management store
const useAppStateStore = create<AppStateStore>()((...args) => ({
    ...createCollectionsSlice(...args),
    ...createCurrentRequestSlice(...args),
    ...createEnvironmentsSlice(...args),
}))

export default useAppStateStore
