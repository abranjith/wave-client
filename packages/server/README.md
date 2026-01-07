# @wave-client/server

A lightweight Fastify-based server that powers the standalone web version of Wave Client by handling all I/O operations.

## Purpose

The Wave Client Server acts as a **backend service** for the `@wave-client/web` package, providing secure file system access, HTTP request execution with proxy/certificate support, and encryption capabilities that cannot be safely implemented in a browser environment.

**Why a separate server?**
- Browsers have limited access to file systems (security sandboxing)
- Complex HTTP operations (custom proxies, client certificates, advanced TLS) require Node.js
- Encryption key storage needs OS-level security features
- WebSocket support for real-time state synchronization

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               @wave-client/web (Browser)                    │
│                                                             │
│  ┌──────────────────┐         ┌──────────────────────────┐ │
│  │  React UI        │────────▶│    webAdapter            │ │
│  │  Components      │         │  (HTTP + WebSocket)      │ │
│  └──────────────────┘         └────────────┬─────────────┘ │
└───────────────────────────────────────────┼─────────────────┘
                                            │
                                            │ REST API/
                                            │ WebSocket
                                            │
┌───────────────────────────────────────────▼─────────────────┐
│              @wave-client/server (Node.js)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌──────────────────────────┐ │
│  │  Fastify Server  │────────▶│   Route Handlers         │ │
│  │  • REST API      │         │   • /collections         │ │
│  │  • WebSocket     │         │   • /environments        │ │
│  │  • CORS          │         │   • /http                │ │
│  └────────┬─────────┘         │   • /security            │ │
│           │                   │   • /settings            │ │
│           │                   └──────────┬───────────────┘ │
│           │                              │                 │
│           │                   ┌──────────▼───────────────┐ │
│           │                   │  Service Layer           │ │
│           │                   │  • Settings Service      │ │
│           │                   │  • Security Service      │ │
│           │                   │  • WebSocket Manager     │ │
│           │                   └──────────┬───────────────┘ │
│           │                              │                 │
│           └──────────────────────────────┘                 │
│                                          │                 │
│                           ┌──────────────▼──────────────┐  │
│                           │  File System & Node.js APIs │  │
│                           │  • fs (collections, history) │  │
│                           │  • axios (HTTP with proxies) │  │
│                           │  • crypto (encryption)       │  │
│                           │  • https (TLS/certs)         │  │
│                           └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Package Structure

```
packages/server/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── routes/               # REST API route handlers
│   │   ├── collections.ts    # Collection CRUD operations
│   │   ├── environments.ts   # Environment management
│   │   ├── history.ts        # Request history
│   │   ├── http.ts           # HTTP request execution
│   │   ├── cookies.ts        # Cookie store operations
│   │   ├── security.ts       # Encryption/decryption
│   │   ├── settings.ts       # App settings
│   │   ├── store.ts          # Generic key-value storage
│   │   └── websocket.ts      # WebSocket connections
│   └── services/             # Business logic layer
│       ├── init.ts           # Service initialization
│       └── websocket.ts      # WebSocket state manager
├── tsconfig.json
└── package.json
```

## Design

### RESTful API Design

The server exposes a REST API with clear resource-based endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Server health check |
| `/collections` | GET | List all collections |
| `/collections/:id` | GET/POST/DELETE | Collection CRUD |
| `/environments` | GET/POST | Environment management |
| `/history` | GET/POST/DELETE | Request history |
| `/http/execute` | POST | Execute HTTP request |
| `/cookies` | GET/POST/DELETE | Cookie store |
| `/security/*` | Various | Encryption operations |
| `/settings` | GET/POST | App settings |
| `/ws` | WebSocket | Real-time sync |

### WebSocket Integration

WebSockets provide **real-time state synchronization** between server and web clients:

- **Broadcasts** state changes (collections updated, encryption status changed)
- **Bidirectional** communication for long-running operations
- **Multiple clients** can stay in sync automatically
- **Event-driven** architecture complements REST API

### Service Layer Pattern

The server uses a **service layer** to separate concerns:

```
Routes (HTTP) → Services (Business Logic) → File System / Node APIs
```

This allows:
- Clean separation of HTTP handling and business logic
- Reusable services across multiple routes
- Easier testing and mocking
- Centralized state management

## Key Features

### 🔒 Secure File Operations

- **File system access**: Read/write collections, environments, history to disk
- **File dialogs**: Simulated save/open dialogs for import/export
- **Binary file support**: Handle certificates, images, and other binary data
- **Path normalization**: Cross-platform path handling

### 🌐 Advanced HTTP Execution

- **Proxy support**: HTTP/HTTPS/SOCKS proxies
- **Client certificates**: mTLS authentication
- **Custom CA certificates**: Trust custom certificate authorities
- **Cookie jar**: Automatic cookie handling
- **Request cancellation**: Cancel in-flight requests via WebSocket

Uses **axios** with Node.js `https` agent for full HTTP feature support beyond browser capabilities.

### 🔐 Encryption & Security

- **AES-256-GCM encryption**: Secure storage of sensitive data
- **Password-based key derivation**: PBKDF2 for key generation
- **Recovery keys**: Backup encryption keys to files
- **Node.js crypto module**: OS-level cryptographic primitives

### 📡 Real-Time Sync

- **WebSocket connections**: Bidirectional communication
- **State broadcasting**: Notify clients of data changes
- **Multi-client support**: Sync state across browser tabs/windows
- **Connection health monitoring**: Automatic reconnection

### ⚙️ Configurable Settings

- **Port/host configuration**: Customizable server address (planned)
- **CORS support**: Allow web app to connect from different origins
- **Request timeout**: Configurable timeout for HTTP operations
- **Logging**: Fastify built-in logger for debugging

## Tech Stack

- **Framework**: [Fastify](https://fastify.dev/) - Fast and low-overhead web framework
- **WebSocket**: `@fastify/websocket` - WebSocket plugin for Fastify
- **CORS**: `@fastify/cors` - Cross-Origin Resource Sharing support
- **HTTP Client**: `axios` - Promise-based HTTP client with advanced features
- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Shared Types**: `@wave-client/shared` - Common types and utilities

## Developer Guide

### Prerequisites

- Node.js 18+
- pnpm (recommended)

### Installation

```bash
# From workspace root
pnpm install
```

### Development

#### Start Server in Watch Mode

```bash
# From workspace root
pnpm dev:server

# Or from packages/server
pnpm dev
```

This runs the server with **hot reload** - automatically restarts when source files change.

Server starts at: **http://127.0.0.1:3456**

#### Build for Production

```bash
# From workspace root
pnpm build

# Or from packages/server
pnpm build
```

Compiles TypeScript to JavaScript in `dist/` directory.

#### Run Production Build

```bash
# From packages/server
pnpm start

# Or run directly
node dist/index.js
```

### Configuration

**Default Configuration:**
- **Port**: 3456
- **Host**: 127.0.0.1 (localhost only)
- **CORS**: Enabled for all origins (development)

To customize, edit [`src/index.ts`](./src/index.ts):

```typescript
const PORT = 3456;
const HOST = '127.0.0.1';
```

### Project Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start server with hot reload (recommended) |
| `pnpm build` | Compile TypeScript to JavaScript |
| `pnpm start` | Run production build |
| `pnpm watch` | Watch and rebuild TypeScript |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm clean` | Remove build artifacts |

### Testing the Server

#### Health Check

```bash
curl http://127.0.0.1:3456/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-06T12:34:56.789Z"
}
```

#### Test API Endpoints

```bash
# List collections
curl http://127.0.0.1:3456/collections

# Get settings
curl http://127.0.0.1:3456/settings
```

#### WebSocket Connection

```javascript
const ws = new WebSocket('ws://127.0.0.1:3456/ws');

ws.onopen = () => {
  console.log('Connected to Wave Client Server');
};

ws.onmessage = (event) => {
  console.log('Message:', event.data);
};
```

## API Reference

### REST Endpoints

#### Health Check
```http
GET /health
```
Returns server status and timestamp.

#### Collections
```http
GET    /collections          # List all collections
POST   /collections          # Create/update collection
DELETE /collections/:id      # Delete collection
```

#### Environments
```http
GET    /environments         # List all environments
POST   /environments         # Save environment
DELETE /environments/:id     # Delete environment
```

#### HTTP Execution
```http
POST   /http/execute         # Execute HTTP request
```

Request body: `HttpRequestConfig` (from `@wave-client/core`)

#### History
```http
GET    /history              # Get request history
POST   /history              # Save request to history
DELETE /history              # Clear history
```

#### Security
```http
GET    /security/status                # Get encryption status
POST   /security/enable                # Enable encryption
POST   /security/disable               # Disable encryption
POST   /security/change-password       # Change password
POST   /security/export-recovery-key   # Export recovery key
POST   /security/recover               # Recover with key
```

### WebSocket Protocol

Connect to: `ws://127.0.0.1:3456/ws`

**Message Format:**
```typescript
interface WebSocketMessage {
  type: 'collectionsChanged' | 'environmentsChanged' | 'encryptionStatus' | ...;
  payload?: any;
}
```

**Events Broadcast:**
- `collectionsChanged` - Collection data modified
- `environmentsChanged` - Environment data modified
- `historyChanged` - History updated
- `encryptionStatus` - Encryption state changed
- `settingsChanged` - Settings updated

## Deployment Considerations

### Local Development
- Server runs on localhost (127.0.0.1) only
- Web app connects from `http://localhost:5173` (Vite dev server)
- CORS allows all origins for convenience

### Production Deployment (Future)
- Configure environment variables for PORT, HOST
- Restrict CORS to specific origins
- Add authentication/authorization
- Use HTTPS with valid certificates
- Consider reverse proxy (nginx, Caddy)
- Implement rate limiting
- Add request logging and monitoring

## Security Notes

⚠️ **Current Security Posture** (Development)

- **No authentication**: Anyone with network access can use the API
- **Localhost binding**: Only accessible from local machine
- **CORS wide open**: Allows all origins
- **Plaintext HTTP**: No TLS encryption (data visible on network)

✅ **Security Features**

- **Encryption at rest**: Sensitive data encrypted with AES-256-GCM
- **Password-based keys**: PBKDF2 key derivation
- **Secure randomness**: Uses Node.js `crypto.randomBytes`
- **File permissions**: Respects OS file system permissions

> **Note**: The server is intended for **local development use**. Production deployment requires authentication, HTTPS, and proper security hardening.

## Integration with Web Package

The `@wave-client/web` package consumes this server via the **webAdapter**:

```typescript
// packages/web/src/adapters/webAdapter.ts
const api = axios.create({
  baseURL: 'http://127.0.0.1:3456',
});

// Storage adapter example
const storageAdapter: IStorageAdapter = {
  async loadCollections() {
    try {
      const response = await api.get('/collections');
      return ok(response.data);
    } catch (error) {
      return err(error.message);
    }
  },
};
```

The server provides all the **I/O operations** that the web adapter needs, allowing the web app to have the same capabilities as the VS Code extension.

## Dependencies

- **fastify**: Web framework
- **@fastify/cors**: CORS middleware
- **@fastify/websocket**: WebSocket support
- **axios**: HTTP client for request execution
- **@wave-client/shared**: Shared types and utilities

## Contributing

When contributing to the server:

1. **Add route handlers** in `src/routes/` for new API endpoints
2. **Use service layer** for business logic (create in `src/services/`)
3. **Follow REST conventions** - use appropriate HTTP methods and status codes
4. **Validate input** - ensure request data is valid before processing
5. **Handle errors** - return appropriate HTTP error codes and messages
6. **Update API docs** - document new endpoints in this README
7. **Broadcast changes** - emit WebSocket events when state changes

## License

See [LICENSE](../../LICENSE) in the project root.
