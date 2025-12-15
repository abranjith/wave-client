import { StateCreator } from 'zustand';

// Banner message type - matches the Banner component's MessageType
export type BannerMessageType = 'info' | 'success' | 'warn' | 'error';

// Banner state interface
export interface BannerState {
    message: string | null;
    messageType: BannerMessageType | null;
    link?: {
        text: string;
        href: string;
    };
    timeoutSeconds?: number;
}

// Banner store interface
interface BannerSlice {
    banner: BannerState;
    
    // Set banner message with specific type
    setBannerInfo: (message: string, link?: { text: string; href: string }, timeoutSeconds?: number) => void;
    setBannerSuccess: (message: string, link?: { text: string; href: string }, timeoutSeconds?: number) => void;
    setBannerWarning: (message: string, link?: { text: string; href: string }, timeoutSeconds?: number) => void;
    setBannerError: (message: string, link?: { text: string; href: string }, timeoutSeconds?: number) => void;
    
    // Generic set banner message
    setBannerMessage: (message: string, messageType: BannerMessageType, link?: { text: string; href: string }, timeoutSeconds?: number) => void;
    
    // Clear banner
    clearBanner: () => void;
}

const createBannerSlice: StateCreator<BannerSlice> = (set) => ({
    banner: {
        message: null,
        messageType: null,
        link: undefined,
        timeoutSeconds: undefined,
    },

    setBannerInfo: (message, link, timeoutSeconds) => set({
        banner: {
            message,
            messageType: 'info',
            link,
            timeoutSeconds,
        }
    }),

    setBannerSuccess: (message, link, timeoutSeconds) => set({
        banner: {
            message,
            messageType: 'success',
            link,
            timeoutSeconds,
        }
    }),

    setBannerWarning: (message, link, timeoutSeconds) => set({
        banner: {
            message,
            messageType: 'warn',
            link,
            timeoutSeconds,
        }
    }),

    setBannerError: (message, link, timeoutSeconds) => set({
        banner: {
            message,
            messageType: 'error',
            link,
            timeoutSeconds,
        }
    }),

    setBannerMessage: (message, messageType, link, timeoutSeconds) => set({
        banner: {
            message,
            messageType,
            link,
            timeoutSeconds,
        }
    }),

    clearBanner: () => set({
        banner: {
            message: null,
            messageType: null,
            link: undefined,
            timeoutSeconds: undefined,
        }
    }),
});

export default createBannerSlice;
