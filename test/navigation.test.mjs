/**
 * Navigation and element locator tests.
 * Verifies each locator strategy finds the correct element by checking its text.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';

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
      const result = await client.callTool('navigate', { url: fixture('locators.html') });
      const text = getResponseText(result);
      assert.ok(text.includes('Navigated to'), `Expected "Navigated to", got: ${text}`);
    });

    it('should navigate to invalid URL without throwing', async () => {
      // Chrome accepts any URL and shows an error page — the navigation
      // itself succeeds. This verifies the tool doesn't crash on bad URLs.
      const result = await client.callTool('navigate', { url: 'not-a-real-protocol://bogus' });
      const text = getResponseText(result);
      assert.ok(text.includes('Navigated to'), `Expected navigation to succeed, got: ${text}`);
    });

    it('should error on no active session', async () => {
      const freshClient = new McpClient();
      await freshClient.start();
      try {
        const result = await freshClient.callTool('navigate', { url: 'https://example.com' });
        assert.strictEqual(result.isError, true, 'Expected isError: true on error response');
        const text = getResponseText(result);
        assert.ok(
          text.includes('Error') || text.includes('No active'),
          `Expected error, got: ${text}`
        );
      } finally {
        await freshClient.stop();
      }
    });
  });

  describe('find_element — locator strategies', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('locators.html') });
    });

    it('should find element by id and verify text', async () => {
      await client.callTool('find_element', { by: 'id', value: 'title' });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'title' });
      const text = getResponseText(result);
      assert.equal(text, 'Heading One');
    });

    it('should find element by css and verify text', async () => {
      await client.callTool('find_element', { by: 'css', value: '.heading' });
      const result = await client.callTool('get_element_text', { by: 'css', value: '.heading' });
      const text = getResponseText(result);
      assert.equal(text, 'Heading One');
    });

    it('should find element by xpath and verify text', async () => {
      await client.callTool('find_element', { by: 'xpath', value: '//button' });
      const result = await client.callTool('get_element_text', { by: 'xpath', value: '//button' });
      const text = getResponseText(result);
      assert.equal(text, 'Click Me');
    });

    it('should find element by name and verify text', async () => {
      await client.callTool('find_element', { by: 'name', value: 'intro-text' });
      const result = await client.callTool('get_element_text', { by: 'name', value: 'intro-text' });
      const text = getResponseText(result);
      assert.equal(text, 'Intro paragraph');
    });

    it('should find element by class and verify text', async () => {
      await client.callTool('find_element', { by: 'class', value: 'content' });
      const result = await client.callTool('get_element_text', { by: 'class', value: 'content' });
      const text = getResponseText(result);
      assert.equal(text, 'Second paragraph');
    });

    it('should find nested element by css and verify text', async () => {
      await client.callTool('find_element', { by: 'css', value: '#nested .inner' });
      const result = await client.callTool('get_element_text', { by: 'css', value: '#nested .inner' });
      const text = getResponseText(result);
      assert.equal(text, 'Nested element');
    });
  });

  describe('find_element — tag locator (By.tagName)', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('locators.html') });
    });

    it('should find h1 by tag and verify text', async () => {
      await client.callTool('find_element', { by: 'tag', value: 'h1' });
      const result = await client.callTool('get_element_text', { by: 'tag', value: 'h1' });
      const text = getResponseText(result);
      assert.equal(text, 'Heading One');
    });

    it('should find button by tag and verify text', async () => {
      await client.callTool('find_element', { by: 'tag', value: 'button' });
      const result = await client.callTool('get_element_text', { by: 'tag', value: 'button' });
      const text = getResponseText(result);
      assert.equal(text, 'Click Me');
    });

    it('should find anchor by tag and verify text', async () => {
      await client.callTool('find_element', { by: 'tag', value: 'a' });
      const result = await client.callTool('get_element_text', { by: 'tag', value: 'a' });
      const text = getResponseText(result);
      assert.equal(text, 'Test Link');
    });

    it('should find input by tag', async () => {
      const result = await client.callTool('find_element', { by: 'tag', value: 'input' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('find_element — error cases', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('locators.html') });
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
      assert.strictEqual(result.isError, true, 'Expected isError: true on error response');
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error, got: ${text}`);
    });
  });
});
