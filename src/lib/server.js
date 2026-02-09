#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from 'selenium-webdriver';
const { Builder, By, Key, until, Actions } = pkg;
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js';
import { Options as FirefoxOptions } from 'selenium-webdriver/firefox.js';
import { Options as EdgeOptions } from 'selenium-webdriver/edge.js';
import injectedScripts from '../injected/index.js';
import { parseSeleniumErrorMessage, deduplicateLogs } from './utils.js';


// Create an MCP server
const server = new McpServer({
    name: "MCP Selenium",
    version: "1.0.0"
});

// Server state
const state = {
    drivers: new Map(),
    currentSession: null,
    logCache: new Map(), // Cache logs per session
    trackedErrorsCache: new Map() // Cache tracked errors per session
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
        case 'tag': return By.css(value);
        case 'class': return By.className(value);
        default: throw new Error(`Unsupported locator strategy: ${by}`);
    }
};

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
        browser: z.enum(["chrome", "firefox", "edge"]).describe("Browser to launch (chrome or firefox or microsoft edge)"),
        options: browserOptionsSchema
    },
    async ({ browser, options = {} }) => {
        try {
            let builder = new Builder();
            let driver;
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
                default: {
                    throw new Error(`Unsupported browser: ${browser}`);
                }
            }
            const sessionId = `${browser}_${Date.now()}`;
            state.drivers.set(sessionId, driver);
            state.currentSession = sessionId;

            return {
                content: [{ type: 'text', text: `Browser started with session_id: ${sessionId}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error starting browser: ${e.message}` }]
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

            // Try to inject error tracking before navigation using CDP (Chrome/Edge only)
            let cdpInjected = false;
            try {
                // Selenium 4.40.0+ has sendDevToolsCommand
                if (typeof driver.sendDevToolsCommand === 'function') {
                    await driver.sendDevToolsCommand('Page.enable', {});
                    await driver.sendDevToolsCommand('Page.addScriptToEvaluateOnNewDocument', {
                        source: injectedScripts.errorLogging
                    });
                    cdpInjected = true;
                }
            } catch (cdpError) {
                // CDP not available or failed - will fall back to post-navigation injection
            }

            await driver.get(url);

            // Also inject after navigation as fallback
            await driver.executeScript(injectedScripts.errorLogging);

            const message = cdpInjected
                ? `Navigated to ${url} (CDP early error tracking enabled)`
                : `Navigated to ${url} (post-load error tracking enabled)`;

            return {
                content: [{ type: 'text', text: message }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error navigating: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error finding element: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error clicking element: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error entering text: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error getting element text: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error hovering over element: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error performing drag and drop: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error performing double click: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error performing right click: ${e.message}` }]
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
            const actions = driver.actions({ bridge: true });
            await actions.keyDown(key).keyUp(key).perform();
            return {
                content: [{ type: 'text', text: `Key '${key}' pressed` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error pressing key: ${e.message}` }]
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
                content: [{ type: 'text', text: `Error uploading file: ${e.message}` }]
            };
        }
    }
);

server.tool(
    "take_screenshot",
    "captures a screenshot of the current page",
    {
        outputPath: z.string().optional().describe("Optional path where to save the screenshot. If not provided, returns base64 data.")
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
                        { type: 'text', text: 'Screenshot captured as base64:' },
                        { type: 'text', text: screenshot }
                    ]
                };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error taking screenshot: ${e.message}` }]
            };
        }
    }
);

server.tool(
    "get_console_logs",
    "Retrieves browser console logs. Query stacktraces with get_error_stacktrace using their timestamps.",
    {
        logType: z.enum(["browser", "driver", "all"]).optional().describe("Type of logs to retrieve (default: browser)")
    },
    async ({ logType = "browser" }) => {
        try {
            const driver = getDriver();
            const logs = await driver.manage().logs().get(logType);

            // Cache the logs for this session so get_error_stacktrace can use them
            state.logCache.set(state.currentSession, logs);

            // Also retrieve tracked errors with stack traces
            let trackedErrors = [];
            try {
                trackedErrors = await driver.executeScript(`
                    return window.__mcpErrorLog || [];
                `);
                // Cache tracked errors too
                state.trackedErrorsCache.set(state.currentSession, trackedErrors);
            } catch (e) {
                // Ignore if script fails (page might not have our tracking injected)
            }

            if (logs.length === 0 && trackedErrors.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No console logs or tracked errors found' }]
                };
            }

            // Merge and deduplicate Selenium logs with tracked errors
            const deduped = deduplicateLogs(logs, trackedErrors);

            let output = '';
            deduped.forEach((entry, index) => {
                const isoTimestamp = new Date(entry.timestamp).toISOString();
                if (entry.source === 'tracked') {
                    output += `[${entry.level}] ${isoTimestamp} (tracked:${entry.type})\n`;
                    output += `${entry.message}\n`;
                    if (entry.hasStack) {
                        output += `  (use get_error_stacktrace with timestamp "${isoTimestamp}" for full stack trace)\n`;
                    }
                } else {
                    output += `[${entry.level}] ${isoTimestamp}\n`;
                    output += `${entry.message}\n`;
                }
                if (index < deduped.length - 1) {
                    output += '\n';
                }
            });

            return {
                content: [{ type: 'text', text: output }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error getting console logs: ${e.message}` }]
            };
        }
    }
);

server.tool(
    "get_error_stacktrace",
    "retrieves stacktraces by timestamp from the last retrieved console logs",
    {
        timestamp: z.union([z.number(), z.string()]).describe("Timestamp of the error - Unix timestamp in ms (number) or ISO date string (e.g., '2026-02-09T20:34:42.939Z')"),
        maxStackLines: z.number().optional().describe("Maximum number of stack trace lines to return (default: 10), 0 for unlimited")
    },
    async ({ timestamp, maxStackLines = 10 }) => {
        try {
            // Use cached logs and tracked errors
            const logs = state.logCache.get(state.currentSession) || [];
            const trackedErrors = state.trackedErrorsCache.get(state.currentSession) || [];

            if (logs.length === 0 && trackedErrors.length === 0) {
                return {
                    content: [{ type: 'text', text: 'No cached console logs found. Please call get_console_logs first to retrieve logs.' }]
                };
            }

            // Convert timestamp to number if it's a string (ISO format)
            let timestampMs;
            if (typeof timestamp === 'string') {
                timestampMs = new Date(timestamp).getTime();
                if (isNaN(timestampMs)) {
                    return {
                        content: [{ type: 'text', text: `Invalid timestamp string: ${timestamp}` }]
                    };
                }
            } else {
                timestampMs = timestamp;
            }

            // First, check tracked errors (they have full stack traces)
            const matchingTrackedError = trackedErrors.find(error => error.timestamp === timestampMs);

            if (matchingTrackedError) {
                // Format the detailed error output with full stack trace
                let output = `Type: ${matchingTrackedError.type}\n`;
                output += `Message: ${matchingTrackedError.message}\n`;

                if (matchingTrackedError.stack) {
                    const stackLines = matchingTrackedError.stack.split('\n');
                    const limitedStack = maxStackLines > 0 ? stackLines.slice(0, maxStackLines) : stackLines;
                    const truncated = maxStackLines > 0 && stackLines.length > maxStackLines;
                    output += `\nStack Trace:\n${limitedStack.join('\n')}`;
                    if (truncated) {
                        output += `\n  ... (${stackLines.length - maxStackLines} more lines truncated)`;
                    }
                    output += '\n';
                } else {
                    output += `\n(No stack trace available)\n`;
                }

                return {
                    content: [{ type: 'text', text: output }]
                };
            }
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error retrieving error stacktrace: ${e.message}` }]
            };
        }
    }
);

server.tool(
    "execute_script",
    "executes JavaScript in browser console and returns result",
    {
        script: z.string().describe("JS code to execute. Sync: expression or function body. Async: callback is last arg, must be called to complete"),
        args: z.array(z.any()).optional().describe("Args passed to script as arguments[0], arguments[1], etc."),
        async: z.boolean().optional().describe("Execute asynchronously (default: false)"),
        timeout: z.number().optional().describe("Max wait time for async script in ms (default: 30000)")
    },
    async ({ script, args = [], async: isAsync = false, timeout = 30000 }) => {
        try {
            const driver = getDriver();

            let result;
            if (isAsync) {
                // Set the script timeout for async execution
                await driver.manage().setTimeouts({ script: timeout });

                // Execute the async script and get the result
                result = await driver.executeAsyncScript(script, ...args);
            } else {
                // Execute the script synchronously and get the result
                result = await driver.executeScript(script, ...args);
            }

            // Handle different result types
            let formattedResult;
            if (result === null) {
                formattedResult = 'null';
            } else if (result === undefined) {
                formattedResult = 'undefined';
            } else if (typeof result === 'object') {
                try {
                    formattedResult = JSON.stringify(result, null, 2);
                } catch (e) {
                    formattedResult = String(result);
                }
            } else {
                formattedResult = String(result);
            }

            const executionMode = isAsync ? 'Async script' : 'Script';
            return {
                content: [{ type: 'text', text: `${executionMode} executed successfully.\nResult: ${formattedResult}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error executing script: ${e.message}` }]
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
            await driver.quit();
            state.drivers.delete(state.currentSession);
            state.logCache.delete(state.currentSession); // Clean up cached logs
            state.trackedErrorsCache.delete(state.currentSession); // Clean up tracked errors cache
            const sessionId = state.currentSession;
            state.currentSession = null;
            return {
                content: [{ type: 'text', text: `Browser session ${sessionId} closed` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error closing session: ${e.message}` }]
            };
        }
    }
);

// Resources
server.resource(
    "browser-status",
    new ResourceTemplate("browser-status://current"),
    async (uri) => ({
        contents: [{
            uri: uri.href,
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
    state.currentSession = null;
    process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
