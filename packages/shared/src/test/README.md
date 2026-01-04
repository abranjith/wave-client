# Testing Guide for @wave-client/shared

## Overview

This directory contains tests for the shared services package. All I/O operations are mocked to ensure tests are fast, reliable, and don't depend on the file system.

## Test Structure

```
test/
├── setup.ts              # Test setup and global configuration
├── mocks/
│   └── fs.ts            # Mock file system implementation
└── services/
    └── CollectionService.test.ts  # CollectionService tests
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run tests with UI
pnpm test:ui
```

## Mocking Strategy

### File System

All file system operations are mocked using the `MockFileSystem` class in `mocks/fs.ts`. This provides:

- **In-memory storage** - No actual files are created
- **Consistent behavior** - Tests don't depend on existing file system state
- **Fast execution** - No disk I/O overhead
- **Isolation** - Each test can reset the mock state

### Example Usage

```typescript
import { MockFileSystem } from '../mocks/fs.js';

const mockFs = new MockFileSystem();

// Mock the fs module
vi.mock('fs', () => {
  return {
    existsSync: vi.fn((path: string) => mockFs.hasFile(path)),
    readFileSync: vi.fn((path: string) => mockFs.getFile(path)),
    // ... other fs methods
  };
});

// In tests
beforeEach(() => {
  mockFs.reset(); // Clear all mock data
  mockFs.addDirectory('/home/testuser/.waveclient/collections');
  mockFs.setFile('/home/testuser/.waveclient/collections/test.json', '{"data": "value"}');
});
```

### Security Service

The `ISecurityService` is mocked to use the mock file system for encrypted file operations:

```typescript
const mockSecurityService = {
  readEncryptedFile: vi.fn(async (filePath: string, defaultValue: any) => {
    const content = mockFs.getFile(filePath);
    return content ? JSON.parse(content) : defaultValue;
  }),
  writeEncryptedFile: vi.fn(async (filePath: string, data: any) => {
    mockFs.setFile(filePath, JSON.stringify(data, null, 2));
  }),
};

setSecurityServiceInstance(mockSecurityService as any);
```

### Settings Provider

Global settings are mocked using `setGlobalSettingsProvider`:

```typescript
const mockSettings: AppSettings = {
  saveFilesLocation: '/home/testuser/.waveclient',
  // ... other settings
};

setGlobalSettingsProvider(async () => mockSettings);
```

## Coverage Goals

Current coverage thresholds:
- **Lines:** 60% (CollectionService: 94%)
- **Functions:** 60%
- **Branches:** 45%
- **Statements:** 60%

As more services are tested, these thresholds will increase.

## Writing New Tests

When adding tests for a new service:

1. Create a test file in `services/` matching the service name
2. Import and set up the mock file system
3. Mock the `fs` and `os` modules
4. Set up mock settings and security service in `beforeEach`
5. Reset mocks between tests using `mockFs.reset()` and `vi.clearAllMocks()`
6. Write comprehensive tests covering:
   - Happy paths
   - Error cases
   - Edge cases (empty data, missing fields, etc.)
   - ID generation and validation
   - File operations (create, read, update, delete)

## Best Practices

- **Isolate tests** - Each test should be independent
- **Clear test names** - Use descriptive test names that explain what's being tested
- **Arrange-Act-Assert** - Follow the AAA pattern
- **Mock all I/O** - Never access the real file system
- **Reset state** - Always reset mocks in `beforeEach`
- **Type safety** - Use TypeScript types for better IDE support and error detection
