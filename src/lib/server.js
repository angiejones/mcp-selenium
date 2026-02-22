#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from 'selenium-webdriver';
const { Builder, By, Key, until, Actions, error } = pkg;
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js';
import { Options as FirefoxOptions } from 'selenium-webdriver/firefox.js';
import { Options as EdgeOptions } from 'selenium-webdriver/edge.js';
import { Options as SafariOptions } from 'selenium-webdriver/safari.js';

// Create an MCP server
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const server = new McpServer({
    name: "MCP Selenium",
    version
});

// BiDi imports — loaded dynamically to avoid hard failures if not available
let LogInspector, Network;
try {
    LogInspector = (await import('selenium-webdriver/bidi/logInspector.js')).default;
    const networkModule = await import('selenium-webdriver/bidi/network.js');
    Network = networkModule.Network;
} catch (_) {
    // BiDi modules not available in this selenium-webdriver version
    LogInspector = null;
    Network = null;
}

// Server state
const state = {
    drivers: new Map(),
    currentSession: null,
    bidi: new Map()
};

// Helper functions
const getDriver = () => {
    const driver = state.drivers.get(state.currentSession);
    if (!driver) {
        throw new Error('No active browser session');
    }
    return driver;
};

const getLocator = (by, value) => {
    switch (by.toLowerCase()) {
        case 'id': return By.id(value);
        case 'css': return By.css(value);
        case 'xpath': return By.xpath(value);
        case 'name': return By.name(value);
        case 'tag': return By.tagName(value);
        case 'class': return By.className(value);
        default: throw new Error(`Unsupported locator strategy: ${by}`);
    }
};

// BiDi helpers
const newBidiState = () => ({
    available: false,
    consoleLogs: [],
    pageErrors: [],
    networkLogs: []
});

async function setupBidi(driver, sessionId) {
    const bidi = newBidiState();

    const logInspector = await LogInspector(driver);
    await logInspector.onConsoleEntry((entry) => {
        try {
            bidi.consoleLogs.push({
                level: entry.level, text: entry.text, timestamp: entry.timestamp,
                type: entry.type, method: entry.method, args: entry.args
            });
        } catch (_) { /* ignore malformed entry */ }
    });
    await logInspector.onJavascriptLog((entry) => {
        try {
            bidi.pageErrors.push({
                level: entry.level, text: entry.text, timestamp: entry.timestamp,
                type: entry.type, stackTrace: entry.stackTrace
            });
        } catch (_) { /* ignore malformed entry */ }
    });

    const network = await Network(driver);
    await network.responseCompleted((event) => {
        try {
            bidi.networkLogs.push({
                type: 'response', url: event.request?.url, status: event.response?.status,
                method: event.request?.method, mimeType: event.response?.mimeType, timestamp: Date.now()
            });
        } catch (_) { /* ignore malformed event */ }
    });
    await network.fetchError((event) => {
        try {
            bidi.networkLogs.push({
                type: 'error', url: event.request?.url, method: event.request?.method,
                errorText: event.errorText, timestamp: Date.now()
            });
        } catch (_) { /* ignore malformed event */ }
    });

    bidi.available = true;
    state.bidi.set(sessionId, bidi);
}

// Common schemas
const browserOptionsSchema = z.object({
    headless: z.boolean().optional().describe("Run browser in headless mode"),
    arguments: z.array(z.string()).optional().describe("Additional browser arguments")
}).optional();

const locatorSchema = {
    by: z.enum(["id", "css", "xpath", "name", "tag", "class"]).describe("Locator strategy to find element"),
    value: z.string().describe("Value for the locator strategy"),
    timeout: z.number().optional().describe("Maximum time to wait for element in milliseconds")
};

// Browser Management Tools
server.tool(
    "start_browser",
    "launches browser",
    {
        browser: z.enum(["chrome", "firefox", "edge", "safari"]).describe("Browser to launch (chrome, firefox, edge, or safari)"),
        options: browserOptionsSchema
    },
    async ({ browser, options = {} }) => {
        try {
            let builder = new Builder();
            let driver;
            let warnings = [];

            // Enable BiDi websocket if the modules are available
            if (LogInspector && Network) {
                // 'ignore' prevents BiDi from auto-dismissing alert/confirm/prompt dialogs,
                // allowing the alert tool's accept, dismiss, and get_text actions to work as expected.
                builder = builder.withCapabilities({ 'webSocketUrl': true, 'unhandledPromptBehavior': 'ignore' });
            }

            switch (browser) {
                case 'chrome': {
                    const chromeOptions = new ChromeOptions();
                    if (options.headless) {
                        chromeOptions.addArguments('--headless=new');
                    }
                    if (options.arguments) {
                        options.arguments.forEach(arg => chromeOptions.addArguments(arg));
                    }
                    driver = await builder
                        .forBrowser('chrome')
                        .setChromeOptions(chromeOptions)
                        .build();
                    break;
                }
                case 'edge': {
                    const edgeOptions = new EdgeOptions();
                    if (options.headless) {
                        edgeOptions.addArguments('--headless=new');
                    }
                    if (options.arguments) {
                        options.arguments.forEach(arg => edgeOptions.addArguments(arg));
                    }
                    driver = await builder
                        .forBrowser('edge')
                        .setEdgeOptions(edgeOptions)
                        .build();
                    break;
                }
                case 'firefox': {
                    const firefoxOptions = new FirefoxOptions();
                    if (options.headless) {
                        firefoxOptions.addArguments('--headless');
                    }
                    if (options.arguments) {
                        options.arguments.forEach(arg => firefoxOptions.addArguments(arg));
                    }
                    driver = await builder
                        .forBrowser('firefox')
                        .setFirefoxOptions(firefoxOptions)
                        .build();
                    break;
                }
                case 'safari': {
                    const safariOptions = new SafariOptions();
                    if (options.headless) {
                        warnings.push('Safari does not support headless mode — launching with visible window.');
                    }
                    if (options.arguments?.length) {
                        warnings.push('Safari does not support custom arguments — ignoring.');
                    }
                    driver = await builder
                        .forBrowser('safari')
                        .setSafariOptions(safariOptions)
                        .build();
                    break;
                }
                default: {
                    throw new Error(`Unsupported browser: ${browser}`);
                }
            }
            const sessionId = `${browser}_${Date.now()}`;
            state.drivers.set(sessionId, driver);
            state.currentSession = sessionId;

            // Attempt to enable BiDi for real-time log capture
            if (LogInspector && Network) {
                try {
                    await setupBidi(driver, sessionId);
                } catch (_) {
                    // BiDi not supported by this browser/driver — continue without it
                }
            }

            let message = `Browser started with session_id: ${sessionId}`;
            if (state.bidi.get(sessionId)?.available) {
                message += ' (BiDi enabled: console logs, JS errors, and network activity are being captured)';
            }
            if (warnings.length > 0) {
                message += `\nWarnings: ${warnings.join(' ')}`;
            }

            return {
                content: [{ type: 'text', text: message }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error starting browser: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "navigate",
    "navigates to a URL",
    {
        url: z.string().describe("URL to navigate to")
    },
    async ({ url }) => {
        try {
            const driver = getDriver();
            await driver.get(url);
            return {
                content: [{ type: 'text', text: `Navigated to ${url}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error navigating: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Element Interaction Tools
server.tool(
    "interact",
    "performs a mouse action on an element",
    {
        action: z.enum(["click", "doubleclick", "rightclick", "hover"]).describe("Mouse action to perform"),
        ...locatorSchema
    },
    async ({ action, by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);

            switch (action) {
                case 'click':
                    await element.click();
                    return { content: [{ type: 'text', text: 'Element clicked' }] };
                case 'doubleclick': {
                    const dblActions = driver.actions({ bridge: true });
                    await dblActions.doubleClick(element).perform();
                    return { content: [{ type: 'text', text: 'Double click performed' }] };
                }
                case 'rightclick': {
                    const ctxActions = driver.actions({ bridge: true });
                    await ctxActions.contextClick(element).perform();
                    return { content: [{ type: 'text', text: 'Right click performed' }] };
                }
                case 'hover': {
                    const hoverActions = driver.actions({ bridge: true });
                    await hoverActions.move({ origin: element }).perform();
                    return { content: [{ type: 'text', text: 'Hovered over element' }] };
                }
                default:
                    return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error performing ${action}: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "send_keys",
    "sends keys to an element, aka typing. Clears the field first.",
    {
        ...locatorSchema,
        text: z.string().describe("Text to enter into the element")
    },
    async ({ by, value, text, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            await element.clear();
            await element.sendKeys(text);
            return {
                content: [{ type: 'text', text: `Text "${text}" entered into element` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error entering text: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "get_element_text",
    "gets the text content of an element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            const text = await element.getText();
            return {
                content: [{ type: 'text', text }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting element text: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "press_key",
    "simulates pressing a keyboard key",
    {
        key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'a', etc.)")
    },
    async ({ key }) => {
        try {
            const driver = getDriver();
            const resolvedKey = key.length === 1
                ? key
                : Key[key.toUpperCase().replace(/ /g, '_')] ?? null;
            if (resolvedKey === null) {
                return {
                    content: [{ type: 'text', text: `Error pressing key: Unknown key name '${key}'. Use a single character or a named key like 'Enter', 'Tab', 'Escape', etc.` }],
                    isError: true
                };
            }
            const actions = driver.actions({ bridge: true });
            await actions.keyDown(resolvedKey).keyUp(resolvedKey).perform();
            return {
                content: [{ type: 'text', text: `Key '${key}' pressed` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error pressing key: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "upload_file",
    "uploads a file using a file input element",
    {
        ...locatorSchema,
        filePath: z.string().describe("Absolute path to the file to upload")
    },
    async ({ by, value, filePath, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            await element.sendKeys(filePath);
            return {
                content: [{ type: 'text', text: 'File upload initiated' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error uploading file: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "take_screenshot",
    "captures a screenshot of the current page",
    {
        outputPath: z.string().optional().describe("Optional path where to save the screenshot. If not provided, returns an image/png content block.")
    },
    async ({ outputPath }) => {
        try {
            const driver = getDriver();
            const screenshot = await driver.takeScreenshot();
            if (outputPath) {
                const fs = await import('fs');
                await fs.promises.writeFile(outputPath, screenshot, 'base64');
                return {
                    content: [{ type: 'text', text: `Screenshot saved to ${outputPath}` }]
                };
            } else {
                return {
                    content: [
                        { type: 'image', data: screenshot, mimeType: 'image/png' }
                    ]
                };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error taking screenshot: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "close_session",
    "closes the current browser session",
    {},
    async () => {
        try {
            const driver = getDriver();
            const sessionId = state.currentSession;
            try {
                await driver.quit();
            } finally {
                state.drivers.delete(sessionId);
                state.bidi.delete(sessionId);
                state.currentSession = null;
            }
            return {
                content: [{ type: 'text', text: `Browser session ${sessionId} closed` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error closing session: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Element Utility Tools
server.tool(
    "get_element_attribute",
    "gets the value of an attribute on an element",
    {
        ...locatorSchema,
        attribute: z.string().describe("Name of the attribute to get (e.g., 'href', 'value', 'class')")
    },
    async ({ by, value, attribute, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            const attrValue = await element.getAttribute(attribute);
            return {
                content: [{ type: 'text', text: attrValue !== null ? attrValue : '' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting attribute: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "execute_script",
    "executes JavaScript in the browser and returns the result. Use for advanced interactions not covered by other tools (e.g., drag and drop, scrolling, reading computed styles, manipulating the DOM directly).",
    {
        script: z.string().describe("JavaScript code to execute in the browser"),
        args: z.array(z.any()).optional().describe("Optional arguments to pass to the script (accessible via arguments[0], arguments[1], etc.)")
    },
    async ({ script, args = [] }) => {
        try {
            const driver = getDriver();
            const result = await driver.executeScript(script, ...args);
            const text = result === undefined || result === null
                ? 'Script executed (no return value)'
                : typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
            return {
                content: [{ type: 'text', text }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error executing script: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Window/Tab Management
server.tool(
    "window",
    "manages browser windows and tabs",
    {
        action: z.enum(["list", "switch", "switch_latest", "close"]).describe("Window action to perform"),
        handle: z.string().optional().describe("Window handle (required for switch)")
    },
    async ({ action, handle }) => {
        try {
            const driver = getDriver();
            switch (action) {
                case 'list': {
                    const handles = await driver.getAllWindowHandles();
                    const current = await driver.getWindowHandle();
                    return { content: [{ type: 'text', text: JSON.stringify({ current, all: handles }, null, 2) }] };
                }
                case 'switch': {
                    if (!handle) throw new Error('handle is required for switch action');
                    await driver.switchTo().window(handle);
                    return { content: [{ type: 'text', text: `Switched to window: ${handle}` }] };
                }
                case 'switch_latest': {
                    const handles = await driver.getAllWindowHandles();
                    if (handles.length === 0) throw new Error('No windows available');
                    const latest = handles[handles.length - 1];
                    await driver.switchTo().window(latest);
                    return { content: [{ type: 'text', text: `Switched to latest window: ${latest}` }] };
                }
                case 'close': {
                    await driver.close();
                    let handles = [];
                    try { handles = await driver.getAllWindowHandles(); } catch (_) { /* session gone */ }
                    if (handles.length > 0) {
                        await driver.switchTo().window(handles[0]);
                        return { content: [{ type: 'text', text: `Window closed. Switched to: ${handles[0]}` }] };
                    }
                    const sessionId = state.currentSession;
                    try { await driver.quit(); } catch (_) { /* ignore */ }
                    state.drivers.delete(sessionId);
                    state.bidi.delete(sessionId);
                    state.currentSession = null;
                    return { content: [{ type: 'text', text: 'Last window closed. Session ended.' }] };
                }
                default:
                    return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error in window ${action}: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Frame Management
server.tool(
    "frame",
    "switches focus to a frame or back to the main page",
    {
        action: z.enum(["switch", "default"]).describe("Frame action to perform"),
        by: z.enum(["id", "css", "xpath", "name", "tag", "class"]).optional().describe("Locator strategy for frame element"),
        value: z.string().optional().describe("Value for the locator strategy"),
        index: z.number().optional().describe("Frame index (0-based)"),
        timeout: z.number().optional().describe("Max wait in ms")
    },
    async ({ action, by, value, index, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            if (action === 'default') {
                await driver.switchTo().defaultContent();
                return { content: [{ type: 'text', text: 'Switched to default content' }] };
            }
            // action === 'switch'
            if (index !== undefined) {
                await driver.switchTo().frame(index);
            } else if (by && value) {
                const locator = getLocator(by, value);
                const element = await driver.wait(until.elementLocated(locator), timeout);
                await driver.switchTo().frame(element);
            } else {
                throw new Error('Provide either by/value to locate frame, or index to switch by position');
            }
            return { content: [{ type: 'text', text: 'Switched to frame' }] };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error in frame ${action}: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Alert/Dialog Handling
server.tool(
    "alert",
    "handles a browser alert, confirm, or prompt dialog",
    {
        action: z.enum(["accept", "dismiss", "get_text", "send_text"]).describe("Action to perform on the alert"),
        text: z.string().optional().describe("Text to send (required for send_text)"),
        timeout: z.number().optional().describe("Max wait in ms")
    },
    async ({ action, text, timeout = 5000 }) => {
        try {
            const driver = getDriver();
            await driver.wait(until.alertIsPresent(), timeout);
            const alertObj = await driver.switchTo().alert();
            switch (action) {
                case 'accept':
                    await alertObj.accept();
                    return { content: [{ type: 'text', text: 'Alert accepted' }] };
                case 'dismiss':
                    await alertObj.dismiss();
                    return { content: [{ type: 'text', text: 'Alert dismissed' }] };
                case 'get_text': {
                    const alertText = await alertObj.getText();
                    return { content: [{ type: 'text', text: alertText }] };
                }
                case 'send_text': {
                    if (text === undefined) throw new Error('text is required for send_text action');
                    await alertObj.sendKeys(text);
                    await alertObj.accept();
                    return { content: [{ type: 'text', text: `Text "${text}" sent to prompt and accepted` }] };
                }
                default:
                    return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error in alert ${action}: ${e.message}` }],
                isError: true
            };
        }
    }
);


// Cookie Management Tools
server.tool(
    "add_cookie",
    "adds a cookie to the current browser session. The browser must be on a page from the cookie's domain before setting it.",
    {
        name: z.string().describe("Name of the cookie"),
        value: z.string().describe("Value of the cookie"),
        domain: z.string().optional().describe("Domain the cookie is visible to"),
        path: z.string().optional().describe("Path the cookie is visible to"),
        secure: z.boolean().optional().describe("Whether the cookie is a secure cookie"),
        httpOnly: z.boolean().optional().describe("Whether the cookie is HTTP only"),
        expiry: z.number().optional().describe("Expiry date of the cookie as a Unix timestamp (seconds since epoch)")
    },
    async ({ name, value, domain, path, secure, httpOnly, expiry }) => {
        try {
            const driver = getDriver();
            const cookie = { name, value };
            if (domain !== undefined) cookie.domain = domain;
            if (path !== undefined) cookie.path = path;
            if (secure !== undefined) cookie.secure = secure;
            if (httpOnly !== undefined) cookie.httpOnly = httpOnly;
            if (expiry !== undefined) cookie.expiry = expiry;
            await driver.manage().addCookie(cookie);
            return {
                content: [{ type: 'text', text: `Cookie "${name}" added` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error adding cookie: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "get_cookies",
    "retrieves cookies from the current browser session. Returns all cookies or a specific cookie by name.",
    {
        name: z.string().optional().describe("Name of a specific cookie to retrieve. If omitted, all cookies are returned.")
    },
    async ({ name }) => {
        try {
            const driver = getDriver();
            if (name) {
                try {
                    const cookie = await driver.manage().getCookie(name);
                    if (!cookie) {
                        return {
                            content: [{ type: 'text', text: `Cookie "${name}" not found` }],
                            isError: true
                        };
                    }
                    return {
                        content: [{ type: 'text', text: JSON.stringify(cookie, null, 2) }]
                    };
                } catch (cookieError) {
                    if (cookieError instanceof error.NoSuchCookieError) {
                        return {
                            content: [{ type: 'text', text: `Cookie "${name}" not found` }],
                            isError: true
                        };
                    }
                    throw cookieError;
                }
            } else {
                const cookies = await driver.manage().getCookies();
                return {
                    content: [{ type: 'text', text: JSON.stringify(cookies, null, 2) }]
                };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting cookies: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "delete_cookie",
    "deletes cookies from the current browser session. Can delete a specific cookie by name or all cookies.",
    {
        name: z.string().optional().describe("Name of the cookie to delete. If omitted, all cookies are deleted.")
    },
    async ({ name }) => {
        try {
            const driver = getDriver();
            if (name) {
                await driver.manage().deleteCookie(name);
                return {
                    content: [{ type: 'text', text: `Cookie "${name}" deleted` }]
                };
            } else {
                await driver.manage().deleteAllCookies();
                return {
                    content: [{ type: 'text', text: 'All cookies deleted' }]
                };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error deleting cookie: ${e.message}` }],
                isError: true
            };
        }
    }
);

// BiDi Diagnostic Tools
const diagnosticTypes = {
    console:  { logKey: 'consoleLogs', emptyMessage: 'No console logs captured' },
    errors:   { logKey: 'pageErrors',  emptyMessage: 'No page errors captured' },
    network:  { logKey: 'networkLogs', emptyMessage: 'No network activity captured' }
};

server.tool(
    "diagnostics",
    "retrieves browser diagnostics (console logs, JS errors, or network activity) captured via WebDriver BiDi",
    {
        type: z.enum(["console", "errors", "network"]).describe("Type of diagnostic data to retrieve"),
        clear: z.boolean().optional().describe("Clear after returning (default: false)")
    },
    async ({ type, clear = false }) => {
        try {
            getDriver();
            const bidi = state.bidi.get(state.currentSession);
            if (!bidi?.available) {
                return { content: [{ type: 'text', text: 'Diagnostics not available (BiDi not supported by this browser/driver)' }] };
            }
            const { logKey, emptyMessage } = diagnosticTypes[type];
            const logs = bidi[logKey];
            const result = logs.length === 0 ? emptyMessage : JSON.stringify(logs, null, 2);
            if (clear) bidi[logKey] = [];
            return { content: [{ type: 'text', text: result }] };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting diagnostics: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Resources
server.resource(
    "browser-status",
    "browser-status://current",
    {
        description: "Current browser session status",
        mimeType: "text/plain"
    },
    async (uri) => ({
        contents: [{
            uri: uri.href,
            mimeType: "text/plain",
            text: state.currentSession
                ? `Active browser session: ${state.currentSession}`
                : "No active browser session"
        }]
    })
);

// Cleanup handler
async function cleanup() {
    for (const [sessionId, driver] of state.drivers) {
        try {
            await driver.quit();
        } catch (e) {
            console.error(`Error closing browser session ${sessionId}:`, e);
        }
    }
    state.drivers.clear();
    state.bidi.clear();
    state.currentSession = null;
    process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
