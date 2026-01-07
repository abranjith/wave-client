# Wave Client

**Wave Client** is a modern, intuitive, and platform-agnostic REST API client designed to streamline your API development workflow. Built with React and Tailwind CSS, it offers a beautiful, consistent interface whether you're working inside **Visual Studio Code** or in a **web browser**.

## 🚀 Key Features

*   **Modern Interface**: A clean, minimalist UI that feels native to your environment, with automatic Light/Dark theme synchronization.
*   **Run Everywhere**: 
    *   **VS Code Extension**: Integrated workflow right next to your code.
    *   **Web Application**: Standalone browser-based client for flexibility.
*   **Smart Request Building**: 
    *   Support for all major HTTP methods (GET, POST, PUT, DELETE, etc.).
    *   Visual editors for Headers, Query Parameters, and Request Bodies (JSON, Form Data, Text).
    *   Dynamic URL parsing and validation.
*   **Collection Management**:
    *   **Postman Compatibility**: Full support for importing and using Postman Collections (v2.1.0).
    *   **Organization**: Hierarchical structure with nested folders for complex API suites.
    *   **One-Click Loading**: Instantly load and execute requests.
*   **Environment Variables**: Robust management of variables for different deployment stages (Dev, Staging, Production).
*   **Advanced Networking**: 
    *   Support for HTTP/HTTPS/SOCKS Proxies.
    *   Client Certificate (mTLS) support.
    *   Request cancellation and timeout controls.
*   **Security & Privacy**: 
    *   Local encryption for sensitive data.
    *   Secure storage of secrets and tokens.

## 💻 Two Ways to Use

### 1. VS Code Extension
The extension delivers the full Wave Client experience directly in VS Code. It leverages native editor capabilities for file system access, secret storage, and theme integration.
*   **Command**: `Wave Client: Open Wave Client`
*   **Shortcut**: `Ctrl+Shift+W` / `Cmd+Shift+W`

### 2. Standalone Web App
A full-featured web application that runs in your browser. It connects to a local server to provide features usually impossible in a browser, like unrestricted HTTP requests (avoiding CORS), local file system access, and advanced encryption.

## 🏗️ Architecture

Wave Client is built as a **monorepo** designed for maximum code reuse. It uses the **Adapter Pattern** to share 100% of the UI logic across platforms while delegating system operations to platform-specific adapters.

*   **[`packages/core`](packages/core/README.md)**: The platform-agnostic heart of the application. Contains all UI components and business logic.
*   **[`packages/vscode`](packages/vscode/README.md)**: Bridges the core UI with VS Code's Extension API.
*   **[`packages/web`](packages/web/README.md)**: Bridges the core UI with browser APIs and a local backend server.
*   **[`packages/server`](packages/server/README.md)**: A lightweight Node.js server that powers the web version with secure I/O capabilities.

## 🛠️ Development

### Prerequisites
*   Node.js (v18+)
*   pnpm

### Quick Start

1.  **Install Dependencies**
    ```bash
    pnpm install
    ```

2.  **Run VS Code Extension**
    ```bash
    # Build and watch all packages
    pnpm watch
    # Open "Run and Debug" in VS Code and select "Extension"
    ```

3.  **Run Web Client**
    ```bash
    # Starts the web frontend and local server
    cd packages/web
    pnpm run dev
    ```

## 📄 License

TBD