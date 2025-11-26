import { create } from "zustand"
import createCollectionsSlice from "./createCollectionsSlice"
import createCurrentRequestSlice from "./createCurrentRequestSlice"
import createEnvironmentsSlice from "./createEnvironmentsSlice"
import createHistorySlice from "./createHistorySlice"
import createCookiesSlice from "./createCookiesSlice"
import createAuthSlice from "./createAuthSlice"
import createProxySlice from "./createProxySlice"
import createCertSlice from "./createCertSlice"
import createSettingsSlice from "./createSettingsSlice"

// Combined store type that includes all slices
type AppStateStore = 
    ReturnType<typeof createCollectionsSlice> & 
    ReturnType<typeof createCurrentRequestSlice> & 
    ReturnType<typeof createEnvironmentsSlice> &
    ReturnType<typeof createHistorySlice> &
    ReturnType<typeof createCookiesSlice> &
    ReturnType<typeof createAuthSlice> &
    ReturnType<typeof createProxySlice> & 
    ReturnType<typeof createCertSlice> &
    ReturnType<typeof createSettingsSlice>

// Global App state management store
const useAppStateStore = create<AppStateStore>()((...args) => ({
    ...createCollectionsSlice(...args),
    ...createCurrentRequestSlice(...args),
    ...createEnvironmentsSlice(...args),
    ...createHistorySlice(...args),
    ...createCookiesSlice(...args),
    ...createAuthSlice(...args),
    ...createProxySlice(...args),
    ...createCertSlice(...args),
    ...createSettingsSlice(...args),
}))

// Force update
export default useAppStateStore
