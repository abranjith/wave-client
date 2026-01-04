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
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  deleteFile(path: string): void {
    this.files.delete(path);
  }

  addDirectory(path: string): void {
    this.directories.add(path);
  }

  hasDirectory(path: string): boolean {
    return this.directories.has(path);
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

  listJsonFiles(dirPath: string): string[] {
    return this.getFilesInDirectory(dirPath).filter(f => f.endsWith('.json'));
  }

  renameFile(oldPath: string, newPath: string): void {
    const content = this.getFile(oldPath);
    if (content !== undefined) {
      this.setFile(newPath, content);
      this.deleteFile(oldPath);
    }
  }
}

/**
 * Creates mocked fs module functions using a MockFileSystem instance.
 */
export function createFsMocks(mockFs: MockFileSystem) {
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

    renameSync: vi.fn((oldPath: string, newPath: string) => {
      mockFs.renameFile(oldPath, newPath);
    }),
  };
}
