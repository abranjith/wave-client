import { afterEach, vi } from 'vitest';
import '@testing-library/jest-dom';

// Reset all mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  readyState: 1, // OPEN
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
})) as any;
