import { create } from "zustand"
import createCollectionsSlice from "./createCollectionsSlice"
import createRequestTabsSlice from "./createRequestTabsSlice"
import createEnvironmentsSlice from "./createEnvironmentsSlice"
import createHistorySlice from "./createHistorySlice"
import createCookiesSlice from "./createCookiesSlice"
import createAuthSlice from "./createAuthSlice"
import createProxySlice from "./createProxySlice"
import createCertSlice from "./createCertSlice"
import createSettingsSlice from "./createSettingsSlice"
import createBannerSlice from "./createBannerSlice"

// Combined store type that includes all slices
type AppStateStore = 
    ReturnType<typeof createCollectionsSlice> & 
    ReturnType<typeof createRequestTabsSlice> & 
    ReturnType<typeof createEnvironmentsSlice> &
    ReturnType<typeof createHistorySlice> &
    ReturnType<typeof createCookiesSlice> &
    ReturnType<typeof createAuthSlice> &
    ReturnType<typeof createProxySlice> & 
    ReturnType<typeof createCertSlice> &
    ReturnType<typeof createSettingsSlice> &
    ReturnType<typeof createBannerSlice>

// Global App state management store
const useAppStateStore = create<AppStateStore>()((...args) => ({
    ...createCollectionsSlice(...args),
    ...createRequestTabsSlice(...args),
    ...createEnvironmentsSlice(...args),
    ...createHistorySlice(...args),
    ...createCookiesSlice(...args),
    ...createAuthSlice(...args),
    ...createProxySlice(...args),
    ...createCertSlice(...args),
    ...createSettingsSlice(...args),
    ...createBannerSlice(...args),
}))

// Force update
export default useAppStateStore
