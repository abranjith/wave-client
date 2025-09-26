# Getting Started with Wave Client Collections

Welcome to Wave Client! This guide will help you set up and use collections effectively.

## Step 1: Create Collections Directory

Wave Client automatically creates the collections directory, but you can also create it manually:

**Windows:**
```powershell
mkdir "$env:USERPROFILE\.waveclient\collections"
```

**macOS/Linux:**
```bash
mkdir -p ~/.waveclient/collections
```

## Step 2: Add Your Collections

Copy your Postman collection JSON files to the collections directory. The filename will be used as the collection identifier.

### Sample Collection

Here's a simple collection to get you started. Save this as `getting-started.json` in your collections directory:

```json
{
  "info": {
    "name": "Getting Started",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "JSONPlaceholder Tests",
      "item": [
        {
          "name": "Get All Posts",
          "request": {
            "method": "GET",
            "url": "https://jsonplaceholder.typicode.com/posts"
          }
        },
        {
          "name": "Get Single Post",
          "request": {
            "method": "GET",
            "url": "https://jsonplaceholder.typicode.com/posts/1"
          }
        },
        {
          "name": "Create Post",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"title\": \"My New Post\",\n  \"body\": \"This is the content\",\n  \"userId\": 1\n}"
            },
            "url": "https://jsonplaceholder.typicode.com/posts"
          }
        }
      ]
    }
  ]
}
```

## Step 3: Open Wave Client

1. Open VS Code
2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
3. Type "Wave Client: Open Wave Client"
4. Press Enter

## Step 4: Use Your Collections

1. **Browse Collections**: Your collections will appear in the left panel
2. **Expand Folders**: Click the arrow icons to expand folders
3. **Select Requests**: Click on any request to load it into the request panel
4. **Send Requests**: Click the "Send" button to execute the request
5. **View Responses**: See the response in the bottom panel

## Tips for Organizing Collections

### 1. Use Descriptive Names
- ✅ Good: "User Authentication", "Product CRUD Operations"
- ❌ Poor: "Test1", "API Calls"

### 2. Group Related Requests
```json
{
  "name": "E-commerce API",
  "item": [
    {
      "name": "Authentication",
      "item": [
        {"name": "Login"},
        {"name": "Logout"},
        {"name": "Refresh Token"}
      ]
    },
    {
      "name": "Products",
      "item": [
        {"name": "List Products"},
        {"name": "Get Product Details"},
        {"name": "Create Product"}
      ]
    }
  ]
}
```

### 3. Use Variables for Dynamic Values
```json
{
  "url": "{{baseUrl}}/api/users/{{userId}}",
  "header": [
    {
      "key": "Authorization",
      "value": "Bearer {{accessToken}}"
    }
  ]
}
```

### 4. Include Common Headers
```json
{
  "header": [
    {
      "key": "Content-Type",
      "value": "application/json"
    },
    {
      "key": "Authorization",
      "value": "Bearer {{token}}"
    },
    {
      "key": "User-Agent",
      "value": "Wave Client"
    }
  ]
}
```

## Importing from Postman

If you have existing Postman collections:

1. **In Postman**: Click on your collection → Export → Collection v2.1
2. **Save the file** to `~/.waveclient/collections/`
3. **Refresh Wave Client** or restart VS Code
4. **Your collection** will appear in the collections pane

## Troubleshooting

### Collections Not Loading?
- Check that files are in the correct directory: `~/.waveclient/collections/`
- Ensure files have `.json` extension
- Verify JSON syntax is valid
- Check VS Code's Developer Tools for errors

### Requests Not Working?
- Verify the URL is correct and accessible
- Check headers are properly formatted
- Ensure request body is valid JSON (for POST/PUT requests)
- Check network connectivity

### Need Help?
- Check the [Documentation](../docs/collections-pane.md)
- Review sample collections in the `.github` folder
- Open an issue on GitHub

Happy API testing with Wave Client! 🌊
