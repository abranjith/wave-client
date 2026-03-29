import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClientManager } from '../../tools/mcpClient';

// ============================================================================
// Mock Transport
// ============================================================================

/** Creates a minimal mock Transport for testing. */
function createMockTransport() {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: unknown) => void) | undefined,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('McpClientManager', () => {
  let manager: McpClientManager;

  beforeEach(() => {
    manager = new McpClientManager();
  });

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  describe('lifecycle', () => {
    it('starts disconnected', () => {
      expect(manager.isConnected()).toBe(false);
    });

    it('disconnect is a no-op when not connected', async () => {
      // Should not throw
      await manager.disconnect();
      expect(manager.isConnected()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tool discovery — disconnected guards
  // --------------------------------------------------------------------------

  describe('listTools — disconnected', () => {
    it('throws when not connected', async () => {
      await expect(manager.listTools()).rejects.toThrow('MCP client is not connected');
    });
  });

  // --------------------------------------------------------------------------
  // Tool invocation — disconnected guards
  // --------------------------------------------------------------------------

  describe('callTool — disconnected', () => {
    it('throws when not connected', async () => {
      await expect(manager.callTool('some_tool')).rejects.toThrow(
        'MCP client is not connected',
      );
    });
  });

  // --------------------------------------------------------------------------
  // refreshTools
  // --------------------------------------------------------------------------

  describe('refreshTools', () => {
    it('does not throw when not connected', () => {
      expect(() => manager.refreshTools()).not.toThrow();
    });
  });
});
