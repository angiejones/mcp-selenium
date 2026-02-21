/**
 * Safari browser support tests.
 *
 * Integration tests require macOS with:
 *   sudo safaridriver --enable
 *   SAFARI_AVAILABLE=1 npm test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText } from './mcp-client.mjs';

const safariAvailable = process.platform === 'darwin' && process.env.SAFARI_AVAILABLE === '1';

describe('Safari Browser Support', () => {
    let client;
    let tools;

    before(async () => {
        client = new McpClient();
        await client.start();
        tools = await client.listTools();
    });

    after(async () => {
        try { await client.callTool('close_session'); } catch { /* ignore */ }
        await client.stop();
    });

    it('should include "safari" in the start_browser browser enum', () => {
        const startBrowser = tools.find(t => t.name === 'start_browser');
        assert.ok(startBrowser, 'start_browser tool should exist');
        const browserEnum = startBrowser.inputSchema.properties.browser.enum;
        assert.ok(browserEnum.includes('safari'),
            `Expected "safari" in enum, got: ${JSON.stringify(browserEnum)}`);
    });

    it('should surface warnings for unsupported options', { skip: !safariAvailable && 'safaridriver not available' }, async () => {
        const result = await client.callTool('start_browser', {
            browser: 'safari',
            options: { headless: true, arguments: ['--some-flag'] },
        });
        const text = getResponseText(result);
        assert.ok(!result.isError, `Expected success, got error: ${text}`);
        assert.ok(text.includes('Browser started'), `Expected browser to start, got: ${text}`);
        assert.ok(text.includes('does not support headless'),
            `Expected headless warning in response, got: ${text}`);
        assert.ok(text.includes('does not support custom arguments'),
            `Expected arguments warning in response, got: ${text}`);
    });
});
