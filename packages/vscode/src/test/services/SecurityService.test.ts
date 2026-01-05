import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockFileSystem, createMockFsFunctions } from '../mocks/fs.js';
import { createMockExtensionContext } from '../mocks/vscode.js';

// Mock fs module
const mockFs = new MockFileSystem();
vi.mock('fs', () => createMockFsFunctions(mockFs));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// Mock vscode module
vi.mock('vscode', async () => {
  const { createMockExtensionContext, mockWindow } = await import(
    '../mocks/vscode.js'
  );
  return {
    window: mockWindow,
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn(),
      })),
    },
  };
});

describe('SecurityService', () => {
  let mockContext: any;

  beforeEach(async () => {
    mockFs.reset();
    vi.clearAllMocks();

    mockContext = createMockExtensionContext();
    mockFs.addDirectory('/home/testuser/.waveclient');
  });

  it('should initialize service', async () => {
    // Import after mocks are set up
    const { SecurityService } = await import('../../services/SecurityService.js');
    const service = SecurityService.getInstance();

    expect(service).toBeDefined();
  });

  it('should store and retrieve encryption status', async () => {
    const { SecurityService } = await import('../../services/SecurityService.js');
    const service = SecurityService.getInstance();
    service.initialize(mockContext.secrets);

    const status = await service.getEncryptionStatus();

    expect(status).toBeDefined();
    expect(status.enabled).toBeDefined();
  });
});
