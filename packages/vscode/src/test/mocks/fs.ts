import { vi } from 'vitest';

/**
 * Mock file system for testing.
 * Provides in-memory storage for file operations.
 */
export class MockFileSystem {
  private files = new Map<string, string>();
  private directories = new Set<string>();

  reset(): void {
    this.files.clear();
    this.directories.clear();
  }

  setFile(path: string, content: string): void {
    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');
    this.files.set(normalizedPath, content);
  }

  getFile(path: string): string | undefined {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.files.get(normalizedPath);
  }

  hasFile(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.files.has(normalizedPath);
  }

  deleteFile(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.files.delete(normalizedPath);
  }

  addDirectory(path: string): void {
    const normalizedPath = path.replace(/\\/g, '/');
    this.directories.add(normalizedPath);
  }

  hasDirectory(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    return this.directories.has(normalizedPath);
  }

  getFilesInDirectory(dirPath: string): string[] {
    const files: string[] = [];
    const normalizedDir = dirPath.replace(/\\/g, '/');
    for (const filePath of this.files.keys()) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      if (normalizedPath.startsWith(normalizedDir) && normalizedPath !== normalizedDir) {
        const relativePath = normalizedPath.substring(normalizedDir.length + 1);
        // Only include files directly in this directory (not in subdirectories)
        if (!relativePath.includes('/')) {
          files.push(relativePath);
        }
      }
    }
    return files;
  }

  getAllFiles(): string[] {
    return Array.from(this.files.keys());
  }

  getAllDirectories(): string[] {
    return Array.from(this.directories);
  }
}

/**
 * Creates mock fs functions that use the provided MockFileSystem
 */
export function createMockFsFunctions(mockFs: MockFileSystem) {
  return {
    existsSync: vi.fn((path: string) => {
      return mockFs.hasFile(path) || mockFs.hasDirectory(path);
    }),

    readFileSync: vi.fn((path: string, _encoding?: string) => {
      const content = mockFs.getFile(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    }),

    writeFileSync: vi.fn((path: string, data: string) => {
      mockFs.setFile(path, data);
    }),

    mkdirSync: vi.fn((path: string, _options?: { recursive?: boolean }) => {
      mockFs.addDirectory(path);
    }),

    unlinkSync: vi.fn((path: string) => {
      if (!mockFs.hasFile(path)) {
        throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
      }
      mockFs.deleteFile(path);
    }),

    readdirSync: vi.fn((path: string) => {
      return mockFs.getFilesInDirectory(path);
    }),
  };
}
