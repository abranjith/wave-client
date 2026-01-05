# Testing Guide for @wave-client/vscode

## Overview

This directory contains tests for the VS Code extension package. All VS Code API calls and I/O operations are mocked to ensure tests are fast, reliable, and don't depend on actual VS Code or the file system.

## Test Structure

```
test/
├── setup.ts              # Test setup and global configuration
├── README.md            # This file
├── mocks/
│   ├── vscode.ts        # Mock VS Code API implementation
│   └── fs.ts            # Mock file system implementation
├── handlers/
│   └── MessageHandler.test.ts  # MessageHandler tests
├── services/
│   ├── HttpService.test.ts
│   └── ...other service tests
└── utils/
    ├── encoding.test.ts
    └── ...other utility tests
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

### VS Code API

All VS Code API calls are mocked using helper functions in `mocks/vscode.ts`. This provides:

- **Mock webview panels** - Test message passing without real webviews
- **Mock secret storage** - In-memory secret storage for testing
- **Mock extension context** - Workspace state, global state, subscriptions
- **Mock window methods** - Dialog boxes, information messages, etc.

### Example Usage

```typescript
import { createMockWebviewPanel, createMockExtensionContext } from '../mocks/vscode.js';

vi.mock('vscode', () => {
  return createMockVSCode();
});

const mockPanel = createMockWebviewPanel();
const mockContext = createMockExtensionContext();
```

### File System

All file system operations are mocked using the `MockFileSystem` class in `mocks/fs.ts`. This provides:

- **In-memory storage** - No actual files are created
- **Consistent behavior** - Tests don't depend on existing file system state
- **Fast execution** - No disk I/O overhead
- **Isolation** - Each test can reset the mock state

### Example Usage

```typescript
import { MockFileSystem, createMockFsFunctions } from '../mocks/fs.js';

const mockFs = new MockFileSystem();

vi.mock('fs', () => createMockFsFunctions(mockFs));

// In tests
beforeEach(() => {
  mockFs.reset(); // Clear all mock data
  mockFs.addDirectory('/home/testuser/.waveclient/collections');
  mockFs.setFile('/home/testuser/.waveclient/collections/test.json', '{"data": "value"}');
});
```

## Coverage Goals

Current coverage thresholds:
- **Lines:** 60%
- **Functions:** 60%
- **Branches:** 45%
- **Statements:** 60%

As more code is tested, these thresholds will increase.

## Writing New Tests

When adding tests for a new handler, service, or utility:

1. Create a test file in the appropriate directory matching the source file name
2. Import and set up necessary mocks (vscode, fs, etc.)
3. Mock external dependencies in `beforeEach`
4. Reset mocks between tests using `mockFs.reset()` and `vi.clearAllMocks()`
5. Write comprehensive tests covering:
   - Happy paths
   - Error cases
   - Edge cases (empty data, missing fields, etc.)
   - VS Code API interactions
   - File operations (create, read, update, delete)

## Best Practices

- **Isolate tests** - Each test should be independent
- **Clear test names** - Use descriptive test names that explain what's being tested
- **Arrange-Act-Assert** - Follow the AAA pattern
- **Mock all I/O** - Never access the real file system or VS Code API
- **Reset state** - Always reset mocks in `beforeEach`
- **Type safety** - Use TypeScript types for better IDE support and error detection
- **Avoid webview tests** - The webview package is tested separately in `@wave-client/core`

## Special Considerations

### Extension Host vs Webview

- Tests in this package focus on **extension host code** (handlers, services, utils)
- **Webview UI code** is tested in `@wave-client/core` package
- The adapter pattern separates concerns - test each side independently

### Node.js vs Browser

- Extension code runs in Node.js environment
- Use Node.js-specific APIs (Buffer, fs, https, etc.)
- Mock `vscode` module for all VS Code API interactions

### Async Operations

- Most service methods are async - use `await` in tests
- Use `vi.fn()` for async mocks that return promises
- Test both successful and error paths

## Example Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageHandler } from '../../handlers/MessageHandler';
import { createMockWebviewPanel } from '../mocks/vscode';

describe('MessageHandler', () => {
  let handler: MessageHandler;
  let mockPanel: any;

  beforeEach(() => {
    mockPanel = createMockWebviewPanel();
    handler = new MessageHandler(mockPanel);
  });

  it('handles http request message', async () => {
    const message = {
      type: 'httpRequest',
      requestId: 'test-123',
      config: {
        method: 'GET',
        url: 'https://api.example.com',
      },
    };

    await handler.handleMessage(message);

    expect(mockPanel.webview.postMessage).toHaveBeenCalled();
  });
});
```
## What Was Added ( As part of Initial Test Setup )

### 1. Test Configuration
- **`vitest.config.ts`** - Vitest configuration with realistic coverage thresholds
  - Excludes webview code (tested separately in `@wave-client/core`)
  - Initial coverage goals: 10% lines, 12% functions, 22% branches
  - Node environment for extension host testing
  - Ready to increase thresholds as more tests are added

### 2. Test Infrastructure
- **`src/test/setup.ts`** - Global test setup with automatic mock cleanup
- **`src/test/README.md`** - Comprehensive testing guide and best practices
- **`src/test/mocks/vscode.ts`** - Mock VS Code API implementation
  - Mock webview panels
  - Mock secret storage
  - Mock extension context
  - Mock window and workspace methods
- **`src/test/mocks/fs.ts`** - Mock file system for isolated testing

### 3. Test Files Created

#### Utils Tests
- **`src/test/utils/encoding.test.ts`** - Tests for encoding utilities
  - `convertToBase64()` - Various data type conversions
  - `base64ToBuffer()` - Base64 decoding
  - Round-trip conversion tests

- **`src/test/utils/common.test.ts`** - Tests for common utilities
  - `resolveParameterizedValue()` - Environment variable resolution
  - `isUrlInDomains()` - Domain matching logic

#### Services Tests
- **`src/test/services/SecurityService.test.ts`** - SecurityService tests
  - Service initialization
  - Encryption status retrieval

- **`src/test/services/HttpService.test.ts`** - HttpService tests
  - Service creation
  - Method availability checks

#### Handlers Tests
- **`src/test/handlers/MessageHandler.test.ts`** - MessageHandler tests
  - HTTP request handling
  - Collection loading
  - Environment loading
  - Error handling

### 4. Package Updates
- **`package.json`** - Added test scripts and dependencies
  - `pnpm test` - Run tests
  - `pnpm test:watch` - Watch mode
  - `pnpm test:coverage` - Coverage report
  - `pnpm test:ui` - Vitest UI
  - Added `vitest`, `@vitest/coverage-v8`, `@vitest/ui` as dev dependencies

## Next Steps to Increase Coverage

The foundation is in place. You can now expand tests by:

1. **Add more service tests:**
   - CollectionService (currently 0%)
   - EnvironmentService (currently 0%)
   - HistoryService (currently 0%)
   - SettingsService (currently 0%)
   - Expand HttpService tests (currently 3%)

2. **Add more util tests:**
   - validationEngine utilities (currently 0.76%)
   - Add tests for authentication services

3. **Expand handler tests:**
   - Complete MessageHandler coverage (currently 15.92%)
   - Test all message types
   - Test error scenarios
   - Test validation logic

4. **Increase coverage thresholds:**
   - Start at current: 10-12%
   - Target intermediate: 30-40%
   - Goal: 60%+ like core/shared packages

5. **Follow the patterns:**
   - Mock all I/O operations (fs, vscode API, axios)
   - Use `MockFileSystem` for file operations
   - Use mock vscode helpers for VS Code API
   - Reset mocks in `beforeEach`
   - Test happy paths and error cases

## Testing Strategy

### Extension Host vs Webview
- **Extension host code** (handlers, services, utils) - Tested in this package
- **Webview UI code** - Tested in `@wave-client/core` package
- Adapter pattern maintains clear separation

### Mocking Approach
- **VS Code API** - Fully mocked using `mocks/vscode.ts`
- **File System** - In-memory mock using `mocks/fs.ts`
- **External libs** - Mocked (axios, crypto, etc.)
- **Services** - Can be mocked in handler tests

### Best Practices
1. Isolate tests - each test is independent
2. Use descriptive test names
3. Follow Arrange-Act-Assert pattern
4. Mock all I/O - never access real file system
5. Reset state in `beforeEach`
6. Use TypeScript for type safety

## Example Test Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockFileSystem, createMockFsFunctions } from '../mocks/fs';

const mockFs = new MockFileSystem();
vi.mock('fs', () => createMockFsFunctions(mockFs));

describe('MyService', () => {
  beforeEach(() => {
    mockFs.reset();
    vi.clearAllMocks();
  });

  it('does something', async () => {
    // Arrange
    mockFs.setFile('/path/to/file.json', '{"data": "value"}');

    // Act
    const result = await service.loadData();

    // Assert
    expect(result).toBeDefined();
  });
});
```
Current thresholds can be adjusted in `vitest.config.ts` as coverage improves.
