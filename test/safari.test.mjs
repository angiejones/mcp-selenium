/**
 * Safari browser support tests.
 *
 * These tests verify that the server correctly accepts "safari" as a browser
 * option and validates it through the schema. They do NOT require Safari or
 * safaridriver to be installed — they only test the MCP layer.
 *
 * Full integration tests (actually launching Safari) require macOS with:
 *   sudo safaridriver --enable
 *   "Allow Remote Automation" enabled in Safari > Developer settings
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText } from './mcp-client.mjs';

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
    assert.ok(browserEnum.includes('safari'), `Expected "safari" in enum, got: ${JSON.stringify(browserEnum)}`);
  });

  it('should accept safari as a browser and attempt to start (may fail without safaridriver)', async () => {
    const result = await client.callTool('start_browser', {
      browser: 'safari',
    });
    const text = getResponseText(result);
    // Either it starts successfully or it fails with a driver error —
    // but it should NOT fail with a schema validation error
    assert.ok(
      text.includes('Browser started') || text.includes('Error starting browser'),
      `Expected browser start attempt, got: ${text}`
    );
    // If it did start, the error should NOT be about an invalid browser value
    if (result.isError) {
      assert.ok(
        !text.includes('Unsupported browser'),
        `"safari" should be a recognized browser, got: ${text}`
      );
    }
  });

  it('should not reject safari with headless option', async () => {
    const result = await client.callTool('start_browser', {
      browser: 'safari',
      options: { headless: true },
    });
    const text = getResponseText(result);
    // Should not fail due to the headless option itself
    assert.ok(
      text.includes('Browser started') || text.includes('Error starting browser'),
      `Expected browser start attempt, got: ${text}`
    );
    if (result.isError) {
      assert.ok(
        !text.includes('headless'),
        `Should not error on headless option, got: ${text}`
      );
    }
  });
});
