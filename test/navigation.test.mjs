/**
 * Navigation and element locator tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText } from './mcp-client.mjs';

// Keep data URIs short — long ones get truncated by Chrome
const LOCATOR_PAGE = `data:text/html,<h1 id="t" class="h" name="n">Hi</h1><p>Text</p><a href="x">Link</a><input id="i"><button>Go</button>`;

describe('Navigation & Element Locators', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', {
      browser: 'chrome',
      options: { headless: true, arguments: ['--no-sandbox', '--disable-dev-shm-usage'] },
    });
  });

  after(async () => {
    try { await client.callTool('close_session'); } catch { /* ignore */ }
    await client.stop();
  });

  describe('navigate', () => {
    it('should navigate to a URL', async () => {
      const result = await client.callTool('navigate', { url: LOCATOR_PAGE });
      const text = getResponseText(result);
      assert.ok(text.includes('Navigated to'), `Expected "Navigated to", got: ${text}`);
    });

    it('should error on no active session', async () => {
      const freshClient = new McpClient();
      await freshClient.start();
      const result = await freshClient.callTool('navigate', { url: 'https://example.com' });
      const text = getResponseText(result);
      assert.ok(
        text.includes('Error') || text.includes('No active'),
        `Expected error, got: ${text}`
      );
      await freshClient.stop();
    });
  });

  describe('find_element', () => {
    before(async () => {
      await client.callTool('navigate', { url: LOCATOR_PAGE });
    });

    it('should find element by id', async () => {
      const result = await client.callTool('find_element', { by: 'id', value: 't' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by css', async () => {
      const result = await client.callTool('find_element', { by: 'css', value: '.h' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by xpath', async () => {
      const result = await client.callTool('find_element', { by: 'xpath', value: '//button' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by name', async () => {
      const result = await client.callTool('find_element', { by: 'name', value: 'n' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by tag — h1', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'h1' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by tag — a', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'a' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by tag — input', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'input' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by tag — button', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'button' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by class', async () => {
      const result = await client.callTool('find_element', { by: 'class', value: 'h' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should reject unsupported locator strategy via schema validation', async () => {
      await assert.rejects(
        () => client.callTool('find_element', { by: 'invalid', value: 'test' }),
        (err) => {
          assert.ok(err.message.includes('invalid_enum_value') || err.message.includes('Invalid'),
            `Expected validation error, got: ${err.message}`);
          return true;
        }
      );
    });

    it('should error when element not found', async () => {
      const result = await client.callTool('find_element', { by: 'id', value: 'nonexistent' });
      const text = getResponseText(result);
      assert.ok(text.includes('Error') || text.includes('not found'), `Expected error, got: ${text}`);
    });
  });
});
