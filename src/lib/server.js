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


// Create an MCP server
const server = new McpServer({
    name: "MCP Selenium",
    version: "1.0.0"
});

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

function registerBidiTool(name, description, logKey, emptyMessage, unavailableMessage) {
    server.tool(
        name,
        description,
        { clear: z.boolean().optional().describe("Clear after returning (default: false)") },
        async ({ clear = false }) => {
            try {
                getDriver();
                const bidi = state.bidi.get(state.currentSession);
                if (!bidi?.available) {
                    return { content: [{ type: 'text', text: unavailableMessage }] };
                }
                const logs = bidi[logKey];
                const result = logs.length === 0 ? emptyMessage : JSON.stringify(logs, null, 2);
                if (clear) bidi[logKey] = [];
                return { content: [{ type: 'text', text: result }] };
            } catch (e) {
                return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
            }
        }
    );
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
    "find_element",
    "finds an element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            await driver.wait(until.elementLocated(locator), timeout);
            return {
                content: [{ type: 'text', text: 'Element found' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error finding element: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "click_element",
    "clicks an element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            await element.click();
            return {
                content: [{ type: 'text', text: 'Element clicked' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error clicking element: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "send_keys",
    "sends keys to an element, aka typing",
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
    "gets the text() of an element",
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
    "hover",
    "moves the mouse to hover over an element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            const actions = driver.actions({ bridge: true });
            await actions.move({ origin: element }).perform();
            return {
                content: [{ type: 'text', text: 'Hovered over element' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error hovering over element: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "drag_and_drop",
    "drags an element and drops it onto another element",
    {
        ...locatorSchema,
        targetBy: z.enum(["id", "css", "xpath", "name", "tag", "class"]).describe("Locator strategy to find target element"),
        targetValue: z.string().describe("Value for the target locator strategy")
    },
    async ({ by, value, targetBy, targetValue, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const sourceLocator = getLocator(by, value);
            const targetLocator = getLocator(targetBy, targetValue);
            const sourceElement = await driver.wait(until.elementLocated(sourceLocator), timeout);
            const targetElement = await driver.wait(until.elementLocated(targetLocator), timeout);
            const actions = driver.actions({ bridge: true });
            await actions.dragAndDrop(sourceElement, targetElement).perform();
            return {
                content: [{ type: 'text', text: 'Drag and drop completed' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error performing drag and drop: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "double_click",
    "performs a double click on an element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            const actions = driver.actions({ bridge: true });
            await actions.doubleClick(element).perform();
            return {
                content: [{ type: 'text', text: 'Double click performed' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error performing double click: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "right_click",
    "performs a right click (context click) on an element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            const actions = driver.actions({ bridge: true });
            await actions.contextClick(element).perform();
            return {
                content: [{ type: 'text', text: 'Right click performed' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error performing right click: ${e.message}` }],
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
            // Map named keys to Selenium Key constants (case-insensitive).
            // Single characters are passed through as-is.
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
            await driver.quit();
            state.drivers.delete(sessionId);
            state.bidi.delete(sessionId);
            state.currentSession = null;
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
    "clear_element",
    "clears the content of an input or textarea element",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            await element.clear();
            return {
                content: [{ type: 'text', text: 'Element cleared' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error clearing element: ${e.message}` }],
                isError: true
            };
        }
    }
);

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
    "scroll_to_element",
    "scrolls the page until an element is visible",
    {
        ...locatorSchema
    },
    async ({ by, value, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            const locator = getLocator(by, value);
            const element = await driver.wait(until.elementLocated(locator), timeout);
            await driver.executeScript("arguments[0].scrollIntoView({block: 'center'});", element);
            return {
                content: [{ type: 'text', text: 'Scrolled to element' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error scrolling to element: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "execute_script",
    "executes JavaScript in the browser and returns the result",
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

// Window/Tab Management Tools
server.tool(
    "switch_to_window",
    "switches to a specific browser window or tab by handle",
    {
        handle: z.string().describe("Window handle to switch to")
    },
    async ({ handle }) => {
        try {
            const driver = getDriver();
            await driver.switchTo().window(handle);
            return {
                content: [{ type: 'text', text: `Switched to window: ${handle}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error switching window: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "get_window_handles",
    "returns all window/tab handles for the current session",
    {},
    async () => {
        try {
            const driver = getDriver();
            const handles = await driver.getAllWindowHandles();
            const current = await driver.getWindowHandle();
            return {
                content: [{ type: 'text', text: JSON.stringify({ current, all: handles }, null, 2) }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting window handles: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "switch_to_latest_window",
    "switches to the most recently opened window or tab",
    {},
    async () => {
        try {
            const driver = getDriver();
            const handles = await driver.getAllWindowHandles();
            if (handles.length === 0) {
                throw new Error('No windows available');
            }
            const latest = handles[handles.length - 1];
            await driver.switchTo().window(latest);
            return {
                content: [{ type: 'text', text: `Switched to latest window: ${latest}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error switching to latest window: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "close_current_window",
    "closes the current window/tab and switches back to the first remaining window",
    {},
    async () => {
        try {
            const driver = getDriver();
            await driver.close();
            const handles = await driver.getAllWindowHandles();
            if (handles.length > 0) {
                await driver.switchTo().window(handles[0]);
                return {
                    content: [{ type: 'text', text: `Window closed. Switched to: ${handles[0]}` }]
                };
            }
            // Last window closed — quit the driver and clean up the session
            const sessionId = state.currentSession;
            try {
                await driver.quit();
            } catch (quitError) {
                console.error(`Error quitting driver for session ${sessionId}:`, quitError);
            }
            state.drivers.delete(sessionId);
            state.bidi.delete(sessionId);
            state.currentSession = null;
            return {
                content: [{ type: 'text', text: 'Last window closed. Session ended.' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error closing window: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Frame Management Tools
server.tool(
    "switch_to_frame",
    "switches focus to an iframe or frame within the page. Provide either by/value to locate by element, or index to switch by position.",
    {
        by: z.enum(["id", "css", "xpath", "name", "tag", "class"]).optional().describe("Locator strategy to find frame element"),
        value: z.string().optional().describe("Value for the locator strategy"),
        index: z.number().optional().describe("Frame index (0-based) to switch to by position"),
        timeout: z.number().optional().describe("Maximum time to wait for frame in milliseconds")
    },
    async ({ by, value, index, timeout = 10000 }) => {
        try {
            const driver = getDriver();
            if (index !== undefined) {
                await driver.switchTo().frame(index);
            } else if (by && value) {
                const locator = getLocator(by, value);
                const element = await driver.wait(until.elementLocated(locator), timeout);
                await driver.switchTo().frame(element);
            } else {
                throw new Error('Provide either by/value to locate frame by element, or index to switch by position');
            }
            return {
                content: [{ type: 'text', text: `Switched to frame` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error switching to frame: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "switch_to_default_content",
    "switches focus back to the main page from an iframe",
    {},
    async () => {
        try {
            const driver = getDriver();
            await driver.switchTo().defaultContent();
            return {
                content: [{ type: 'text', text: 'Switched to default content' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error switching to default content: ${e.message}` }],
                isError: true
            };
        }
    }
);

// Alert/Dialog Tools
server.tool(
    "accept_alert",
    "accepts (clicks OK) on a browser alert, confirm, or prompt dialog",
    {
        timeout: z.number().optional().describe("Maximum time to wait for alert in milliseconds")
    },
    async ({ timeout = 5000 }) => {
        try {
            const driver = getDriver();
            await driver.wait(until.alertIsPresent(), timeout);
            const alert = await driver.switchTo().alert();
            await alert.accept();
            return {
                content: [{ type: 'text', text: 'Alert accepted' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error accepting alert: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "dismiss_alert",
    "dismisses (clicks Cancel) on a browser alert, confirm, or prompt dialog",
    {
        timeout: z.number().optional().describe("Maximum time to wait for alert in milliseconds")
    },
    async ({ timeout = 5000 }) => {
        try {
            const driver = getDriver();
            await driver.wait(until.alertIsPresent(), timeout);
            const alert = await driver.switchTo().alert();
            await alert.dismiss();
            return {
                content: [{ type: 'text', text: 'Alert dismissed' }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error dismissing alert: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "get_alert_text",
    "gets the text content of a browser alert, confirm, or prompt dialog",
    {
        timeout: z.number().optional().describe("Maximum time to wait for alert in milliseconds")
    },
    async ({ timeout = 5000 }) => {
        try {
            const driver = getDriver();
            await driver.wait(until.alertIsPresent(), timeout);
            const alert = await driver.switchTo().alert();
            const text = await alert.getText();
            return {
                content: [{ type: 'text', text }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting alert text: ${e.message}` }],
                isError: true
            };
        }
    }
);

server.tool(
    "send_alert_text",
    "types text into a browser prompt dialog and accepts it",
    {
        text: z.string().describe("Text to enter into the prompt"),
        timeout: z.number().optional().describe("Maximum time to wait for alert in milliseconds")
    },
    async ({ text, timeout = 5000 }) => {
        try {
            const driver = getDriver();
            await driver.wait(until.alertIsPresent(), timeout);
            const alert = await driver.switchTo().alert();
            await alert.sendKeys(text);
            await alert.accept();
            return {
                content: [{ type: 'text', text: `Text "${text}" sent to prompt and accepted` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error sending text to alert: ${e.message}` }],
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
registerBidiTool(
    'get_console_logs',
    'returns browser console messages (log, warn, info, debug) captured via WebDriver BiDi. Useful for debugging page behavior, seeing application output, and catching warnings.',
    'consoleLogs',
    'No console logs captured',
    'Console log capture is not available (BiDi not supported by this browser/driver)'
);

registerBidiTool(
    'get_page_errors',
    'returns JavaScript errors and exceptions captured via WebDriver BiDi. Includes stack traces when available. Essential for diagnosing why a page is broken or a feature isn\'t working.',
    'pageErrors',
    'No page errors captured',
    'Page error capture is not available (BiDi not supported by this browser/driver)'
);

registerBidiTool(
    'get_network_logs',
    'returns network activity (completed responses and failed requests) captured via WebDriver BiDi. Shows HTTP status codes, URLs, methods, and error details. Useful for diagnosing failed API calls and broken resources.',
    'networkLogs',
    'No network activity captured',
    'Network log capture is not available (BiDi not supported by this browser/driver)'
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
