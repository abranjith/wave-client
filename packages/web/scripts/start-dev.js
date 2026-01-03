#!/usr/bin/env node
/**
 * Wave Client Development Startup Script
 * 
 * Starts both the backend server and web UI with coordinated startup.
 * Ensures the backend is healthy before starting the UI.
 * 
 * Usage:
 *   node start-dev.js
 *   node start-dev.js --server-port 3000 --ui-port 5173
 *   PORT=3000 UI_PORT=5173 node start-dev.js
 * 
 * Environment Variables:
 *   SERVER_PORT - Backend server port (default: 3456)
 *   UI_PORT - Web UI port (default: 5173)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout as sleep } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments and environment variables
function getConfig() {
  const config = {
    serverPort: process.env.SERVER_PORT || 3456,
    uiPort: process.env.UI_PORT || 5173,
  };

  // Parse command line arguments (they override env vars)
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--server-port' && i + 1 < process.argv.length) {
      config.serverPort = process.argv[++i];
    } else if (process.argv[i] === '--ui-port' && i + 1 < process.argv.length) {
      config.uiPort = process.argv[++i];
    }
  }

  return config;
}

// Check if a port is responding with a health check
async function isServerHealthy(port, maxAttempts = 30, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        method: 'GET',
        timeout: 2000,
      });

      if (response.ok) {
        console.log(
          `✓ Backend server is healthy on port ${port} (attempt ${attempt}/${maxAttempts})`
        );
        return true;
      }
    } catch (error) {
      // Server not ready yet
      if (attempt === maxAttempts) {
        console.error(
          `✗ Backend server failed to become healthy after ${maxAttempts} attempts`
        );
        console.error(`  Last error: ${error.message}`);
        return false;
      }

      if (attempt % 5 === 0) {
        console.log(
          `⏳ Waiting for backend server... (attempt ${attempt}/${maxAttempts})`
        );
      }
    }

    // Wait before next attempt
    await sleep(delayMs);
  }

  return false;
}

// Spawn a process and return it
function spawnProcess(command, args, options = {}) {
  console.log(`📦 Starting: ${command} ${args.join(' ')}`);
  const proc = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  return proc;
}

// Main startup function
async function main() {
  const config = getConfig();

  console.log('\n🌊 Wave Client Development Startup\n');
  console.log(`Configuration:`);
  console.log(`  Server Port: ${config.serverPort}`);
  console.log(`  UI Port:     ${config.uiPort}\n`);

  const processes = [];

  try {
    // Start the backend server
    console.log('1️⃣  Starting backend server...');
    const serverProcess = spawnProcess('pnpm', ['dev'], {
      cwd: join(__dirname, '../../../server'),
      env: {
        ...process.env,
        PORT: config.serverPort,
      },
    });

    processes.push({
      name: 'Backend Server',
      process: serverProcess,
    });

    // Wait for backend to be healthy
    console.log(`\n2️⃣  Checking backend health (port ${config.serverPort})...`);
    const isHealthy = await isServerHealthy(config.serverPort);

    if (!isHealthy) {
      console.error('\n❌ Failed to start backend server. Exiting...\n');
      process.exit(1);
    }

    // Start the web UI
    console.log(`\n3️⃣  Starting web UI on port ${config.uiPort}...\n`);
    const uiProcess = spawnProcess('pnpm', ['dev', '--', '--port', config.uiPort], {
      cwd: join(__dirname, '..'),
    });

    processes.push({
      name: 'Web UI',
      process: uiProcess,
    });

    console.log('\n✅ Both services started successfully!\n');
    console.log(`Backend: http://127.0.0.1:${config.serverPort}`);
    console.log(`Web UI:  http://localhost:${config.uiPort}\n`);

    // Handle process termination
    const handleShutdown = () => {
      console.log('\n\n🛑 Shutting down services...');
      processes.forEach(({ name, process: proc }) => {
        console.log(`  Stopping ${name}...`);
        proc.kill();
      });
      process.exit(0);
    };

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Wait for any process to exit
    await new Promise((resolve) => {
      processes.forEach(({ process: proc }) => {
        proc.on('exit', (code) => {
          console.error(`\n❌ A service exited with code ${code}`);
          resolve();
        });
      });
    });

    handleShutdown();
  } catch (error) {
    console.error('❌ Error starting services:', error);
    processes.forEach(({ process: proc }) => proc.kill());
    process.exit(1);
  }
}

main();
