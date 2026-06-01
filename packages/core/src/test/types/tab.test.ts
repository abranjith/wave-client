/**
 * Unit tests for protocol-aware tab helper functions in types/tab.ts
 */

import { describe, it, expect } from 'vitest';
import {
    getRequestTabsForProtocol,
    getResponseTabsForProtocol,
    getDefaultResponseSection,
    getDefaultRequestSection,
} from '../../types/tab';

describe('getRequestTabsForProtocol', () => {
    it('returns all HTTP tabs including Sent in order for "http"', () => {
        expect(getRequestTabsForProtocol('http')).toEqual(['Params', 'Headers', 'Body', 'Validation', 'Sent']);
    });

    it('returns only Params and Headers for "ws"', () => {
        expect(getRequestTabsForProtocol('ws')).toEqual(['Params', 'Headers']);
    });

    it('returns Params, Headers, and Body for "sse"', () => {
        expect(getRequestTabsForProtocol('sse')).toEqual(['Params', 'Headers', 'Body']);
    });
});

describe('getResponseTabsForProtocol', () => {
    it('returns Body, Headers, Validation for "http"', () => {
        expect(getResponseTabsForProtocol('http')).toEqual(['Body', 'Headers', 'Validation']);
    });

    it('returns Messages and Headers for "ws"', () => {
        expect(getResponseTabsForProtocol('ws')).toEqual(['Messages', 'Headers']);
    });

    it('returns Events and Headers for "sse"', () => {
        expect(getResponseTabsForProtocol('sse')).toEqual(['Events', 'Headers']);
    });
});

describe('getDefaultResponseSection', () => {
    it('returns "Body" for "http"', () => {
        expect(getDefaultResponseSection('http')).toBe('Body');
    });

    it('returns "Messages" for "ws"', () => {
        expect(getDefaultResponseSection('ws')).toBe('Messages');
    });

    it('returns "Events" for "sse"', () => {
        expect(getDefaultResponseSection('sse')).toBe('Events');
    });
});

describe('getDefaultRequestSection', () => {
    it('returns "Params" for "http"', () => {
        expect(getDefaultRequestSection('http')).toBe('Params');
    });

    it('returns "Params" for "ws"', () => {
        expect(getDefaultRequestSection('ws')).toBe('Params');
    });

    it('returns "Params" for "sse"', () => {
        expect(getDefaultRequestSection('sse')).toBe('Params');
    });
});
