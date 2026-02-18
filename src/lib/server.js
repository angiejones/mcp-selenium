#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from "zod";
import pkg from 'selenium-webdriver';
const { Builder, By, Key, until, Actions, Browser } = pkg;
import { Options as ChromeOptions } from 'selenium-webdriver/chrome.js';
import { Options as FirefoxOptions } from 'selenium-webdriver/firefox.js';
import { Options as EdgeOptions } from 'selenium-webdriver/edge.js';


// Server state
const state = {
    drivers: new Map(), // Map of driver session IDs to driver instances
    sessionDrivers: new Map(), // Map of MCP session IDs to driver session IDs
    httpServer: null,
    streamableTransports: new Map(),
    mcpServers: new Map() // Map of MCP session IDs to McpServer instances
};

const MAX_REQUEST_BODY_SIZE = 1024 * 1024; // 1 MB limit

const readJsonBody = async (req) => {
    const chunks = [];
    let totalSize = 0;
    
    for await (const chunk of req) {
        totalSize += chunk.length;
        if (totalSize > MAX_REQUEST_BODY_SIZE) {
            const error = new Error('Request body too large');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    if (!chunks.length) {
        return undefined;
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
};

const isInitializePayload = (payload) => {
    if (!payload) {
        return false;
    }

    if (Array.isArray(payload)) {
        return payload.some((message) => isInitializeRequest(message));
    }

    return isInitializeRequest(payload);
};

const parseServerConfig = () => {
    const args = process.argv.slice(2);
    const config = {
        transport: 'stdio',
        port: 9887,
        host: '0.0.0.0'
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg.startsWith('--transport=')) {
            config.transport = arg.split('=')[1];
        } else if (arg === '--transport' && args[i + 1]) {
            config.transport = args[i + 1];
            i += 1;
        } else if (arg.startsWith('--port=')) {
            config.port = Number(arg.split('=')[1]);
        } else if (arg === '--port' && args[i + 1]) {
            config.port = Number(args[i + 1]);
            i += 1;
        } else if (arg.startsWith('--host=')) {
            config.host = arg.split('=')[1];
        } else if (arg === '--host' && args[i + 1]) {
            config.host = args[i + 1];
            i += 1;
        }
    }

    const supportedTransports = new Set(['stdio', 'streamable-http']);
    if (!supportedTransports.has(config.transport)) {
        throw new Error(`Unsupported transport: ${config.transport}. Use one of: stdio, streamable-http`);
    }

    if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
        throw new Error(`Invalid port: ${config.port}. Port must be between 1 and 65535.`);
    }

    return config;
};

const startStreamableHttpServer = async ({ host, port }) => {
    state.httpServer = createServer(async (req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

        if (req.method === 'GET' && url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', transport: 'streamable-http' }));
            return;
        }

        if (url.pathname === '/mcp') {
            try {
                const sessionHeader = req.headers['mcp-session-id'];
                const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

                let parsedBody;
                if (req.method === 'POST') {
                    parsedBody = await readJsonBody(req);
                }

                let transport = sessionId ? state.streamableTransports.get(sessionId) : undefined;

                if (!transport) {
                    const isInitialize = req.method === 'POST' && isInitializePayload(parsedBody);

                    if (!isInitialize) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0',
                            error: {
                                code: -32000,
                                message: 'Bad Request: No valid session ID provided'
                            },
                            id: null
                        }));
                        return;
                    }

                    // Create a new MCP server instance for this session
                    const mcpServer = createMcpServer();

                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (newSessionId) => {
                            state.streamableTransports.set(newSessionId, transport);
                            // Register MCP server under correct session ID after it's been assigned
                            state.mcpServers.set(newSessionId, mcpServer);
                        }
                    });

                    transport.onclose = async () => {
                        if (transport.sessionId) {
                            // Clean up any browser drivers associated with this MCP session
                            const driverSessionId = state.sessionDrivers.get(transport.sessionId);
                            if (driverSessionId) {
                                const driver = state.drivers.get(driverSessionId);
                                if (driver) {
                                    try {
                                        await driver.quit();
                                    } catch (e) {
                                        console.error(`Error closing driver for session ${transport.sessionId}:`, e);
                                    }
                                    state.drivers.delete(driverSessionId);
                                }
                                state.sessionDrivers.delete(transport.sessionId);
                            }
                            
                            state.mcpServers.delete(transport.sessionId);
                            state.streamableTransports.delete(transport.sessionId);
                        }
                    };

                    // Connect and initialize the MCP server
                    await mcpServer.connect(transport);
                }

                await transport.handleRequest(req, res, parsedBody);
            } catch (error) {
                if (!res.headersSent) {
                    // Handle payload too large error
                    if (error.statusCode === 413) {
                        res.writeHead(413, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0',
                            error: {
                                code: -32000,
                                message: 'Payload too large',
                                data: error.message
                            },
                            id: null
                        }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0',
                            error: {
                                code: -32700,
                                message: 'Parse error',
                                data: error.message
                            },
                            id: null
                        }));
                    }
                }
            }
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise((resolve, reject) => {
        state.httpServer.once('error', reject);
        state.httpServer.listen(port, host, () => {
            state.httpServer.removeListener('error', reject);
            resolve();
        });
    });
    console.error(`MCP Selenium (streamable-http) listening on http://${host}:${port}/mcp`);

};

// Helper functions
const getDriver = (mcpSessionId) => {
    if (!mcpSessionId) {
        throw new Error('No MCP session ID provided');
    }
    const driverSessionId = state.sessionDrivers.get(mcpSessionId);
    if (!driverSessionId) {
        throw new Error('No active browser session for this MCP session');
    }
    const driver = state.drivers.get(driverSessionId);
    if (!driver) {
        throw new Error('Browser driver not found');
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
const getRemoteWebDriverUrl = (browser) => {
    const byBrowser = process.env[`${browser.toUpperCase()}_REMOTE_URL`];
    return byBrowser || process.env.SELENIUM_REMOTE_URL;
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

// Factory function to create and configure an MCP server instance
const createMcpServer = () => {
    const server = new McpServer({
        name: "MCP Selenium",
        version: "1.0.0"
    });

// Browser Management Tools
server.registerTool(
    "start_browser",
    {
        description: "launches browser",
        inputSchema: {
            browser: z.enum(["chrome", "firefox", "edge"]).describe("Browser to launch (chrome or firefox or microsoft edge)"),
            options: browserOptionsSchema
        }
    },
    async ({ browser, options = {} }, { sessionId }) => {
        try {
            let builder = new Builder();
            let driver;

            const remoteUrl = getRemoteWebDriverUrl(browser);
            if (remoteUrl) {
                builder = builder.usingServer(remoteUrl);
            }

            const userProvidedArgs = options.arguments ?? [];
            
            // Helper function to merge user args with defaults
            const mergeArguments = (defaultArgs, userArgs) => {
                const merged = [...defaultArgs];
                userArgs.forEach(arg => {
                    const argKey = arg.split('=')[0];
                    const existingIndex = merged.findIndex(a => a.startsWith(argKey));
                    if (existingIndex >= 0) {
                        merged[existingIndex] = arg; // Override default
                    } else {
                        merged.push(arg); // Add new arg
                    }
                });
                return merged;
            };

            switch (browser) {
                case 'chrome': {
                    const chromeOptions = new ChromeOptions();

                    if (process.env.CHROME_BIN) {
                        chromeOptions.setChromeBinaryPath(process.env.CHROME_BIN);
                    }

                    // Chromium-specific default arguments (works locally and in Docker)
                    const defaultChromeArgs = [
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        `--user-data-dir=/tmp/selenium-profile-${randomUUID()}`
                    ];
                    
                    // Add headless to defaults if requested
                    if (options.headless) {
                        defaultChromeArgs.push('--headless=new');
                    }
                    
                    const mergedArgs = mergeArguments(defaultChromeArgs, userProvidedArgs);
                    mergedArgs.forEach((arg) => chromeOptions.addArguments(arg));

                    driver = await builder
                        .forBrowser('chrome')
                        .setChromeOptions(chromeOptions)
                        .build();
                    break;
                }
                case 'edge': {
                    const edgeOptions = new EdgeOptions();

                    // Chromium-specific default arguments (Edge is Chromium-based, works locally and in Docker)
                    const defaultEdgeArgs = [
                        '--no-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        `--user-data-dir=/tmp/selenium-profile-${randomUUID()}`
                    ];
                    
                    // Add headless to defaults if requested
                    if (options.headless) {
                        defaultEdgeArgs.push('--headless=new');
                    }
                    
                    const mergedArgs = mergeArguments(defaultEdgeArgs, userProvidedArgs);
                    mergedArgs.forEach((arg) => edgeOptions.addArguments(arg));

                    driver = await builder
                        .forBrowser(Browser.EDGE || 'MicrosoftEdge')
                        .setEdgeOptions(edgeOptions)
                        .build();
                    break;
                }
                case 'firefox': {
                    const firefoxOptions = new FirefoxOptions();
                    
                    // Firefox-specific default arguments
                    const defaultFirefoxArgs = [];
                    
                    // Add headless to defaults if requested
                    if (options.headless) {
                        defaultFirefoxArgs.push('--headless');
                    }
                    
                    // Merge with user-provided args (no Chromium defaults)
                    const mergedArgs = mergeArguments(defaultFirefoxArgs, userProvidedArgs);
                    mergedArgs.forEach((arg) => firefoxOptions.addArguments(arg));

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
            
            // Get MCP session ID first
            const mcpSessionId = sessionId || 'default';
            
            // Close existing driver for this session if present (prevents orphaned browser processes)
            const existingDriverId = state.sessionDrivers.get(mcpSessionId);
            if (existingDriverId) {
                const existingDriver = state.drivers.get(existingDriverId);
                if (existingDriver) {
                    await existingDriver.quit().catch(() => {});
                    state.drivers.delete(existingDriverId);
                }
                state.sessionDrivers.delete(mcpSessionId);
            }
            
            // Now add the new driver
            const driverSessionId = `${browser}_${Date.now()}_${randomUUID()}`;
            state.drivers.set(driverSessionId, driver);
            state.sessionDrivers.set(mcpSessionId, driverSessionId);

            return {
                content: [{ type: 'text', text: `Browser started with session_id: ${driverSessionId} (MCP session: ${mcpSessionId})` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error starting browser: ${e.message}` }]
            };
        }
    }
);

server.registerTool(
    "navigate",
    {
        description: "navigates to a URL",
        inputSchema: {
            url: z.string().describe("URL to navigate to")
        }
    },
    async ({ url }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
            await driver.get(url);
            return {
                content: [{ type: 'text', text: `Navigated to ${url}` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error navigating: ${e.message}` }]
            };
        }
    }
);

// Element Interaction Tools
server.registerTool(
    "find_element",
    {
        description: "finds an element",
        inputSchema: {
            ...locatorSchema
        }
    },
    async ({ by, value, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "click_element",
    {
        description: "clicks an element",
        inputSchema: {
            ...locatorSchema
        }
    },
    async ({ by, value, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "send_keys",
    {
        description: "sends keys to an element, aka typing",
        inputSchema: {
            ...locatorSchema,
            text: z.string().describe("Text to enter into the element")
        }
    },
    async ({ by, value, text, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "get_element_text",
    {
        description: "gets the text() of an element",
        inputSchema: {
            ...locatorSchema
        }
    },
    async ({ by, value, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "hover",
    {
        description: "moves the mouse to hover over an element",
        inputSchema: {
            ...locatorSchema
        }
    },
    async ({ by, value, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "drag_and_drop",
    {
        description: "drags an element and drops it onto another element",
        inputSchema: {
            ...locatorSchema,
            targetBy: z.enum(["id", "css", "xpath", "name", "tag", "class"]).describe("Locator strategy to find target element"),
            targetValue: z.string().describe("Value for the target locator strategy")
        }
    },
    async ({ by, value, targetBy, targetValue, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "double_click",
    {
        description: "performs a double click on an element",
        inputSchema: {
            ...locatorSchema
        }
    },
    async ({ by, value, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "right_click",
    {
        description: "performs a right click (context click) on an element",
        inputSchema: {
            ...locatorSchema
        }
    },
    async ({ by, value, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "press_key",
    {
        description: "simulates pressing a keyboard key",
        inputSchema: {
            key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'a', etc.)")
        }
    },
    async ({ key }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "upload_file",
    {
        description: "uploads a file using a file input element",
        inputSchema: {
            ...locatorSchema,
            filePath: z.string().describe("Absolute path to the file to upload")
        }
    },
    async ({ by, value, filePath, timeout = 10000 }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "take_screenshot",
    {
        description: "captures a screenshot of the current page",
        inputSchema: {
            outputPath: z.string().optional().describe("Optional path where to save the screenshot. If not provided, returns base64 data.")
        }
    },
    async ({ outputPath }, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driver = getDriver(mcpSessionId);
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

server.registerTool(
    "close_session",
    {
        description: "closes the current browser session",
        inputSchema: {}
    },
    async ({}, { sessionId }) => {
        try {
            const mcpSessionId = sessionId || 'default';
            const driverSessionId = state.sessionDrivers.get(mcpSessionId);
            
            if (!driverSessionId) {
                return {
                    content: [{ type: 'text', text: 'No active browser session for this MCP session' }]
                };
            }
            
            const driver = state.drivers.get(driverSessionId);
            if (driver) {
                await driver.quit();
                state.drivers.delete(driverSessionId);
            }
            
            state.sessionDrivers.delete(mcpSessionId);
            
            return {
                content: [{ type: 'text', text: `Browser session ${driverSessionId} closed (MCP session: ${mcpSessionId})` }]
            };
        } catch (e) {
            return {
                content: [{ type: 'text', text: `Error closing session: ${e.message}` }]
            };
        }
    }
);

// Resources
server.registerResource(
    "browser-status",
    "browser-status://current",
    {
        description: "Current active browser session status"
    },
    async (uri) => {
        const sessions = Array.from(state.sessionDrivers.entries())
            .map(([mcpId, driverId]) => `MCP session ${mcpId}: driver ${driverId}`)
            .join('\n');
        
        return {
            contents: [{
                uri: uri.href,
                text: sessions || "No active browser sessions"
            }]
        };
    }
);

    return server;
};

// Cleanup handler
async function cleanup() {
    // 1. Stop HTTP server first to prevent new connections during shutdown
    if (state.httpServer) {
        if (typeof state.httpServer.closeAllConnections === 'function') {
            state.httpServer.closeAllConnections();
        }
        await new Promise((resolve) => state.httpServer.close(resolve));
        state.httpServer = null;
    }

    // 2. Close all active transports
    for (const transport of state.streamableTransports.values()) {
        try {
            await transport.close();
        } catch (e) {
            console.error('Error closing streamable-http transport:', e);
        }
    }
    state.streamableTransports.clear();

    // 3. Close all MCP server instances (safety net for async onclose cleanup)
    for (const [sessionId, mcpServer] of state.mcpServers) {
        try {
            await mcpServer.close();
        } catch (e) {
            console.error(`Error closing MCP server for session ${sessionId}:`, e);
        }
    }
    state.mcpServers.clear();

    // 4. Quit all browser drivers
    for (const [sessionId, driver] of state.drivers) {
        try {
            await driver.quit();
        } catch (e) {
            console.error(`Error closing browser session ${sessionId}:`, e);
        }
    }
    state.drivers.clear();
    state.sessionDrivers.clear();
    process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Start the server
const config = parseServerConfig();

if (config.transport === 'stdio') {
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
} else {
    await startStreamableHttpServer(config);
}