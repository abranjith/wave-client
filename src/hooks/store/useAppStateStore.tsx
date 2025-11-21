import { create } from "zustand"
import createCollectionsSlice from "./createCollectionsSlice"
import createCurrentRequestSlice from "./createCurrentRequestSlice"
import createEnvironmentsSlice from "./createEnvironmentsSlice"
import createHistorySlice from "./createHistorySlice"
import createCookiesSlice from "./createCookiesSlice"
import createAuthSlice from "./createAuthSlice"

// Combined store type that includes all slices
type AppStateStore = 
    ReturnType<typeof createCollectionsSlice> & 
    ReturnType<typeof createCurrentRequestSlice> & 
    ReturnType<typeof createEnvironmentsSlice> &
    ReturnType<typeof createHistorySlice> &
    ReturnType<typeof createCookiesSlice> &
    ReturnType<typeof createAuthSlice>

// Global App state management store
const useAppStateStore = create<AppStateStore>()((...args) => ({
    ...createCollectionsSlice(...args),
    ...createCurrentRequestSlice(...args),
    ...createEnvironmentsSlice(...args),
    ...createHistorySlice(...args),
    ...createCookiesSlice(...args),
    ...createAuthSlice(...args),
}))

// Force update
export default useAppStateStore
