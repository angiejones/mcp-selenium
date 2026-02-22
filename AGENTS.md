# AGENTS.md

MCP server for Selenium WebDriver browser automation. JavaScript (ES Modules), Node.js, stdio transport (JSON-RPC 2.0).

## File Map

```
src/lib/server.js      ← ALL server logic: tool definitions, state, helpers, cleanup
src/index.js           ← Thin CLI wrapper, spawns server.js as child process
test/mcp-client.mjs    ← Reusable MCP test client (JSON-RPC over stdio)
test/*.test.mjs        ← Tests grouped by feature
test/fixtures/*.html   ← HTML files loaded via file:// URLs in tests
```

## Architecture

**Single-file server** — everything is in `server.js`. 18 tools, 1 resource.

State is a module-level object:
```js
const state = {
    drivers: new Map(),    // sessionId → WebDriver instance
    currentSession: null,  // active session ID
    bidi: new Map()        // sessionId → { available, consoleLogs, pageErrors, networkLogs }
};
```

Related operations are consolidated into single tools with `action` enum parameters (`interact`, `window`, `frame`, `alert`, `diagnostics`). This is intentional — it reduces context window token cost for LLM consumers.

BiDi (WebDriver BiDi) is auto-enabled on `start_browser` for passive capture of console logs, JS errors, and network activity. Modules are dynamically imported — if unavailable, BiDi is silently skipped.

## Conventions

- **ES Modules** — `import`/`export`, not `require`.
- **Zod schemas** — tool inputs defined with Zod, auto-converted to JSON Schema by MCP SDK.
- **Error pattern** — every handler: `try/catch`, return `{ content: [...], isError: true }` on failure.
- **No `console.log()`** — stdio transport. Use `console.error()` for debug output.
- **`send_keys` clears first** — calls `element.clear()` before typing. Intentional.
- **MCP compliance** — before modifying server behavior, read the [MCP spec](https://modelcontextprotocol.io/specification/2025-11-25). Don't violate it.

## Adding a Tool

Before adding, ask: can this be a parameter on an existing tool? Would an LLM realistically call it? Can `execute_script` already do it?

Pattern:
```js
server.tool("tool_name", "description", {
    param: z.string().describe("short phrase")
}, async ({ param }) => {
    try {
        const driver = getDriver();
        // ... selenium work ...
        return { content: [{ type: 'text', text: 'result' }] };
    } catch (e) {
        return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
    }
});
```

After adding: add tests, run `npm test`, update README.

## Testing

```bash
npm test
```

Requires Chrome + chromedriver on PATH. Tests run headless. Uses Node's built-in `node:test` runner — no external test dependencies.

Tests talk to the real MCP server over stdio. No mocking. Each test file uses **one McpClient** (one server process) for the whole file — do not spin up multiple clients per file.

**Verify outcomes, not absence of errors.** If you click a button, check that the thing it did actually happened. If a test is failing, fix the code — never weaken the assertion.

| File | Covers |
|------|--------|
| `server.test.mjs` | Tool registration, schemas |
| `browser.test.mjs` | start_browser, close_session, take_screenshot, multi-session |
| `navigation.test.mjs` | navigate, locator strategies (id, css, xpath, name, tag, class) |
| `interactions.test.mjs` | interact, send_keys, get_element_text, press_key, upload_file |
| `tools.test.mjs` | get_element_attribute, execute_script, window, frame, alert |
| `cookies.test.mjs` | add_cookie, get_cookies, delete_cookie |
| `bidi.test.mjs` | diagnostics (console/errors/network), session isolation |
