/**
 * Browser management tests — start_browser, close_session, take_screenshot.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';

describe('Browser Management', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
  });

  after(async () => {
    // Ensure browser is closed even if tests fail
    try { await client.callTool('close_session'); } catch { /* ignore */ }
    await client.stop();
  });

  describe('start_browser', () => {
    after(async () => {
      try { await client.callTool('close_session'); } catch { /* ignore */ }
    });

    it('should start a headless Chrome session', async () => {
      const result = await client.callTool('start_browser', {
        browser: 'chrome',
        options: { headless: true, arguments: ['--no-sandbox', '--disable-dev-shm-usage'] },
      });
      const text = getResponseText(result);
      assert.ok(text.includes('Browser started'), `Expected "Browser started", got: ${text}`);
      assert.ok(text.includes('session_id:'), `Expected session_id in response, got: ${text}`);
    });
  });

  describe('close_session', () => {
    it('should close an active session', async () => {
      // Start a session first
      await client.callTool('start_browser', {
        browser: 'chrome',
        options: { headless: true, arguments: ['--no-sandbox'] },
      });

      const result = await client.callTool('close_session');
      const text = getResponseText(result);
      assert.ok(text.includes('closed'), `Expected "closed" in response, got: ${text}`);
    });

    it('should error when no active session exists', async () => {
      const result = await client.callTool('close_session');
      const text = getResponseText(result);
      assert.ok(
        text.includes('Error') || text.includes('No active'),
        `Expected error message, got: ${text}`
      );
    });
  });

  describe('take_screenshot', () => {
    before(async () => {
      await client.callTool('start_browser', {
        browser: 'chrome',
        options: { headless: true, arguments: ['--no-sandbox'] },
      });
      await client.callTool('navigate', { url: fixture('locators.html') });
    });

    after(async () => {
      try { await client.callTool('close_session'); } catch { /* ignore */ }
    });

    it('should capture a screenshot and return base64 data', async () => {
      const result = await client.callTool('take_screenshot');
      // Screenshot returns two text entries: a label and the base64 string
      assert.ok(result?.content?.length >= 2, 'Should return at least 2 content entries');
      const base64 = result.content[1].text;
      assert.ok(base64.length > 100, `Expected base64 data, got ${base64.length} chars`);
    });
  });
});
