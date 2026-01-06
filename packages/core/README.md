# @wave-client/core

The platform-agnostic core library of Wave Client - a modern REST client for VS Code and web browsers.

## Overview

`@wave-client/core` is the heart of the Wave Client project. It contains all UI components, hooks, business logic, and utilities that power the REST client experience. The library is designed to be **completely platform-independent**, allowing the same codebase to run seamlessly on:

- **VS Code** (via webview)
- **Web browsers** (standalone application)
- **Future platforms** (Electron, mobile, etc.)

This platform independence is achieved through the **Adapter Pattern**, which abstracts all platform-specific I/O operations (file system, HTTP, storage, security) into a common interface.

## Architecture

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    @wave-client/core                        │
│                   (Platform-Agnostic)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐ │
│  │   Components     │    │    Custom Hooks & Utilities  │ │
│  │                  │    │                              │ │
│  │ • RequestPanel   │    │ • useStorageAdapter()        │ │
│  │ • ResponseViewer │    │ • useHttpAdapter()           │ │
│  │ • Collections    │    │ • useFileAdapter()           │ │
│  │ • Environments   │    │ • useAppStateStore()         │ │
│  │ • Sidebar        │    │ • Custom validators/parsers  │ │
│  └────────┬─────────┘    └──────────────┬───────────────┘ │
│           │                             │                 │
│           └─────────────────┬───────────┘                 │
│                             │                            │
│                    ┌────────▼────────┐                   │
│                    │  useAdapter()   │                   │
│                    │    Context      │                   │
│                    └────────┬────────┘                   │
│                             │                            │
│                  ┌──────────▼──────────┐                │
│                  │ IPlatformAdapter    │                │
│                  │     (Interface)     │                │
│                  └──────────┬──────────┘                │
│                             │                            │
└─────────────────────────────┼──────────────────────────────┘
                              │
                              │ Implemented by
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────▼────────┐          ┌────────▼────────┐
        │ VS Code Impl   │          │   Web Impl      │
        │ (vscode pkg)   │          │  (web pkg)      │
        │                │          │                 │
        │ vsCodeAdapter  │          │  webAdapter     │
        │ • postMessage  │          │  • localStorage │
        │ • Node.js APIs │          │  • fetch API    │
        │ • SecretStore  │          │  • Web Crypto   │
        └────────────────┘          └─────────────────┘
```

### Package Structure

```
packages/core/
├── src/
│   ├── components/          # React UI components
│   │   ├── RequestPanel/
│   │   ├── ResponseViewer/
│   │   ├── Sidebar/
│   │   ├── Collections/
│   │   └── ...
│   ├── hooks/               # Custom React hooks
│   │   ├── useAdapter.tsx   # Access platform adapter
│   │   ├── useAppStateStore.ts
│   │   └── ...
│   ├── types/               # TypeScript type definitions
│   │   ├── adapters.ts      # IPlatformAdapter interface
│   │   ├── collection.ts
│   │   ├── auth.ts
│   │   └── ...
│   ├── utils/               # Utility functions
│   │   ├── collectionParser.ts
│   │   ├── encoding.ts
│   │   └── ...
│   ├── test/                # Test utilities & mocks
│   │   ├── mocks/
│   │   └── ...
│   └── index.ts             # Main entry point
├── vite.config.ts
├── vitest.config.ts
└── package.json
```

## Key Features

### 🎯 Platform Independence via Adapter Pattern

The **Adapter Pattern** is the cornerstone of Wave Client's architecture. It abstracts all platform-specific I/O into a common interface:

```typescript
interface IPlatformAdapter {
  storage: IStorageAdapter;        // Collections, environments, history
  http: IHttpAdapter;              // HTTP request execution
  file: IFileAdapter;              // File dialogs and operations
  secret: ISecretAdapter;          // Secure key storage
  security: ISecurityAdapter;      // Encryption/decryption
  notification: INotificationAdapter; // User notifications
  events: IAdapterEvents;          // Event emitter for push notifications
  
  readonly platform: 'vscode' | 'web' | 'electron' | 'test';
  initialize?(): Promise<void>;
  dispose?(): void;
}
```

**Benefits:**
- ✅ Write components once, deploy everywhere
- ✅ Easy to test with mock adapters
- ✅ Simple to add new platforms
- ✅ Clear separation of concerns
- ✅ Type-safe operations with Result pattern

### 🔧 Modular Component Library

Pre-built, reusable React components for common REST client tasks:
- Request editor with syntax highlighting
- Response viewer with multiple format support
- Collection management interface
- Environment variable management
- Request history
- Authentication setup

### 📊 Type-Safe Error Handling

Uses the `Result<T, E>` pattern for all operations that can fail:

```typescript
type Result<T, E> = 
  | { isOk: true; value: T }
  | { isOk: false; error: E };

// Usage
const result = await storage.loadCollections();
if (result.isOk) {
  console.log('Success:', result.value);
} else {
  console.error('Error:', result.error);
}
```

### 🎨 Tailwind CSS Styling

All components use Tailwind CSS for consistent, responsive design. Includes:
- Dark mode support
- VS Code theme integration
- Origin UI component patterns
- Lucide React icons

## Usage Examples

### Basic Component with Adapter

```tsx
import { useStorageAdapter, useNotificationAdapter } from '@wave-client/core';
import { useState, useEffect } from 'react';

export function CollectionsList() {
  const storage = useStorageAdapter();
  const notification = useNotificationAdapter();
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    async function load() {
      const result = await storage.loadCollections();
      
      if (result.isOk) {
        setCollections(result.value);
      } else {
        notification.showNotification('error', result.error);
      }
    }

    load();
  }, [storage, notification]);

  return (
    <div>
      {collections.map(col => (
        <div key={col.filename}>{col.name}</div>
      ))}
    </div>
  );
}
```

### Using Multiple Adapters

```tsx
import { 
  useStorageAdapter, 
  useHttpAdapter, 
  useNotificationAdapter 
} from '@wave-client/core';

export function RequestExecutor() {
  const storage = useStorageAdapter();
  const http = useHttpAdapter();
  const notification = useNotificationAdapter();

  async function executeRequest() {
    // Load environment variables
    const envResult = await storage.loadEnvironments();
    if (!envResult.isOk) {
      notification.showNotification('error', 'Failed to load environments');
      return;
    }

    // Execute HTTP request
    const httpResult = await http.executeRequest({
      id: 'req-123',
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: [],
      params: [],
      body: { type: 'none' },
      envVars: {},
    });

    if (httpResult.isOk) {
      notification.showNotification('success', 'Request completed!');
    } else {
      notification.showNotification('error', httpResult.error);
    }
  }

  return <button onClick={executeRequest}>Execute</button>;
}
```

### Subscribing to Events

```tsx
import { useAdapterEvent } from '@wave-client/core';

export function App() {
  useAdapterEvent('banner', (event) => {
    console.log(`${event.type}: ${event.message}`);
  });

  useAdapterEvent('collectionsChanged', () => {
    // Refetch collections when they change externally
    console.log('Collections were updated!');
  });

  return <div>Wave Client</div>;
}
```

## Developer Guide

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm/yarn

### Installation

```bash
# Install dependencies from workspace root
pnpm install
```

### Development

#### Start Watch Mode

Watch for changes in TypeScript and rebuild automatically:

```bash
# From workspace root
pnpm watch

# Or from packages/core
pnpm -F @wave-client/core watch
```

This will:
- Watch source files for changes
- Recompile TypeScript incrementally
- Make changes available to dependent packages (vscode, web)

#### Build

Create an optimized production build:

```bash
# From workspace root
pnpm build

# Or from packages/core
pnpm -F @wave-client/core build
```

### Testing

#### Run Tests Once

```bash
# From workspace root
pnpm test:core

# Or from packages/core
pnpm test
```

#### Watch Mode for Tests

```bash
# From workspace root
pnpm watch-tests

# Or from packages/core
pnpm watch:test
```

This will:
- Watch test files for changes
- Re-run affected tests automatically
- Display coverage information

#### Generate Coverage Report

```bash
# From workspace root
pnpm coverage

# Or from packages/core
pnpm coverage
```

Coverage reports are generated in `coverage/` directory.

### Code Quality

#### Lint Code

```bash
# From workspace root
pnpm lint

# Or from packages/core
pnpm lint
```

Checks for code quality issues and style violations.

#### Format Code

```bash
# From workspace root
pnpm format

# Or from packages/core
pnpm format
```

Automatically formats code with Prettier.

### Project Scripts Reference

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm watch` | Watch and rebuild (background) |
| `pnpm build` | Build for production |
| `pnpm test` | Run tests once |
| `pnpm watch:test` | Watch and re-run tests |
| `pnpm coverage` | Generate coverage report |
| `pnpm lint` | Check code quality |
| `pnpm format` | Format code with Prettier |

### Best Practices

#### 1. Component Development

- Keep components focused and single-responsibility
- Use hooks for state management
- Prefer specific adapter hooks (`useStorageAdapter()`) over generic `useAdapter()`
- Always handle errors from adapter calls

#### 2. Error Handling

```tsx
// ✅ Good: Proper error handling with Result pattern
const result = await adapter.storage.loadCollections();
if (result.isOk) {
  setData(result.value);
} else {
  notification.showNotification('error', result.error);
}

// ❌ Avoid: Bare try/catch
try {
  const data = await adapter.storage.loadCollections();
} catch (e) {
  console.error(e);
}
```

#### 3. Platform Independence

```tsx
// ✅ Good: Use adapter abstraction
const result = await adapter.file.showSaveDialog(options);

// ❌ Avoid: Direct platform-specific code
if (window.vsCodeApi) {
  window.vsCodeApi.postMessage({ type: 'save' });
}
```

#### 4. Testing Components

```tsx
import { render, screen } from '@testing-library/react';
import { AdapterProvider } from '../hooks/useAdapter';
import { createMockAdapter } from './mocks/mockAdapter';

describe('MyComponent', () => {
  it('should render', () => {
    const mockAdapter = createMockAdapter();
    
    render(
      <AdapterProvider adapter={mockAdapter}>
        <MyComponent />
      </AdapterProvider>
    );
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Documentation

- [Adapter Refactoring Guide](../../docs/adapter-refactoring-guide.md) - Deep dive into the adapter pattern, implementation details, and migration guidelines
- [Getting Started](../../docs/getting-started.md) - Project setup and initial development steps

## Dependencies

### Core Dependencies
- **react** - UI framework
- **react-dom** - React rendering
- **tailwindcss** - Utility-first CSS framework
- **lucide-react** - Icon library
- **zustand** - Lightweight state management

### Development Dependencies
- **vitest** - Fast unit test framework
- **@testing-library/react** - React testing utilities
- **typescript** - Type safety
- **vite** - Build tool
- **tailwindcss** - CSS framework

## Export API

The core package exports:

```typescript
// Components
export { RequestPanel } from './components/RequestPanel';
export { ResponseViewer } from './components/ResponseViewer';
// ... other components

// Hooks
export { useAdapter, AdapterProvider } from './hooks/useAdapter';
export { useStorageAdapter } from './hooks/useStorageAdapter';
// ... other hooks

// Types
export type { IPlatformAdapter, IStorageAdapter } from './types/adapters';
export type { Collection, Request } from './types/collection';
// ... other types

// Utilities
export { parseCollection } from './utils/collectionParser';
// ... other utilities
```

## Contributing

When contributing to `@wave-client/core`:

1. **Ensure platform independence** - No direct `vsCodeApi`, `localStorage`, or Node.js APIs
2. **Use adapters for I/O** - All platform-specific operations must go through adapters
3. **Follow the Result pattern** - Use `Result<T, E>` for fallible operations
4. **Write tests** - Add tests for new functionality in `src/test/`
5. **Update exports** - Ensure new components/utilities are exported from `index.ts`
6. **Run checks** - Execute `pnpm lint`, `pnpm format`, and `pnpm test` before committing

## License

See [LICENSE](../../LICENSE) in the project root.
