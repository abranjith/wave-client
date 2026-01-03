# Wave Client Development Startup Script

This script coordinates the startup of both the backend server and the web UI, ensuring the backend is healthy before starting the frontend.

## Quick Start

From the `packages/web` directory:

```bash
# Start with default ports (Server: 3456, UI: 5173)
pnpm start

# Or with custom ports
pnpm start --server-port 3000 --ui-port 5173
```

## Environment Variables

You can override ports using environment variables:

```bash
# Using pnpm
SERVER_PORT=3000 UI_PORT=5173 pnpm start

# Or directly with node
SERVER_PORT=3000 UI_PORT=5173 node scripts/start-dev.js
```

## Command Line Arguments

```bash
node scripts/start-dev.js [options]

Options:
  --server-port <port>    Backend server port (default: 3456)
  --ui-port <port>        Web UI port (default: 5173)
```

## Examples

```bash
# Default ports
pnpm start

# Custom server port only
pnpm start --server-port 3000

# Custom UI port only  
pnpm start --ui-port 8080

# Both custom
pnpm start --server-port 3000 --ui-port 5173

# Using environment variables (overrides defaults but not CLI args)
SERVER_PORT=3000 pnpm start

# Override env with CLI argument
SERVER_PORT=3000 pnpm start --server-port 4000  # Uses 4000
```

## How It Works

1. **Starts Backend**: Spawns `pnpm dev` in `packages/server` with the specified port
2. **Health Check**: Polls the backend's `/health` endpoint (max 30 attempts, 1 second intervals)
3. **Starts UI**: Once backend is healthy, spawns `pnpm dev` in `packages/web` with the specified port
4. **Status Display**: Shows URLs for both services once started

## Graceful Shutdown

Press `Ctrl+C` to cleanly shutdown both services.

## Troubleshooting

- **Backend won't start**: Check if the port is already in use
- **Health check fails**: Ensure the backend has a `/health` endpoint
- **UI won't start**: Check if the UI port is already in use

## Port Defaults

- **Backend Server**: `3456`
- **Web UI**: `5173`
