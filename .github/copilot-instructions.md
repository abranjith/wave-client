## Project Overview: "Wave Client" - A VS Code REST Client Extension

**Goal:** Create a Visual Studio Code extension that functions as a modern, intuitive REST client for making HTTP requests, directly within the editor. The initial version (MVP) focuses on basic REST calls. "Wave Client" is built using React and Tailwind CSS for the webview UI, with a **monorepo architecture** that enables the same UI to run on multiple platforms (VS Code, web browsers, and future platforms).

**Core Problem Solved:** Provides a lightweight, integrated alternative to standalone tools like Postman, improving developer workflow by keeping API testing inside the IDE while maintaining platform independence.

**Key Differentiator:** A clean, minimalist UI that feels native to VS Code, with a focus on speed and ease of use. Platform-agnostic architecture allows code reuse across different environments.

## Tech Stack & Project Architecture

### Monorepo Structure

The project is organized as a **monorepo using Turbo** with the following packages:

1. **`packages/core/`** - Platform-agnostic core package
   - Contains all UI components, hooks, business logic, and utilities
   - **Zero platform-specific code** - no Node.js APIs, no `vsCodeApi`, no browser-specific code
   - Exported as a reusable library for all platform implementations
   - React components using Tailwind CSS
   - Uses TypeScript for type safety

2. **`packages/vscode/`** - VS Code extension implementation
   - Extension backend (`extension.ts`) running in Node.js environment
   - Webview frontend rendering core components
   - Implements `vsCodeAdapter` bridging webview to extension backend
   - Provides platform-specific services (file system, security, HTTP with proxies)
   - Entry: `webview/AppWithAdapter.tsx` wraps core UI with adapter context

3. **`packages/web/`** - Standalone web application
   - Browser-based deployment of Wave Client
   - Implements `webAdapter` using browser APIs (localStorage, fetch, Web Crypto)
   - Entry: `main.tsx` wraps core UI with adapter context
   - Useful for testing and alternative deployment scenarios

### Technology Stack

- **Language:** TypeScript (frontend and backend)
- **Frontend Framework:** React with Tailwind CSS
- **Icons:** Lucide React (https://lucide.dev/)
- **Component Libraries:** Origin UI (https://originui.com/)
- **Build Tool:** Vite (web), webpack (VS Code extension)
- **State Management:** React hooks (`useState`, `useReducer`, `useContext`)
- **HTTP Client:** axios (Node.js with proxy support), fetch API (web)
- **Monorepo:** Turbo for build orchestration and task running
- **Code Quality:** ESLint and Prettier
- **Package Manager:** pnpm with workspaces


## The Adapter Pattern

Wave Client uses an **adapter pattern** to achieve platform independence. The same UI components work on VS Code, web, and future platforms without modification.

**How it works:**
- All platform-specific I/O (file system, HTTP, storage, security) is delegated to adapters
- Components access adapters via the `useAdapter()` hook (and more specific hooks like `useStorageAdapter()`, `useHttpAdapter()`, etc.)
- `packages/core` contains **zero platform-specific code** - only pure React components and business logic
- Each platform (VS Code, web) implements its own adapter (`vsCodeAdapter`, `webAdapter`)

**For detailed information on the adapter pattern, implementation examples, and migration guidelines, see:** [Adapter Refactoring Guide](../docs/adapter-guide.md)

### Quick Adapter Usage

```tsx
import { useStorageAdapter, useNotificationAdapter } from '@wave-client/core';

function MyComponent() {
  const storage = useStorageAdapter();
  const notification = useNotificationAdapter();
  
  async function loadData() {
    const result = await storage.loadCollections();
    
    if (result.isOk) {
      console.log('Success:', result.value);
    } else {
      notification.showNotification('error', result.error);
    }
  }
}
```

---

## Key Instructions

### 1. Code Organization & Platform Independence

- **Core components** (`packages/core/src/components/`) must **never contain platform-specific code**
- No direct `vsCodeApi` calls in core components
- No direct `localStorage`, `fs`, or browser-only APIs in core
- Use `useAdapter()` hook to access platform-specific functionality
- See [Adapter Refactoring Guide](../docs/adapter-guide.md) for detailed migration patterns

### 2. Code Quality & Best Practices

- Use **TypeScript** for type safety across all packages
- Use **ESLint and Prettier** for consistent code formatting
- Follow **idiomatic React and TypeScript patterns**
- Write **clear, maintainable code** with appropriate comments where logic is non-obvious
- Use the established **`Result<T, E>` pattern** for functions that can fail
  - Success: `{ isOk: true, value: data }`
  - Error: `{ isOk: false, error: errorMessage }`
- **State Management**
  - This project uses zustand for global state management. Use React Context and hooks for local component state.
  - If a particular object is already being tracked in global state, avoid duplicating it in local state. In particular, avoid passing arguments to components that can be retrieved or managed from global state instead.

### 3. Error Handling

- **Always handle errors** from adapter calls using the Result pattern
- Show **user-friendly error messages** via `notification.showNotification('error', message)`
- Avoid bare `try/catch` blocks; use Result pattern for consistency
- Log errors appropriately for debugging

### 4. Component Structure

- Organize components into clear folders: `src/components/`, `src/hooks/`, `src/utils/`
- Keep components focused and single-responsibility
- Extract reusable logic into custom hooks
- Use Tailwind CSS with `@apply` directive for reusable component classes

### 5. Performance

- Avoid unnecessary re-renders by memoizing callbacks and using proper dependency arrays
- Keep webview fast - debounce/throttle event handlers as needed
- Batch state updates when possible
- Lazy load components for routes (when applicable)

### 6. Breaking Changes & Existing Functionality

- When changing any current file, be **extra careful about not breaking existing functionality**
- Test related components before and after changes
- If unsure about impact, check component usage with the codebase search tools

### 7. Documentation & Testing

- **Write tests for new functionality** using Vitest and React Testing Library
- Follow the Testing Strategy guidelines below
- Keep code self-documenting through clear names and structure
- Do **not** create or update documentation in the initial version (will be added later)

### 8. Before Deleting Files

- **Always ask for user confirmation** before deleting any files
- Verify the file is not imported or used elsewhere in the codebase

## Testing Strategy

The project uses **Vitest** and **React Testing Library** for testing the core package.

### Test Stack
- **Runner:** Vitest
- **Environment:** jsdom
- **Utilities:** `@testing-library/react`, `@testing-library/user-event`
- **Location:** `packages/core/src/test/`

### Writing Tests
1. **Location:** Place unit tests in `packages/core/src/test/` mirroring the source structure.
2. **Mocking Adapters:** Use `createMockAdapter` similar to `packages/core/src/test/mocks/mockAdapter.ts` when testing components that rely on `useAdapter`.
3. **Pattern:**
   - Use `render` from `@testing-library/react`.
   - Wrap components in `<AdapterProvider adapter={mockAdapter}>` where needed.
   - Assert on user-visible behavior (text, buttons), not implementation details.

### Example Test
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AdapterProvider } from '../../hooks/useAdapter';
import { createMockAdapter } from '../mocks/mockAdapter';
import { MyComponent } from '../../components/MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
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