# AGENTS.md — AI Agent Guide for mcp-selenium

> This file helps AI agents (and humans) quickly understand, navigate, and safely
> contribute to this project. 

## Project Overview

**mcp-selenium** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io)
server that exposes browser automation capabilities via
[Selenium WebDriver](https://www.selenium.dev/documentation/webdriver/). It allows
LLM-powered applications (Goose, Claude Code, Cursor, etc.) to launch browsers, navigate
pages, interact with elements, take screenshots, and more - all through the standardized
MCP tool interface.

- **Language:** JavaScript (ES Modules)
- **Runtime:** Node.js
- **Transport:** stdio (JSON-RPC 2.0 over stdin/stdout)
- **MCP SDK:** `@modelcontextprotocol/sdk` ^1.7.0

---

## File Map

```
mcp-selenium/
├── AGENTS.md              ← You are here
├── README.md              ← User-facing docs: installation, usage, tool reference
├── package.json           ← Dependencies, scripts, npm metadata
├── smithery.yaml          ← Smithery deployment config (stdio start command)
└── src/
    ├── index.js           ← CLI entry point: spawns server.js as child process
    └── lib/
        └── server.js      ← ⭐ ALL server logic lives here
```

### Key Files in Detail

| File | Purpose | When to Edit |
|------|---------|--------------|
| `src/lib/server.js` | MCP server: tool definitions, resource definitions, Selenium driver management, cleanup handlers | Adding/modifying tools, fixing MCP compliance, changing browser behavior |
| `src/index.js` | Thin CLI wrapper that spawns `server.js` as a child process with signal forwarding | Only if changing how the process is launched |
| `package.json` | npm metadata, dependency versions, `"bin"` entry for `mcp-selenium` CLI | Bumping versions, adding dependencies |
| `smithery.yaml` | Declares how Smithery should start the server (`node src/lib/server.js`) | Only if changing the start command |
| `README.md` | User docs: installation, client config examples, tool reference table | When adding/removing/changing tools |

---

## Architecture

### Server Initialization (`server.js`)

```
McpServer (name: "MCP Selenium", version: "1.0.0")
    ↓
Registers tools via server.tool(name, description, zodSchema, handler)
    ↓
Registers resource via server.resource(name, ResourceTemplate, handler)
    ↓
Connects to StdioServerTransport
    ↓
Listens on stdin/stdout (JSON-RPC 2.0)
```

### State Management

All browser state is held in a module-level `state` object:

```js
const state = {
    drivers: new Map(),    // sessionId → WebDriver instance
    currentSession: null   // string | null — the active session ID
};
```

- **Session IDs** are formatted as `{browser}_{Date.now()}` (e.g., `chrome_1708531200000`)
- Only one session is "current" at a time (set by `start_browser`, cleared by `close_session`)
- Multiple sessions can exist in the `drivers` Map, but tools always operate on `currentSession`
- There is **no tool to switch between sessions** — this is a known limitation

### Helper Functions

| Function | Purpose |
|----------|---------|
| `getDriver()` | Returns the WebDriver for `state.currentSession`. Throws if no active session. |
| `getLocator(by, value)` | Converts a locator strategy string (`"id"`, `"css"`, `"xpath"`, `"name"`, `"tag"`, `"class"`) to a Selenium `By` object. |

### Cleanup

- `SIGTERM` and `SIGINT` handlers call `cleanup()`, which quits all drivers and exits
- `src/index.js` forwards these signals to the child process

---

## MCP Specification Compliance

> **Reference:** https://modelcontextprotocol.io/specification/2025-11-25
>
> The MCP spec uses RFC 2119 keywords (MUST, SHOULD, MAY). 


## Development Guide

### Prerequisites

- **Node.js** (check `package.json` for engine requirements)
- **A browser + matching WebDriver** on PATH:
  - Chrome → `chromedriver`
  - Firefox → `geckodriver`
  - Edge → `msedgedriver`

### Setup

```bash
npm install
```

### Running Locally

```bash
# Direct execution (for testing)
node src/lib/server.js

# Via the CLI entry point
node src/index.js

# Via npm (uses the "bin" field)
npx mcp-selenium
```

The server communicates over **stdin/stdout** — it will appear to hang because it's
waiting for JSON-RPC input. Use an MCP client (Goose, Claude Code, mcp-cli) to
interact with it.

### Project Conventions

1. **ES Modules** — The project uses `"type": "module"` in package.json. Use `import`/`export`, not `require`.
2. **Zod for schemas** — All tool input schemas are defined with Zod and automatically converted to JSON Schema by the MCP SDK.
3. **Error handling pattern** — Every tool handler wraps its logic in `try/catch` and returns error text in the `content` array. (See compliance issue #1 above — `isError: true` should be added.)
4. **No TypeScript** — The project is plain JavaScript with no build step.
5. **No tests** — There is currently no test suite. Consider adding integration tests with a headless browser.
6. **Single-file server** — All MCP logic is in `server.js`. There is no router, no middleware, no framework beyond the MCP SDK.

### Adding a New Tool

Follow this pattern in `server.js`:

```js
server.tool(
    "tool_name",                              // unique name (snake_case)
    "Human-readable description of the tool", // description
    {                                         // Zod input schema
        param: z.string().describe("What this param does"),
        optionalParam: z.number().optional().describe("Optional param")
    },
    async ({ param, optionalParam }) => {     // handler
        try {
            const driver = getDriver();       // get active browser session
            // ... do work with Selenium ...
            return {
                content: [{ type: 'text', text: 'Success message' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error: ${e.message}` }],
                isError: true  // ← Don't forget this!
            };
        }
    }
);
```

After adding a tool:
1. Update the tools table in this file
2. Update `README.md` with the new tool's documentation
3. Test with an actual MCP client

### Adding a New Resource

```js
server.resource(
    "resource-name",
    new ResourceTemplate("scheme://path"),
    async (uri) => ({
        contents: [{
            uri: uri.href,
            mimeType: "text/plain",  // ← Don't forget mimeType
            text: "Resource content"
        }]
    })
);
```

---

## Common Pitfalls

| Pitfall | Details |
|---------|---------|
| **"No active browser session"** | Most tools require `start_browser` to be called first. `getDriver()` throws if `state.currentSession` is null. |
| **WebDriver not on PATH** | Selenium requires the browser's driver binary (chromedriver, geckodriver, etc.) to be installed and on PATH. |
| **stdout pollution** | The server uses stdio transport. Any `console.log()` will corrupt the JSON-RPC stream. Use `console.error()` for debug output. |
| **`send_keys` clears first** | The `send_keys` tool calls `element.clear()` before typing. This is intentional but may surprise users expecting append behavior. |
| **No session switching** | Multiple sessions can exist in `state.drivers`, but there's no tool to switch `currentSession` between them. |
| **`tag` locator maps to CSS** | The `"tag"` locator strategy uses `By.css(value)`, not `By.tagName(value)`. This may produce unexpected results if the user passes a tag name expecting `By.tagName`. |
| **Headless flag differs by browser** | Chrome/Edge use `--headless=new`, Firefox uses `--headless`. This is handled correctly in the code. |

---

## MCP Spec Quick Reference

When modifying this server, keep these MCP rules in mind: https://modelcontextprotocol.io/specification/2025-11-25