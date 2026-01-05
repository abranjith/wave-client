import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockFileSystem, createMockFsFunctions } from '../mocks/fs.js';

// Mock fs module
const mockFs = new MockFileSystem();
vi.mock('fs', () => createMockFsFunctions(mockFs));

// Mock os module
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// Mock axios
vi.mock('axios', () => ({
  default: vi.fn(),
}));

// Mock vscode module
vi.mock('vscode', async () => {
  return {
    window: {
      showErrorMessage: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn(),
      })),
    },
  };
});

describe('HttpService', () => {
  beforeEach(() => {
    mockFs.reset();
    vi.clearAllMocks();
    mockFs.addDirectory('/home/testuser/.waveclient');
  });

  it('should create HttpService instance', async () => {
    const { HttpService } = await import('../../services/index.js');
    const service = new HttpService();

    expect(service).toBeDefined();
  });

  it('should have execute method', async () => {
    const { HttpService } = await import('../../services/index.js');
    const service = new HttpService();

    expect(service.execute).toBeDefined();
    expect(typeof service.execute).toBe('function');
  });

  it('should have send method', async () => {
    const { HttpService } = await import('../../services/index.js');
    const service = new HttpService();

    expect(service.send).toBeDefined();
    expect(typeof service.send).toBe('function');
  });
});
