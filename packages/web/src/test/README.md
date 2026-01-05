# Testing Guide for @wave-client/web

## Overview

This directory contains tests for the web package. All server API calls and external dependencies are mocked to ensure tests are fast, reliable, and don't depend on an actual server.

## Test Structure

```
test/
├── setup.ts                    # Test setup and global configuration
├── README.md                   # This file
├── mocks/
│   └── axios.ts               # Mock axios for API calls
├── adapters/
│   └── webAdapter.test.ts     # WebAdapter tests
└── components/
    └── ...component tests
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

### Axios (Server API)

All server API calls are mocked using the `MockAxiosInstance` class in `mocks/axios.ts`. This provides:

- **Mock HTTP methods** - GET, POST, PUT, DELETE
- **Configurable responses** - Set custom responses per URL
- **Error simulation** - Test error handling paths
- **Request tracking** - Verify API calls were made

### Example Usage

```typescript
import { createMockAxios } from '../mocks/axios';
import { vi } from 'vitest';

const mockAxios = createMockAxios();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxios),
  },
}));

// In tests
beforeEach(() => {
  mockAxios.reset();
  mockAxios.setResponse('/api/collections', { 
    isOk: true, 
    value: [] 
  });
});
```

### WebSocket

WebSocket is globally mocked in `setup.ts` to avoid connection attempts during tests.

## Coverage Goals

Current coverage thresholds:
- **Lines:** 35%
- **Functions:** 30%
- **Branches:** 45%
- **Statements:** 35%

The web adapter currently achieves ~40% coverage. These thresholds can be increased as more adapter functionality is tested. UI components (App.tsx, ConfigPanel.tsx, RequestEditor.tsx) are excluded from coverage as they require integration/E2E testing.

## Writing New Tests

When adding tests for a new component or adapter:

1. Create a test file in the appropriate directory matching the source file name
2. Import and set up necessary mocks (axios, etc.)
3. Mock external dependencies in `beforeEach`
4. Reset mocks between tests using `mockAxios.reset()` and `vi.clearAllMocks()`
5. Write comprehensive tests covering:
   - Happy paths
   - Error cases
   - Edge cases (empty data, missing fields, network errors)
   - Server API interactions
   - WebSocket events

## Best Practices

- **Isolate tests** - Each test should be independent
- **Clear test names** - Use descriptive test names that explain what's being tested
- **Arrange-Act-Assert** - Follow the AAA pattern
- **Mock all I/O** - Never access real servers or external APIs
- **Reset state** - Always reset mocks in `beforeEach`
- **Type safety** - Use TypeScript types for better IDE support and error detection
- **Test adapters separately** - The adapter is the boundary between UI and server

## Special Considerations

### Web Adapter vs Core UI

- **Web adapter** (this package) - Handles server communication, file operations, notifications
- **Core UI components** (`@wave-client/core`) - Tested separately in core package
- The adapter pattern separates concerns - test each side independently

### Browser vs Node.js

- Tests run in jsdom environment (simulated browser)
- Use browser APIs (WebSocket, fetch, File API, etc.)
- Mock axios for all server communication

### Async Operations

- Most adapter methods are async - use `await` in tests
- Use `vi.fn()` for async mocks that return promises
- Test both successful and error paths

## Example Test

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createWebAdapter } from '../../adapters/webAdapter';
import { createMockAxios } from '../mocks/axios';

const mockAxios = createMockAxios();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mockAxios),
  },
}));

describe('WebAdapter - Storage', () => {
  let adapter: ReturnType<typeof createWebAdapter>;

  beforeEach(() => {
    mockAxios.reset();
    adapter = createWebAdapter();
  });

  it('loads collections successfully', async () => {
    const mockCollections = [
      { filename: 'test.json', name: 'Test', items: [] }
    ];
    
    mockAxios.setResponse('/api/collections', {
      isOk: true,
      value: mockCollections,
    });

    const result = await adapter.storage.loadCollections();

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual(mockCollections);
    }
  });

  it('handles collection load error', async () => {
    mockAxios.setError('/api/collections', new Error('Network error'));

    const result = await adapter.storage.loadCollections();

    expect(result.isOk).toBe(false);
    if (!result.isOk) {
      expect(result.error).toContain('Network error');
    }
  });
});
```

## Architecture

### Adapter Pattern

The web package uses the adapter pattern to bridge the core UI with server-based persistence:

```
┌─────────────────────┐
│   Core UI           │
│   (@wave-client/    │
│    core)            │
└──────────┬──────────┘
           │
           │ useAdapter()
           ▼
┌─────────────────────┐
│   Web Adapter       │
│   (this package)    │
└──────────┬──────────┘
           │
           │ axios
           ▼
┌─────────────────────┐
│   Wave Server       │
│   (@wave-client/    │
│    server)          │
└─────────────────────┘
```

### Key Components to Test

1. **webAdapter.ts** - Main adapter implementation
   - Storage operations (collections, environments, history, etc.)
   - HTTP request execution
   - File operations
   - Security operations
   - Notification handling

2. **App.tsx** - Main application component
   - Theme management
   - Server health checks
   - Dialog management
   - Event handling

3. **ConfigPanel.tsx** - Configuration UI
4. **RequestEditor.tsx** - Request editor UI

## Next Steps to Increase Coverage

1. **Complete adapter tests:**
   - Test all storage operations (environments, history, cookies, etc.)
   - Test HTTP execution with various configurations
   - Test file operations (upload, download, import)
   - Test security operations
   - Test WebSocket event handling

2. **Add component tests:**
   - Test App.tsx theme management
   - Test server health check logic
   - Test dialog state management

3. **Integration tests:**
   - Test adapter + core UI integration
   - Test error recovery flows
   - Test WebSocket reconnection

4. **Follow the patterns:**
   - Mock all server API calls
   - Use MockAxiosInstance for consistent mocking
   - Reset state in `beforeEach`
   - Test happy paths and error cases
