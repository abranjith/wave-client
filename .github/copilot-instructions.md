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


## MVP Features & UI Component Breakdown

The main application component (`App.tsx`) will use a CSS Grid or Flexbox to create the three-panel layout. A very high level UI design is available in #layout.png file
* **Column 1:** The `ConfigPanel` (fixed width, e.g., `250px`).
* **Column 2:** A container that fills the remaining width, which itself is split into two rows:
    * **Row 1:** The `RequestPanel`.
    * **Row 2:** The `ResponsePanel`.

---

### A. Configuration Panel (`ConfigPanel.tsx`) - Left Panel

**Objective:** A sidebar for managing collections, history, and environments.

**Component Requirements:**

1.  **Vertical Tab Navigation:**
    * Implement a vertical navigation bar on the far left.
    * Use icons from `lucide-react` for the tabs:
        * **Collections:** `Folder` icon.
        * **History:** `History` icon.
        * **Environments:** `Variable` icon.
    * The active tab should have a distinct visual indicator (e.g., a different background color and a left border).
2.  **Tab Content:**
    * Create a view area next to the vertical tabs.
    * For the MVP, each tab's content can be a placeholder `<div>` with a title (e.g., "Collections", "History").

---

### B. Request Panel (`RequestPanel.tsx`) - Top-Right Panel

**Objective:** The primary workspace for building and sending an HTTP request.

**Component Requirements:**

1.  **Protocol & URL Bar:**
    * A single row containing:
        * A dropdown for the **Protocol**. Default to `HTTP`. (This is a placeholder for future protocols).
        * A dropdown for the **HTTP Method** (GET, POST, PUT, DELETE, etc.).
        * A main input field for the request **URL**.
        * A prominent "Send" button.
2.  **Horizontal Tabbed Interface:**
    * Below the URL bar, create a set of horizontal tabs:
        * **Params:** A key-value editor for URL query parameters. Each row should have fields for Key, Value, and a checkbox to enable/disable.
        * **Headers:** A key-value editor for request headers, identical in function to the Params editor.
        * **Body:** A sub-tabbed view for different body types. Start with a `JSON` option containing a code editor field.

---

### C. Response Panel (`ResponsePanel.tsx`) - Bottom-Right Panel

**Objective:** A read-only area to display the server's response.

**Component Requirements:**

1.  **Response Metadata:**
    * Display a clean, read-only summary at the top of this panel:
        * **Status Code:** e.g., `200 OK` (color-coded: green for 2xx, yellow for 4xx, red for 5xx).
        * **Response Time:** e.g., `128 ms`.
        * **Response Size:** e.g., `2.1 KB`.
2.  **Horizontal Tabbed Interface:**
    * Implement horizontal tabs for viewing different parts of the response:
        * **Body:** Display the response payload. It must have syntax highlighting, especially for JSON.
        * **Headers:** Display the response headers in a simple, readable key-value format.

---

### D. Extension Logic (`extension.ts`)

**Objective:** The backend logic that powers the webview and handles API calls.

**Logic Requirements:**

1.  **Command Registration:** Register a `waveclient.open` command that creates and reveals a new WaveClient webview panel.
2.  **State Persistence:** Ensure the webview's state is preserved when the panel is hidden and restored when it becomes visible again by setting `retainContextWhenHidden: true`.
3.  **Communication Bridge:**
    * **From React to VS Code:** When the "Send" button is clicked, the React app must post a message to the extension backend containing the full request object (method, URL, params, headers, body).
    * **From VS Code to React:** The extension backend will receive the message, execute the HTTP request using `fetch` or a similar library, and post the entire response object (status, time, size, headers, body) back to the React webview.