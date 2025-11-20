import { StateCreator } from 'zustand';
import { Cookie } from '../../types/collection';

interface CookiesSlice {
    cookies: Cookie[];
    addCookie: (cookie: Cookie) => void;
    removeCookie: (id: string) => void;
    updateCookie: (id: string, updates: Partial<Cookie>) => void;
    toggleCookieEnabled: (id: string) => void;
    clearAllCookies: () => void;
    setCookies: (cookies: Cookie[]) => void;
}

const createCookiesSlice: StateCreator<CookiesSlice> = (set) => ({
    cookies: [],

    setCookies: (cookies) => set({ cookies }),

    addCookie: (cookie) => set((state) => ({
        cookies: [...state.cookies, cookie]
    })),

    removeCookie: (id) => set((state) => ({
        cookies: state.cookies.filter((cookie) => cookie.id !== id)
    })),

    updateCookie: (id, updates) => set((state) => ({
        cookies: state.cookies.map((cookie) => 
            cookie.id === id ? { ...cookie, ...updates } : cookie
        )
    })),

    toggleCookieEnabled: (id) => set((state) => ({
        cookies: state.cookies.map((cookie) =>
            cookie.id === id ? { ...cookie, enabled: !cookie.enabled } : cookie
        )
    })),

    clearAllCookies: () => set({ cookies: [] }),
});

export default createCookiesSlice;
