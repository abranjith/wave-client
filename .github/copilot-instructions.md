## Project Overview: "Wave Client" - A VS Code REST Client Extension

**Goal:** Create a Visual Studio Code extension that functions as a modern, intuitive web client for making HTTP requests, directly within the editor. The initial version (MVP) will focus on basic REST calls. This extension, codenamed "Wave Client," will be built using React and Tailwind CSS for the webview UI.

**Core Problem Solved:** Provides a lightweight, integrated alternative to standalone tools like Postman, improving developer workflow by keeping API testing inside the IDE.

**Key Differentiator:** A clean, minimalist UI that feels native to VS Code, with a focus on speed and ease of use.

## Tech Stack & Project Scaffolding

1.  **Initialize Project:** Create a new Visual Studio Code extension project using the official `yo code` generator.
2.  **Language:** Use **TypeScript** for both the extension's backend (the part that runs in VS Code's Node.js environment) and the frontend.
3.  **Frontend Framework:** Set up a **React** application to render inside a VS Code webview panel.
4.  **Styling:** Integrate **Tailwind CSS** into the React application for utility-first styling. Use the `@apply` directive for reusable component classes where necessary. Common components for the UI include buttons, input fields, and card layouts.
    Use react component libraries such as Origin UI https://originui.com/ or https://github.com/origin-space/originui
5.  **State Management:** Use React's built-in state management hooks (`useState`, `useReducer`, `useContext`) for the initial version.


## Key Instructions

1.  **Component Structure:** Organize components into a clear folder structure (e.g., `src/components`, `src/hooks`, `src/utils`).
2.  **Code Quality:** Follow best practices for code quality, including:
    - Use TypeScript for type safety.
    - Use ESLint and Prettier for consistent code formatting.
3.  **Error Handling:** Implement robust error handling for API calls, including user-friendly error messages.
4. Do not create/ update tests in the initial version, we can update this later.
5. Do not create/ update documentation in the initial version, we can update this later.
6. Follow existing code patterns, styling, conventions throughout the project.