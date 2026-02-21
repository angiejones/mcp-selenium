/**
 * Navigation and element locator tests.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText } from './mcp-client.mjs';

const TEST_PAGE = `data:text/html,
<html>
<head><title>Test Page</title></head>
<body>
  <h1 id="title" class="heading">Hello World</h1>
  <p name="intro">Welcome to the test page</p>
  <p class="content">Second paragraph</p>
  <button id="btn1">Click Me</button>
  <a href="#" id="link1">Test Link</a>
  <input type="text" id="input1" name="username" />
</body>
</html>`;

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
      const result = await client.callTool('navigate', { url: TEST_PAGE });
      const text = getResponseText(result);
      assert.ok(text.includes('Navigated to'), `Expected "Navigated to", got: ${text}`);
    });

    it('should error on no active session', async () => {
      // Create a fresh client with no browser session
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
      await client.callTool('navigate', { url: TEST_PAGE });
    });

    it('should find element by id', async () => {
      const result = await client.callTool('find_element', { by: 'id', value: 'title' });
      const text = getResponseText(result);
      assert.ok(text.includes('found') || !text.includes('Error'), `Expected element found, got: ${text}`);
    });

    it('should find element by css', async () => {
      const result = await client.callTool('find_element', { by: 'css', value: '.heading' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by xpath', async () => {
      const result = await client.callTool('find_element', { by: 'xpath', value: '//button' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by name', async () => {
      const result = await client.callTool('find_element', { by: 'name', value: 'intro' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by tag (By.tagName)', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'h1' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find element by class', async () => {
      const result = await client.callTool('find_element', { by: 'class', value: 'content' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find button by tag', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'button' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should find body by tag', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'body' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should reject unsupported locator strategy via schema validation', async () => {
      // Zod enum validation rejects invalid values at the RPC level (before
      // the handler runs), so this throws an RPC error, not a tool error.
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
