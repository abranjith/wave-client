# Adapter Refactoring Guide

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [The Adapter Interface](#the-adapter-interface)
- [How It Works](#how-it-works)
- [Implementation Examples](#implementation-examples)
- [Usage in Components](#usage-in-components)
- [Migration Guidelines](#migration-guidelines)
- [Legacy Code Removal](#legacy-code-removal)

---

## Overview

The Wave Client project has been refactored into a multi-package monorepo using an **adapter pattern** to achieve platform independence. This architecture separates the UI logic from platform-specific I/O operations, allowing the same React components to run on:

- **VS Code** (using Node.js APIs, file system, VS Code SecretStorage)
- **Web browsers** (using IndexedDB, fetch API, Web Crypto API)
- **Future platforms** (Electron, mobile, etc.)

### Key Principles

1. **Core is Pure**: The `@wave-client/core` package contains **zero** platform-specific code. No direct file I/O, no `vsCodeApi`, no browser-specific APIs.
2. **Adapters Handle I/O**: All input/output operations are delegated to platform-specific adapter implementations.
3. **Single Interface**: All adapters implement the same `IPlatformAdapter` interface, ensuring consistency.
4. **Type Safety**: The `Result<T, E>` pattern provides type-safe error handling across all adapter operations.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    @wave-client/core                        │
│                                                             │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │  Components   │  │    Hooks     │  │     Utils       │ │
│  │  (UI Logic)   │  │ (State Mgmt) │  │ (Pure Functions)│ │
│  └───────┬───────┘  └──────┬───────┘  └─────────────────┘ │
│          │                 │                               │
│          └─────────────────┘                               │
│                    │                                       │
│                    ▼                                       │
│          ┌──────────────────┐                             │
│          │  useAdapter()    │                             │
│          │    Hook          │                             │
│          └─────────┬────────┘                             │
└────────────────────┼──────────────────────────────────────┘
                     │
          ┌──────────▼───────────┐
          │  IPlatformAdapter    │
          │     (Interface)      │
          └──────────┬───────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│ VS Code Impl  │         │   Web Impl    │
│               │         │               │
│ vsCodeAdapter │         │  webAdapter   │
│               │         │               │
│ postMessage   │         │  localStorage │
│ Node.js APIs  │         │  fetch API    │
│ SecretStorage │         │  Web Crypto   │
└───────────────┘         └───────────────┘
```

### Package Structure

- **`packages/core/`**: Platform-agnostic UI components, hooks, and business logic
  - Exports: Components, hooks (`useAdapter`), types, utilities
  - Dependencies: React, utility libraries (no platform-specific code)

- **`packages/vscode/`**: VS Code extension implementation
  - Implements: `vsCodeAdapter` (bridges webview postMessage to adapter interface)
  - Platform: VS Code webview environment
  - Entry: `AppWithAdapter.tsx` wraps core UI with adapter context

- **`packages/web/`**: Standalone web application
  - Implements: `webAdapter` (uses localStorage, fetch, etc.)
  - Platform: Browser
  - Entry: `main.tsx` wraps core UI with adapter context

---

## The Adapter Interface

The adapter interface is defined in [`packages/core/src/types/adapters.ts`](../packages/core/src/types/adapters.ts) and consists of six sub-adapters:

### 1. **IStorageAdapter**
Handles persistent storage for collections, environments, history, cookies, auth, proxies, certs, and settings.

```typescript
interface IStorageAdapter {
  // Collections
  loadCollections(): Promise<Result<Collection[], string>>;
  saveCollection(collection: Collection): Promise<Result<Collection, string>>;
  deleteCollection(collectionId: string): Promise<Result<void, string>>;
  
  // Environments
  loadEnvironments(): Promise<Result<Environment[], string>>;
  saveEnvironment(environment: Environment): Promise<Result<void, string>>;
  deleteEnvironment(environmentId: string): Promise<Result<void, string>>;
  
  // History
  loadHistory(): Promise<Result<ParsedRequest[], string>>;
  saveRequestToHistory(request: ParsedRequest): Promise<Result<void, string>>;
  clearHistory(): Promise<Result<void, string>>;
  
  // Cookies, Auth, Proxy, Certs, Validation Rules, Settings
  // ... (see adapters.ts for full interface)
}
```

**VS Code**: Uses file system via extension services  
**Web**: Uses localStorage or IndexedDB

---

### 2. **IHttpAdapter**
Executes HTTP requests and returns responses.

```typescript
interface IHttpAdapter {
  executeRequest(config: HttpRequestConfig): Promise<Result<HttpResponseResult, string>>;
  cancelRequest?(requestId: string): void;
}
```

**VS Code**: Uses axios with Node.js https agent (supports proxies, certs)  
**Web**: Uses fetch API (limited by CORS)

---

### 3. **IFileAdapter**
Handles file dialogs and file operations.

```typescript
interface IFileAdapter {
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  showOpenDialog(options: OpenDialogOptions): Promise<string[] | null>;
  
  readFile(path: string): Promise<Result<string, string>>;
  readFileAsBinary(path: string): Promise<Result<Uint8Array, string>>;
  writeFile(path: string, content: string): Promise<Result<void, string>>;
  writeBinaryFile(path: string, data: Uint8Array): Promise<Result<void, string>>;
  
  downloadResponse(data: Uint8Array, filename: string, contentType: string): Promise<Result<void, string>>;
  importFile(options: OpenDialogOptions): Promise<Result<{ content: string; filename: string } | null, string>>;
}
```

**VS Code**: Uses `vscode.window.showSaveDialog`, `showOpenDialog`  
**Web**: Uses browser File API, creates blob download links

---

### 4. **ISecretAdapter**
Handles secure storage of encryption keys and recovery keys.

```typescript
interface ISecretAdapter {
  storeSecret(key: string, value: string): Promise<Result<void, string>>;
  getSecret(key: string): Promise<Result<string | undefined, string>>;
  deleteSecret(key: string): Promise<Result<void, string>>;
  hasSecret(key: string): Promise<boolean>;
}
```

**VS Code**: Uses `vscode.SecretStorage` API  
**Web**: Uses server-side encrypted storage or localStorage (less secure)

---

### 5. **ISecurityAdapter**
Handles encryption/decryption operations.

```typescript
interface ISecurityAdapter {
  getEncryptionStatus(): Promise<EncryptionStatus>;
  enableEncryption(password: string): Promise<Result<void, string>>;
  disableEncryption(password: string): Promise<Result<void, string>>;
  changePassword(oldPassword: string, newPassword: string): Promise<Result<void, string>>;
  exportRecoveryKey(): Promise<Result<void, string>>;
  recoverWithKey(recoveryKeyPath: string): Promise<Result<void, string>>;
}
```

**VS Code**: Uses Node.js `crypto` module  
**Web**: Uses Web Crypto API

---

### 6. **INotificationAdapter**
Handles user notifications and dialogs.

```typescript
interface INotificationAdapter {
  showNotification(type: NotificationType, message: string, duration?: number): void;
  showConfirmation?(message: string, confirmLabel?: string, cancelLabel?: string): Promise<boolean>;
  showInput?(message: string, defaultValue?: string, placeholder?: string): Promise<string | null>;
}
```

**VS Code**: Banner messages via webview postMessage  
**Web**: Toast notifications or browser notifications

---

### Combined Interface

All sub-adapters are combined into a single `IPlatformAdapter`:

```typescript
interface IPlatformAdapter {
  storage: IStorageAdapter;
  http: IHttpAdapter;
  file: IFileAdapter;
  secret: ISecretAdapter;
  security: ISecurityAdapter;
  notification: INotificationAdapter;
  
  readonly platform: 'vscode' | 'web' | 'electron' | 'test';
  
  initialize?(): Promise<void>;
  dispose?(): void;
}
```

---

## How It Works

### 1. Platform Entry Point Provides Adapter

Each platform-specific package creates and provides its adapter implementation:

**VS Code** ([`packages/vscode/src/webview/AppWithAdapter.tsx`](../packages/vscode/src/webview/AppWithAdapter.tsx)):
```tsx
import { createVSCodeAdapter } from './vsCodeAdapter';
import { AdapterProvider } from '@wave-client/core';

const vsCodeApi = acquireVsCodeApi();
const { adapter } = createVSCodeAdapter(vsCodeApi);

<AdapterProvider adapter={adapter}>
  <App />
</AdapterProvider>
```

**Web** ([`packages/web/src/main.tsx`](../packages/web/src/main.tsx)):
```tsx
import { createWebAdapter } from './adapters/webAdapter';
import { AdapterProvider } from '@wave-client/core';

const adapter = createWebAdapter();

<AdapterProvider adapter={adapter}>
  <App />
</AdapterProvider>
```

---

### 2. Components Access Adapter via Context Hook

Components in the core package use the `useAdapter()` hook to access platform-specific functionality:

```tsx
import { useAdapter } from '@wave-client/core';

function MyComponent() {
  const adapter = useAdapter();
  
  async function loadData() {
    const result = await adapter.storage.loadCollections();
    
    if (result.isOk) {
      console.log('Collections:', result.value);
    } else {
      console.error('Error:', result.error);
    }
  }
  
  return <button onClick={loadData}>Load</button>;
}
```

---

### 3. Adapter Delegates to Platform-Specific Implementation

**VS Code Adapter Flow:**
```
Component calls adapter.storage.loadCollections()
  ↓
vsCodeAdapter.storage.loadCollections() 
  ↓
Creates promise and stores in pendingRequests map with requestId
  ↓
vsCodeApi.postMessage({ type: 'loadCollections', requestId: 'req-123' })
  ↓
VS Code Extension receives message
  ↓
MessageHandler.ts routes to CollectionService.loadCollections()
  ↓
Reads from file system
  ↓
Sends response: { type: 'collectionsLoaded', collections: [...] }
  ↓
vsCodeAdapter.handleMessage() receives response
  ↓
Matches 'collectionsLoaded' message type
  ↓
Resolves promise from pendingRequests with Result<Collection[], string>
  ↓
Component receives data
```

> **⚠️ Critical Implementation Detail:**  
> The vsCodeAdapter uses a **promise-based request/response pattern**. Every adapter method that communicates with the extension:
> 1. Creates a unique `requestId` 
> 2. Stores a promise in the `pendingRequests` map
> 3. Sends a postMessage with the requestId
> 4. The `handleMessage` listener matches responses by message type (e.g., `collectionsLoaded`)
> 5. Resolves the promise with the response data
> 
> This ensures adapter methods return actual data instead of immediately returning empty arrays. Without this pattern, `await storage.loadCollections()` would return `[]` before the extension responds.

**Web Adapter Flow:**
```
Component calls adapter.storage.loadCollections()
  ↓
webAdapter.storage.loadCollections()
  ↓
Reads from localStorage
  ↓
Parses JSON
  ↓
Returns Result<Collection[], string> immediately
  ↓
Component receives data
```

---

## Implementation Examples

### Example 1: Loading Collections in a Component

```tsx
import { useState, useEffect } from 'react';
import { useStorageAdapter } from '@wave-client/core';
import type { Collection } from '@wave-client/core';

export function CollectionsList() {
  const storage = useStorageAdapter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function load() {
      const result = await storage.loadCollections();
      
      if (result.isOk) {
        setCollections(result.value);
      } else {
        setError(result.error);
      }
      
      setLoading(false);
    }
    
    load();
  }, [storage]);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <ul>
      {collections.map(c => (
        <li key={c.filename}>{c.name}</li>
      ))}
    </ul>
  );
}
```

---

### Example 2: Executing HTTP Request

```tsx
import { useState } from 'react';
import { useHttpAdapter, useNotificationAdapter } from '@wave-client/core';
import type { HttpRequestConfig } from '@wave-client/core';

export function RequestExecutor() {
  const http = useHttpAdapter();
  const notification = useNotificationAdapter();
  const [loading, setLoading] = useState(false);
  
  async function sendRequest() {
    setLoading(true);
    
    const config: HttpRequestConfig = {
      id: 'req-123',
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: [],
      params: [],
      body: { type: 'none' },
      envVars: {},
    };
    
    const result = await http.executeRequest(config);
    
    if (result.isOk) {
      notification.showNotification('success', 'Request successful!');
      console.log('Response:', result.value.body);
    } else {
      notification.showNotification('error', result.error);
    }
    
    setLoading(false);
  }
  
  return (
    <button onClick={sendRequest} disabled={loading}>
      {loading ? 'Sending...' : 'Send Request'}
    </button>
  );
}
```

---

### Example 3: File Operations

```tsx
import { useFileAdapter, useNotificationAdapter } from '@wave-client/core';

export function ExportButton() {
  const file = useFileAdapter();
  const notification = useNotificationAdapter();
  
  async function exportData() {
    const path = await file.showSaveDialog({
      defaultFileName: 'collection.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    
    if (!path) return; // User cancelled
    
    const data = JSON.stringify({ name: 'My Collection' }, null, 2);
    const result = await file.writeFile(path, data);
    
    if (result.isOk) {
      notification.showNotification('success', 'File saved!');
    } else {
      notification.showNotification('error', result.error);
    }
  }
  
  return <button onClick={exportData}>Export</button>;
}
```

---

## Usage in Components

### Available Hooks

The core package provides several hooks for accessing adapters:

```tsx
import {
  useAdapter,              // Returns full IPlatformAdapter
  useStorageAdapter,       // Returns IStorageAdapter
  useHttpAdapter,          // Returns IHttpAdapter
  useFileAdapter,          // Returns IFileAdapter
  useSecretAdapter,        // Returns ISecretAdapter
  useSecurityAdapter,      // Returns ISecurityAdapter
  useNotificationAdapter,  // Returns INotificationAdapter
  usePlatform,             // Returns 'vscode' | 'web' | etc.
} from '@wave-client/core';
```

### Best Practices

1. **Use specific adapter hooks** instead of `useAdapter()` for better code clarity:
   ```tsx
   // Good
   const storage = useStorageAdapter();
   
   // Less clear
   const adapter = useAdapter();
   const storage = adapter.storage;
   ```

2. **Always handle both success and error cases** with the Result pattern:
   ```tsx
   const result = await adapter.storage.loadCollections();
   
   if (result.isOk) {
     // Handle success
     const collections = result.value;
   } else {
     // Handle error
     const errorMessage = result.error;
   }
   ```

3. **Show user feedback** for errors:
   ```tsx
   const notification = useNotificationAdapter();
   
   if (result.isErr) {
     notification.showNotification('error', result.error);
   }
   ```

4. **Avoid direct platform checks** unless absolutely necessary:
   ```tsx
   // Avoid this pattern
   const platform = usePlatform();
   if (platform === 'vscode') {
     // VS Code-specific logic
   }
   
   // Prefer this: let the adapter handle platform differences
   const result = await adapter.file.showSaveDialog(options);
   ```

---

## Migration Guidelines

When refactoring existing code to use the adapter pattern, follow these steps:

### Step 1: Identify Direct I/O Operations

Search for patterns like:
- `vsCodeApi.postMessage(...)` or `vsCodeRef.current.postMessage(...)`
- `localStorage.getItem(...)`
- Direct file operations
- Direct HTTP requests (fetch, axios)

### Step 2: Replace with Adapter Calls

**Before:**
```tsx
// Legacy VS Code-specific code
vsCodeRef.current.postMessage({
  type: 'loadCollections'
});

// Listen for response
useEffect(() => {
  const handler = (event: MessageEvent) => {
    if (event.data.type === 'collectionsLoaded') {
      setCollections(event.data.collections);
    }
  };
  
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}, []);
```

**After:**
```tsx
// Platform-agnostic adapter code
import { useStorageAdapter } from '@wave-client/core';

const storage = useStorageAdapter();

useEffect(() => {
  async function load() {
    const result = await storage.loadCollections();
    
    if (result.isOk) {
      setCollections(result.value);
    }
  }
  
  load();
}, [storage]);
```

### Step 3: Update Prop Drilling

**Before:**
```tsx
// Parent component
<ChildComponent vsCodeRef={vsCodeRef} />

// Child component
interface Props {
  vsCodeRef: React.RefObject<VSCodeAPI>;
}

function ChildComponent({ vsCodeRef }: Props) {
  // ...
}
```

**After:**
```tsx
// Parent component
<ChildComponent />

// Child component - no props needed!
import { useAdapter } from '@wave-client/core';

function ChildComponent() {
  const adapter = useAdapter();
  // ...
}
```

### Step 4: Handle Errors Consistently

**Before:**
```tsx
try {
  const response = await fetch(url);
  const data = await response.json();
  setData(data);
} catch (error) {
  console.error(error);
  alert('Error!');
}
```

**After:**
```tsx
const result = await adapter.http.executeRequest(config);

if (result.isOk) {
  setData(result.value);
} else {
  adapter.notification.showNotification('error', result.error);
}
```

### Step 5: Remove Legacy Code

After migration, remove:
- `vsCodeRef` props
- Direct `vsCodeApi` usage
- Platform-specific imports in core components
- Message event listeners for adapter-handled operations

---

## Legacy Code Removal

### Checklist for Complete Migration

Use this checklist to identify and remove legacy patterns:

#### ✅ Direct vsCodeApi Usage
- [ ] Search for `vsCodeApi.postMessage` in core components
- [ ] Search for `vsCodeRef.current.postMessage`
- [ ] Search for `acquireVsCodeApi()` outside entry points
- [ ] Remove `vsCodeRef` props from component interfaces

#### ✅ Message Event Listeners
- [ ] Search for `window.addEventListener('message', ...)` in core components
- [ ] Keep only adapter-specific listeners in `vsCodeAdapter.ts` and `webAdapter.ts`
- [ ] Remove response handlers that are now in adapters

#### ✅ Direct Storage Access
- [ ] Search for `localStorage.getItem`
- [ ] Search for `localStorage.setItem`
- [ ] Search for direct file system operations (`fs.readFile`, etc.)

#### ✅ Direct HTTP Calls
- [ ] Search for `fetch(` in core components
- [ ] Search for `axios(` in core components
- [ ] Ensure all HTTP calls go through `IHttpAdapter`

#### ✅ Platform-Specific Imports
- [ ] Remove `import { vscode } from ...` in core components
- [ ] Remove Node.js-specific imports (`fs`, `path`, `crypto`) from core
- [ ] Ensure core only imports from `@wave-client/core`

#### ✅ Prop Drilling
- [ ] Remove `vsCodeRef` props
- [ ] Remove other platform-specific props
- [ ] Replace with `useAdapter()` hook

---

### Code Smell Patterns to Avoid

**❌ BAD: Direct platform API usage in core**
```tsx
// In packages/core/src/components/MyComponent.tsx
vsCodeApi.postMessage({ type: 'save' });
```

**✅ GOOD: Use adapter**
```tsx
// In packages/core/src/components/MyComponent.tsx
import { useStorageAdapter } from '@wave-client/core';

const storage = useStorageAdapter();
await storage.saveCollection(collection);
```

---

**❌ BAD: Platform detection in components**
```tsx
if (typeof window !== 'undefined' && window.vsCodeApi) {
  // VS Code-specific logic
} else {
  // Web-specific logic
}
```

**✅ GOOD: Let adapter handle it**
```tsx
// Adapter handles platform differences transparently
const result = await adapter.file.showSaveDialog(options);
```

---

**❌ BAD: Conditional rendering based on platform**
```tsx
const platform = usePlatform();
return platform === 'vscode' ? <VSCodeButton /> : <WebButton />;
```

**✅ GOOD: Platform-agnostic components**
```tsx
// Same component works on all platforms
return <Button onClick={handleClick} />;
```

---

## Summary

The adapter pattern provides:

✅ **Platform Independence**: Core UI works on VS Code, web, and future platforms  
✅ **Type Safety**: Result<T, E> pattern ensures proper error handling  
✅ **Maintainability**: Clear separation of concerns  
✅ **Testability**: Easy to mock adapters for testing  
✅ **Scalability**: Easy to add new platforms  

When refactoring:
1. Move all I/O operations to adapters
2. Use `useAdapter()` and related hooks in components
3. Remove direct `vsCodeApi` usage and platform-specific code
4. Handle errors with the Result pattern
5. Verify legacy code is removed

---

**Next Steps**: Use this guide to systematically refactor remaining components and remove legacy code patterns.

