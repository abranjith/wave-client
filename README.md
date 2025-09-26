# Wave Client

A modern, intuitive REST API client for VS Code built with React and Tailwind CSS. Wave Client brings powerful API testing capabilities directly into your development environment with beautiful UI components and seamless collection management.

## Features

### 🚀 **Modern Interface**
- Clean, intuitive UI built with React and Tailwind CSS
- Dark/Light theme support that follows VS Code's theme
- Responsive design optimized for VS Code's webview

### 📁 **Collection Management**
- **Automatic Collection Loading**: Loads collections from `~/.waveclient/collections`
- **Postman Compatibility**: Full support for Postman Collection v2.1.0 format
- **Hierarchical Organization**: Beautiful tree view with folders and subfolders
- **One-Click Loading**: Click any request to instantly load it into the request panel

### 🔧 **Request Building**
- **Multiple HTTP Methods**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Smart URL Handling**: Automatic parsing of URLs with query parameters
- **Headers Management**: Easy-to-use header editor
- **Request Body**: Support for JSON, form data, and raw text
- **Query Parameters**: Visual parameter editor with key-value pairs

### 📊 **Response Handling**
- **Formatted Responses**: Pretty-printed JSON responses
- **Response Metadata**: Status codes, response time, and size information
- **Error Handling**: Clear error messages and debugging information

## Quick Start

1. **Install the Extension**: Install Wave Client from the VS Code marketplace
2. **Open Wave Client**: Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) and run "Wave Client: Open Wave Client"
3. **Add Collections**: Place your Postman collection JSON files in `~/.waveclient/collections`
4. **Start Testing**: Click on any request in the collections pane to load it

## Collection Setup

Wave Client automatically loads collections from your home directory. Here's how to set up your collections:

### Directory Structure
```
~/.waveclient/collections/
├── My_API_Collection.json
├── Another_Collection.json
└── Team_Shared_APIs.json
```

### Sample Collection
```json
{
  "info": {
    "name": "My API Collection",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "User Management",
      "item": [
        {
          "name": "Get User",
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{token}}"
              }
            ],
            "url": {
              "raw": "https://api.example.com/users/{{userId}}",
              "protocol": "https",
              "host": ["api", "example", "com"],
              "path": ["users", "{{userId}}"]
            }
          }
        }
      ]
    }
  ]
}
```

## Components

### Collections Pane
- Displays all collections from the collections directory
- Shows folder structure with request counts
- Supports nested folders and requests
- Auto-expands collections for quick access

### Request Panel
- HTTP method selector
- URL input with validation
- Tabbed interface for params, headers, and body
- Auto-population from selected collection requests

### Response Panel
- Formatted response display
- Response metadata (status, time, size)
- Error handling and debugging information

## Requirements

- VS Code 1.103.0 or higher
- Node.js (for development)

## Extension Settings

This extension contributes the following settings:

* `wave-client.collectionsPath`: Custom path for collections directory (default: `~/.waveclient/collections`)

## Sample Collections

Wave Client comes with sample collections to get you started:

1. **Basic Sample**: Simple CRUD operations
2. **Comprehensive API**: Advanced examples with authentication, nested folders, and various HTTP methods

## Development

To contribute to Wave Client or run it in development mode:

```bash
# Clone the repository
git clone <repository-url>
cd wave-client

# Install dependencies
npm install

# Start development
npm run watch:webview

# Build for production
npm run build:webview
npm run compile
```

## Known Issues

- Large collections (>100 requests) may experience slight loading delays
- Postman environment variables are not yet supported (planned for future release)

## Release Notes

### 0.0.1

- Initial release
- Collections management with Postman format support
- Modern React + Tailwind CSS interface
- HTTP request/response handling
- Dark/Light theme support

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
