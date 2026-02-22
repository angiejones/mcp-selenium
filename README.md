# MCP Selenium Server

A Model Context Protocol (MCP) server for Selenium WebDriver — browser automation for AI agents.

[![Watch the video](https://img.youtube.com/vi/mRV0N8hcgYA/sddefault.jpg)](https://youtu.be/mRV0N8hcgYA)

<a href="https://glama.ai/mcp/servers/@angiejones/mcp-selenium">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@angiejones/mcp-selenium/badge" alt="Selenium MCP server" />
</a>

## Setup

<details open>
<summary><strong>Goose (Desktop)</strong></summary>

Paste into your browser address bar:
```
goose://extension?cmd=npx&arg=-y&arg=%40angiejones%2Fmcp-selenium&id=selenium-mcp&name=Selenium%20MCP&description=automates%20browser%20interactions
```
</details>

<details>
<summary><strong>Goose (CLI)</strong></summary>

```bash
goose session --with-extension "npx -y @angiejones/mcp-selenium"
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add selenium -- npx -y @angiejones/mcp-selenium
```
</details>

<details>
<summary><strong>Cursor / Windsurf / other MCP clients</strong></summary>

```json
{
  "mcpServers": {
    "selenium": {
      "command": "npx",
      "args": ["-y", "@angiejones/mcp-selenium"]
    }
  }
}
```
</details>

## Example Usage

Tell the AI agent of your choice:

> Open Chrome, go to github.com/angiejones, and take a screenshot.

The agent will call Selenium's APIs to `start_browser`, `navigate`, and `take_screenshot`. No manual scripting or explicit directions needed.

## Supported Browsers

Chrome, Firefox, Edge, and Safari.

> **Safari note:** Requires macOS. Run `sudo safaridriver --enable` once and enable
> "Allow Remote Automation" in Safari → Settings → Developer. No headless mode.

---

<details>
<summary><strong>Tools</strong></summary>

### start_browser
Launches a browser session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| browser | string | Yes | `chrome`, `firefox`, `edge`, or `safari` |
| options | object | No | `{ headless: boolean, arguments: string[] }` |

### navigate
Navigates to a URL.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | Yes | URL to navigate to |

### interact
Performs a mouse action on an element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | `click`, `doubleclick`, `rightclick`, or `hover` |
| by | string | Yes | Locator strategy: `id`, `css`, `xpath`, `name`, `tag`, `class` |
| value | string | Yes | Value for the locator strategy |
| timeout | number | No | Max wait in ms (default: 10000) |

### send_keys
Types text into an element. Clears the field first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| by | string | Yes | Locator strategy |
| value | string | Yes | Locator value |
| text | string | Yes | Text to enter |
| timeout | number | No | Max wait in ms (default: 10000) |

### get_element_text
Gets the text content of an element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| by | string | Yes | Locator strategy |
| value | string | Yes | Locator value |
| timeout | number | No | Max wait in ms (default: 10000) |

### get_element_attribute
Gets an attribute value from an element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| by | string | Yes | Locator strategy |
| value | string | Yes | Locator value |
| attribute | string | Yes | Attribute name (e.g., `href`, `value`, `class`) |
| timeout | number | No | Max wait in ms (default: 10000) |

### press_key
Presses a keyboard key.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | Yes | Key to press (e.g., `Enter`, `Tab`, `a`) |

### upload_file
Uploads a file via a file input element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| by | string | Yes | Locator strategy |
| value | string | Yes | Locator value |
| filePath | string | Yes | Absolute path to the file |
| timeout | number | No | Max wait in ms (default: 10000) |

### take_screenshot
Captures a screenshot of the current page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| outputPath | string | No | Save path. If omitted, returns base64 image data. |

### close_session
Closes the current browser session. No parameters.

### execute_script
Executes JavaScript in the browser. Use for advanced interactions not covered by other tools (e.g., drag and drop, scrolling, reading computed styles, DOM manipulation).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| script | string | Yes | JavaScript code to execute |
| args | array | No | Arguments accessible via `arguments[0]`, etc. |

### window
Manages browser windows and tabs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | `list`, `switch`, `switch_latest`, or `close` |
| handle | string | No | Window handle (required for `switch`) |

### frame
Switches focus to a frame or back to the main page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | `switch` or `default` |
| by | string | No | Locator strategy (for `switch`) |
| value | string | No | Locator value (for `switch`) |
| index | number | No | Frame index, 0-based (for `switch`) |
| timeout | number | No | Max wait in ms (default: 10000) |

### alert
Handles browser alert, confirm, or prompt dialogs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | `accept`, `dismiss`, `get_text`, or `send_text` |
| text | string | No | Text to send (required for `send_text`) |
| timeout | number | No | Max wait in ms (default: 5000) |

### add_cookie
Adds a cookie. Browser must be on a page from the cookie's domain.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Cookie name |
| value | string | Yes | Cookie value |
| domain | string | No | Cookie domain |
| path | string | No | Cookie path |
| secure | boolean | No | Secure flag |
| httpOnly | boolean | No | HTTP-only flag |
| expiry | number | No | Unix timestamp |

### get_cookies
Gets cookies. Returns all or a specific one by name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | No | Cookie name. Omit for all cookies. |

### delete_cookie
Deletes cookies. Deletes all or a specific one by name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | No | Cookie name. Omit to delete all. |

### diagnostics
Gets browser diagnostics captured via WebDriver BiDi (auto-enabled when supported).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | Yes | `console`, `errors`, or `network` |
| clear | boolean | No | Clear buffer after returning (default: false) |

</details>

---

<details>
<summary><strong>Development</strong></summary>

### Setup

```bash
git clone https://github.com/angiejones/mcp-selenium.git
cd mcp-selenium
npm install
```

### Run Tests

```bash
npm test
```

Requires Chrome + chromedriver on PATH. Tests run headless.

### Install via Smithery

```bash
npx -y @smithery/cli install @angiejones/mcp-selenium --client claude
```

### Install globally

```bash
npm install -g @angiejones/mcp-selenium
mcp-selenium
```

</details>

## License

MIT
