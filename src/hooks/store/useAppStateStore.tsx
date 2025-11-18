import { create } from "zustand"
import createCollectionsSlice from "./createCollectionsSlice"
import createCurrentRequestSlice from "./createCurrentRequestSlice"
import createEnvironmentsSlice from "./createEnvironmentsSlice"
import createHistorySlice from "./createHistorySlice"
import createCookiesSlice from "./createCookiesSlice"

// Combined store type that includes all slices
type AppStateStore = 
    ReturnType<typeof createCollectionsSlice> & 
    ReturnType<typeof createCurrentRequestSlice> & 
    ReturnType<typeof createEnvironmentsSlice> &
    ReturnType<typeof createHistorySlice> &
    ReturnType<typeof createCookiesSlice>

// Global App state management store
const useAppStateStore = create<AppStateStore>()((...args) => ({
    ...createCollectionsSlice(...args),
    ...createCurrentRequestSlice(...args),
    ...createEnvironmentsSlice(...args),
    ...createHistorySlice(...args),
    ...createCookiesSlice(...args),
}))

export default useAppStateStore
