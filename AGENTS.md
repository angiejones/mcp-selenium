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
├── src/
│   ├── index.js           ← CLI entry point: spawns server.js as child process
│   └── lib/
│       └── server.js      ← ⭐ ALL server logic lives here
└── test/
    ├── mcp-client.mjs     ← Reusable MCP client for tests (JSON-RPC over stdio)
    ├── server.test.mjs    ← Server init, tool registration, schemas
    ├── browser.test.mjs   ← start_browser, close_session, take_screenshot, multi-session
    ├── navigation.test.mjs ← navigate, all 6 locator strategies
    ├── interactions.test.mjs ← click, send_keys, get_element_text, hover, double_click, right_click, press_key, drag_and_drop, upload_file
    ├── bidi.test.mjs      ← BiDi enablement, console/error/network capture, session isolation
    └── fixtures/           ← HTML files loaded via file:// URLs
        ├── locators.html
        ├── interactions.html
        ├── mouse-actions.html
        ├── drag-drop.html
        ├── upload.html
        └── bidi.html
```

### Key Files in Detail

| File | Purpose | When to Edit |
|------|---------|--------------|
| `src/lib/server.js` | MCP server: tool definitions, resource definitions, Selenium driver management, cleanup handlers | Adding/modifying tools, fixing MCP compliance, changing browser behavior |
| `src/index.js` | Thin CLI wrapper that spawns `server.js` as a child process with signal forwarding | Only if changing how the process is launched |
| `test/mcp-client.mjs` | Reusable MCP client that spawns the server, handles handshake, provides `callTool()` / `listTools()` / `fixture()` helpers | When changing test infrastructure |
| `test/fixtures/` | Purpose-built HTML files for tests, one per test category | When a test needs elements not in existing fixtures |
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
    currentSession: null,  // string | null — the active session ID
    bidi: new Map()        // sessionId → { available, consoleLogs, pageErrors, networkLogs }
};
```

- **Session IDs** are formatted as `{browser}_{Date.now()}` (e.g., `chrome_1708531200000`)
- Only one session is "current" at a time (set by `start_browser`, cleared by `close_session`)
- Multiple sessions can exist in the `drivers` Map, but tools always operate on `currentSession`
- **BiDi state** is a single Map of per-session objects — cleanup is one `state.bidi.delete(sessionId)` call

### Helper Functions

| Function | Purpose |
|----------|---------|
| `getDriver()` | Returns the WebDriver for `state.currentSession`. Throws if no active session. |
| `getLocator(by, value)` | Converts a locator strategy string (`"id"`, `"css"`, `"xpath"`, `"name"`, `"tag"`, `"class"`) to a Selenium `By` object. |
| `newBidiState()` | Returns a fresh `{ available, consoleLogs, pageErrors, networkLogs }` object for a new session. |
| `setupBidi(driver, sessionId)` | Wires up BiDi event listeners (console, JS errors, network) for a session. Called from `start_browser`. |
| `registerBidiTool(name, description, logKey, emptyMessage, unavailableMessage)` | Factory that registers a diagnostic tool. All three BiDi tools (`get_console_logs`, `get_page_errors`, `get_network_logs`) use this — don't copy-paste a new handler, call this instead. |

### Diagnostics (WebDriver BiDi)

The server automatically enables [WebDriver BiDi](https://w3c.github.io/webdriver-bidi/) when starting a browser session. BiDi provides real-time, passive capture of browser diagnostics — console messages, JavaScript errors, and network activity are collected in the background without any extra configuration.

This is especially useful for AI agents: when something goes wrong on a page, the agent can check `get_console_logs` and `get_page_errors` to understand *why*, rather than relying solely on screenshots.

- **Automatic**: BiDi is enabled by default when the browser supports it
- **Graceful fallback**: If the browser or driver doesn't support BiDi, the session starts normally and the diagnostic tools return a helpful message
- **No performance impact**: Logs are passively captured via event listeners — no polling or extra requests
- **Per-session**: Each browser session has its own log buffers, cleaned up automatically on session close
- **BiDi modules are dynamically imported** at the top of `server.js` — if the selenium-webdriver version doesn't include them, `LogInspector` and `Network` are set to `null` and all BiDi code is skipped

### Cleanup

- `SIGTERM` and `SIGINT` handlers call `cleanup()`, which quits all drivers and exits
- `src/index.js` forwards these signals to the child process

---

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
3. **Error handling pattern** — Every tool handler wraps its logic in `try/catch` and returns error text in the `content` array with `isError: true`.
4. **No TypeScript** — The project is plain JavaScript with no build step.
5. **Single-file server** — All MCP logic is in `server.js`. There is no router, no middleware, no framework beyond the MCP SDK.
6. **MCP compliance** — Before modifying server behavior, read the [MCP spec](https://modelcontextprotocol.io/specification/2025-11-25). Don't violate it.

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
1. Add tests to the appropriate file in `test/` (see **Testing** below)
2. Run `npm test` and confirm all tests pass
3. Update `README.md` with the new tool's documentation

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

## Testing

> **Testing philosophy: Verify outcomes, not absence of errors.** Every test must
> assert that the action had the expected effect — not just that it didn't crash.
> If you click a button, check that the thing it was supposed to do actually happened.
> If you find an element, confirm it's the right one. If a test is failing, fix the
> code or the test setup — never weaken the assertion to get a green check. A passing
> test that proves nothing is worse than no test at all.

The project has a regression test suite using Node's built-in `node:test` runner — zero external test dependencies.

### Running Tests

```bash
npm test
```

Requires Chrome + chromedriver on PATH. Tests run headless.

### How It Works

Tests talk to the real MCP server over stdio using JSON-RPC 2.0. No mocking.

- **`test/mcp-client.mjs`** — Reusable client that spawns the server, handles the MCP handshake, and provides `callTool()` / `listTools()` helpers.
- **`test/fixtures/`** — HTML files loaded via `file://` URLs. Each test file uses its own fixture. Use the `fixture('name.html')` helper to resolve paths.

### Test Files

| File | Covers |
|------|--------|
| `server.test.mjs` | Server init, tool registration, schemas |
| `browser.test.mjs` | start_browser, close_session, take_screenshot, multi-session |
| `navigation.test.mjs` | navigate, all 6 locator strategies (id, css, xpath, name, tag, class) |
| `interactions.test.mjs` | click, send_keys, get_element_text, hover, double_click, right_click, press_key, drag_and_drop, upload_file |
| `bidi.test.mjs` | BiDi enablement, console log capture, page error capture, network log capture, session isolation |

### When Adding a New Tool

1. Add a fixture in `test/fixtures/` if the tool needs HTML elements not covered by existing fixtures
2. Add tests to the appropriate `test/*.test.mjs` file (or create a new one)
3. **Verify outcomes** — don't just check for "no error". Use `get_element_text` or other tools to confirm the action had the expected effect on the DOM
4. Run `npm test` and confirm all tests pass

---

## Common Pitfalls

| Pitfall | Details |
|---------|---------|
| **"No active browser session"** | Most tools require `start_browser` to be called first. `getDriver()` throws if `state.currentSession` is null. |
| **WebDriver not on PATH** | Selenium requires the browser's driver binary (chromedriver, geckodriver, etc.) to be installed and on PATH. |
| **stdout pollution** | The server uses stdio transport. Any `console.log()` will corrupt the JSON-RPC stream. Use `console.error()` for debug output. |
| **`send_keys` clears first** | The `send_keys` tool calls `element.clear()` before typing. This is intentional but may surprise users expecting append behavior. |
| **No session switching** | Multiple sessions can exist in `state.drivers`, but there's no tool to switch `currentSession` between them. |
| **Headless flag differs by browser** | Chrome/Edge use `--headless=new`, Firefox uses `--headless`. This is handled correctly in the code. |
