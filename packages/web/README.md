# @wave-client/web

Standalone web application version of Wave Client - a modern REST client that runs in your browser.

## Purpose

`@wave-client/web` is a **browser-based deployment** of Wave Client that provides the full REST client experience as a standalone web app. It uses the same UI components from `@wave-client/core` but implements a **web platform adapter** that communicates with a local server for I/O operations.

**Use Cases:**
- Developers who prefer browser-based tools
- Self hosted environments / Cloud deployment
- Demonstration and showcase of the platform-agnostic architecture

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Browser (http://localhost:5173)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              @wave-client/web                        │  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │         React App (App.tsx)                    │ │  │
│  │  │  • Theme management (light/dark)               │ │  │
│  │  │  • Server connection monitoring                │ │  │
│  │  │  • Main layout & routing                       │ │  │
│  │  └──────────────────┬─────────────────────────────┘ │  │
│  │                     │                               │  │
│  │  ┌──────────────────▼─────────────────────────────┐ │  │
│  │  │   AdapterProvider (webAdapter)                 │ │  │
│  │  │   • Wraps core UI with web platform adapter   │ │  │
│  │  └──────────────────┬─────────────────────────────┘ │  │
│  │                     │                               │  │
│  │  ┌──────────────────▼─────────────────────────────┐ │  │
│  │  │      @wave-client/core Components              │ │  │
│  │  │   (Platform-agnostic UI from core package)     │ │  │
│  │  │   • RequestEditor                              │ │  │
│  │  │   • ResponseViewer                             │ │  │
│  │  │   • Collections, Environments, Settings        │ │  │
│  │  └──────────────────┬─────────────────────────────┘ │  │
│  │                     │                               │  │
│  └─────────────────────┼───────────────────────────────┘  │
│                        │                                  │
│  ┌─────────────────────▼───────────────────────────────┐  │
│  │         webAdapter.ts                               │  │
│  │  • REST API client (axios → server)                │  │
│  │  • WebSocket client (real-time sync)               │  │
│  │  • Implements IPlatformAdapter interface           │  │
│  └─────────────────────┬───────────────────────────────┘  │
│                        │                                  │
└────────────────────────┼────────────────────────────────────┘
                         │
                         │ HTTP + WebSocket
                         │ http://127.0.0.1:3456
                         │
┌────────────────────────▼────────────────────────────────────┐
│            @wave-client/server (Node.js)                    │
│  • File system access                                       │
│  • HTTP execution (with proxies, certs)                     │
│  • Encryption operations                                    │
│  • WebSocket broadcasting                                   │
└─────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/web/
├── src/
│   ├── main.tsx              # React app entry point
│   ├── App.tsx               # Main application component
│   ├── index.css             # Global styles (Tailwind)
│   ├── adapters/             # Platform adapter implementations
│   │   ├── index.ts          # Export web adapter
│   │   └── webAdapter.ts     # Web platform adapter (REST + WS)
│   ├── components/           # Web-specific components
│   │   ├── ConfigPanel.tsx   # Configuration UI
│   │   └── RequestEditor.tsx # Request editor wrapper
│   └── test/                 # Web-specific tests
│       └── webAdapter.test.ts
├── scripts/
│   └── start-dev.js          # Dev server startup script
├── index.html                # HTML template
├── vite.config.ts            # Vite configuration
├── vitest.config.ts          # Test configuration
└── package.json
```

## Design

### Web Adapter Architecture

The **webAdapter** implements `IPlatformAdapter` by delegating all I/O operations to the Wave Client Server:

```typescript
// Adapter pattern in action
const webAdapter: IPlatformAdapter = {
  storage: {
    async loadCollections() {
      const response = await api.get('/collections');
      return ok(response.data);
    },
    // ... other storage operations
  },
  http: {
    async executeRequest(config) {
      const response = await api.post('/http/execute', config);
      return ok(response.data);
    },
  },
  // ... file, secret, security, notification adapters
};
```

### Server Communication Patterns

#### 1. REST API (Primary)
- **Synchronous operations**: Load, save, delete data
- **Request/Response**: Standard HTTP methods (GET, POST, DELETE)
- **Error handling**: Result pattern for type-safe errors

#### 2. WebSocket (Real-time)
- **Asynchronous updates**: Server broadcasts state changes
- **Event-driven**: Automatic UI updates when data changes
- **Multi-client sync**: Multiple browser tabs stay synchronized

### Theme Management

The web app includes **light/dark theme** support:

```tsx
const ThemeContext = createContext<ThemeContextType>();

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  
  // Toggle theme and persist to localStorage
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('wave-theme', newTheme);
  };
  
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme}>
        {/* App content */}
      </div>
    </ThemeContext.Provider>
  );
}
```

### Server Health Monitoring

The web app **monitors server connection** and displays status:

```tsx
function ServerStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  
  useEffect(() => {
    const checkConnection = async () => {
      const healthy = await checkServerHealth();
      setIsConnected(healthy);
    };
    
    checkConnection();
    const interval = setInterval(checkConnection, 10000); // Check every 10s
    return () => clearInterval(interval);
  }, []);
  
  // Display connection status UI
}
```

## Key Features

### 🌐 Full REST Client Capabilities

All features from the core library work in the browser:
- **HTTP methods**: GET, POST, PUT, DELETE, PATCH, etc.
- **Request editor**: Headers, params, body (JSON, form-data, etc.)
- **Response viewer**: Formatted JSON, HTML, images, etc.
- **Collections**: Organize requests into collections
- **Environments**: Manage environment variables
- **History**: Track previous requests
- **Authentication**: Bearer, Basic, OAuth support
- **Proxies & Certificates**: Via server-side execution

### 🎨 Modern UI/UX

- **Responsive design**: Works on desktop and tablets
- **Dark mode**: System preference detection + manual toggle
- **Tailwind CSS**: Utility-first styling for rapid development
- **Lucide icons**: Beautiful, consistent iconography
- **Origin UI patterns**: Professional component library

### 🔄 Real-Time Synchronization

- **WebSocket connection**: Automatic reconnection on disconnect
- **State broadcasting**: Changes in one tab update all tabs
- **Server health monitoring**: Visual feedback when server is down
- **Event-driven updates**: No manual refresh needed

### 🧪 Development Features

- **Hot reload**: Vite dev server with instant updates
- **Fast builds**: Optimized production bundles
- **Custom start script**: Automatically launches server + web app
- **Testing setup**: Vitest with React Testing Library

### 📦 Reusable Components

Uses `@wave-client/core` components without modification:
- Zero code duplication
- Same UI as VS Code extension
- Consistent behavior across platforms
- Easy to maintain

## Tech Stack

- **Build Tool**: [Vite](https://vitejs.dev/) - Lightning-fast dev server and build tool
- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS with PostCSS
- **HTTP Client**: axios (communicates with server)
- **WebSocket**: Native WebSocket API
- **Testing**: Vitest + React Testing Library
- **Core UI**: `@wave-client/core` (platform-agnostic components)

## Developer Guide

### Prerequisites

- Node.js 18+
- pnpm (recommended)
- `@wave-client/server` running (required for I/O operations)

### Installation

```bash
# From workspace root
pnpm install
```

### Development

#### Start Web App + Server

The **easiest way** to start both server and web app:

```bash
# From workspace root
pnpm dev:web

# Or from packages/web
pnpm start
```

This runs the [`scripts/start-dev.js`](./scripts/start-dev.js) script which:
1. Starts `@wave-client/server` on port 3456
2. Starts Vite dev server on port 5173
3. Monitors both processes
4. Provides clear terminal output

#### Start Web App Only

If the server is already running:

```bash
# From packages/web
pnpm dev
```

Opens at: **http://localhost:5173**

#### Build for Production

```bash
# From workspace root
pnpm build

# Or from packages/web
pnpm build
```

Creates optimized build in `dist/` directory.

#### Preview Production Build

```bash
# From packages/web
pnpm preview
```

Serves the production build locally for testing.

### Testing

#### Run Tests

```bash
# From workspace root
pnpm test:web

# Or from packages/web
pnpm test
```

#### Watch Mode

```bash
# From packages/web
pnpm test:watch
```

#### Test with UI

```bash
# From packages/web
pnpm test:ui
```

Opens Vitest UI for interactive testing.

#### Coverage Report

```bash
# From packages/web
pnpm test:coverage
```

Generates coverage report in `coverage/` directory.

### Project Scripts

| Command | Description |
|---------|-------------|
| `pnpm start` | Start server + web app (recommended) |
| `pnpm dev` | Start Vite dev server only |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm test` | Run tests once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:coverage` | Generate coverage report |
| `pnpm test:ui` | Open Vitest UI |
| `pnpm lint` | Lint source code |
| `pnpm typecheck` | Type-check without emitting |

## Configuration

### Vite Configuration

The Vite config ([`vite.config.ts`](./vite.config.ts)) includes:
- React plugin for JSX support
- PostCSS for Tailwind processing
- Dev server configuration (port, CORS)
- Build optimizations

### Server Connection

The web adapter connects to the server at:

```typescript
const SERVER_URL = 'http://127.0.0.1:3456';
const WS_URL = 'ws://127.0.0.1:3456/ws';
```

To change the server URL, edit [`src/adapters/webAdapter.ts`](./src/adapters/webAdapter.ts).

> **Future Enhancement**: Make server URL configurable via environment variables

## Deployment

### Local Development (Current)

```bash
# Terminal 1: Start server
pnpm dev:server

# Terminal 2: Start web app
pnpm dev:web
```

### Production Build (Future)

```bash
# Build web app
pnpm build

# Serve with a static file server
npx serve -s dist

# Or use nginx, Apache, etc.
```

**Note**: Production deployment requires:
- Secure server configuration (HTTPS, authentication)
- Environment-based server URL configuration
- CDN for static assets (optional)
- Reverse proxy setup (nginx, Caddy)

## Comparison: Web vs VS Code

| Feature | @wave-client/web | @wave-client/vscode |
|---------|------------------|---------------------|
| **Platform** | Browser | VS Code webview |
| **Adapter** | webAdapter (REST API) | vsCodeAdapter (postMessage) |
| **I/O Backend** | @wave-client/server | VS Code extension API |
| **Deployment** | Standalone web app | VS Code extension |
| **Storage** | Server file system | VS Code workspace |
| **Theme** | Custom light/dark toggle | VS Code theme integration |
| **Authentication** | Future feature | VS Code SecretStorage |
| **Installation** | Clone + pnpm install | VS Code Marketplace |

**Shared:**
- Same UI components (`@wave-client/core`)
- Same request execution capabilities
- Same collection/environment management
- Same adapter pattern architecture

## Best Practices

### 1. Always Check Server Connection

```tsx
// Display server status to users
<ServerStatus />
```

### 2. Handle Adapter Errors

```tsx
const result = await adapter.storage.loadCollections();

if (result.isOk) {
  setCollections(result.value);
} else {
  // Show user-friendly error
  notification.showNotification('error', result.error);
}
```

### 3. Use WebSocket for Real-Time Updates

```tsx
// Subscribe to events in components
useAdapterEvent('collectionsChanged', () => {
  refetchCollections();
});
```

### 4. Test Adapter Integration

```tsx
// Mock the web adapter for testing
import { createMockAdapter } from '@wave-client/core/test';

const mockAdapter = createMockAdapter();
render(
  <AdapterProvider adapter={mockAdapter}>
    <App />
  </AdapterProvider>
);
```

## Troubleshooting

### Server Not Running

**Symptom**: Red banner at bottom: "Server disconnected"

**Solution**:
```bash
# Start the server
pnpm dev:server
```

### CORS Errors

**Symptom**: Browser console shows CORS policy errors

**Solution**: Ensure server has CORS enabled (it does by default). Check `@wave-client/server` configuration.

### WebSocket Connection Failed

**Symptom**: "WebSocket connection failed" in console

**Solution**: 
1. Verify server is running
2. Check firewall settings
3. Ensure WebSocket endpoint is accessible: `ws://127.0.0.1:3456/ws`

### Build Errors

**Symptom**: Vite build fails with module errors

**Solution**:
```bash
# Clean and rebuild
rm -rf dist node_modules
pnpm install
pnpm build
```

## Dependencies

- **@wave-client/core**: Platform-agnostic UI components and types
- **react**: UI framework
- **react-dom**: React rendering
- **axios**: HTTP client for server communication

### Dev Dependencies

- **vite**: Build tool and dev server
- **@vitejs/plugin-react**: React support for Vite
- **vitest**: Test runner
- **@testing-library/react**: React testing utilities
- **tailwindcss**: CSS framework
- **typescript**: Type safety

## Contributing

When contributing to the web package:

1. **Use core components** - Don't duplicate UI, use `@wave-client/core`
2. **Keep adapter clean** - webAdapter should only handle I/O delegation
3. **Test server integration** - Ensure adapter works with server API
4. **Handle errors gracefully** - Use Result pattern consistently
5. **Update README** - Document new features or configuration changes
6. **Theme compatibility** - Ensure changes work in both light and dark modes
7. **Test in browser** - Verify behavior in Chrome, Firefox, Safari

## License

See [LICENSE](../../LICENSE) in the project root.
