/**
 * Browser management tests — start_browser, close_session, take_screenshot,
 * multi-session handling.
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
      assert.ok(result?.content?.length >= 2, 'Should return at least 2 content entries');
      const base64 = result.content[1].text;
      assert.ok(base64.length > 100, `Expected base64 data, got ${base64.length} chars`);
    });
  });

  describe('multi-session', () => {
    it('should start a second session (replaces current)', async () => {
      // Start first session
      const first = await client.callTool('start_browser', {
        browser: 'chrome',
        options: { headless: true, arguments: ['--no-sandbox'] },
      });
      const firstText = getResponseText(first);
      const firstId = firstText.match(/session_id: (\S+)/)?.[1];
      assert.ok(firstId, `Expected session_id, got: ${firstText}`);

      // Navigate in first session
      await client.callTool('navigate', { url: fixture('locators.html') });

      // Start second session — this should become the active one
      const second = await client.callTool('start_browser', {
        browser: 'chrome',
        options: { headless: true, arguments: ['--no-sandbox'] },
      });
      const secondText = getResponseText(second);
      const secondId = secondText.match(/session_id: (\S+)/)?.[1];
      assert.ok(secondId, `Expected session_id, got: ${secondText}`);
      assert.notEqual(firstId, secondId, 'Second session should have a different ID');

      // Navigate in second session to a different page
      await client.callTool('navigate', { url: fixture('interactions.html') });

      // Close second session
      const closeResult = await client.callTool('close_session');
      const closeText = getResponseText(closeResult);
      assert.ok(closeText.includes(secondId), `Expected second session ID in close message, got: ${closeText}`);

      // First session's driver is still in the map but not current —
      // tools should error since currentSession is now null
      const result = await client.callTool('navigate', { url: fixture('locators.html') });
      const text = getResponseText(result);
      assert.ok(
        text.includes('Error') || text.includes('No active'),
        `Expected no active session error after closing, got: ${text}`
      );
    });
  });
});
