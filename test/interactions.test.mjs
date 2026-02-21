/**
 * Element interaction tests — click, send_keys, get_element_text,
 * hover, double_click, right_click, press_key, drag_and_drop.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';

describe('Element Interactions', () => {
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

  describe('click_element', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('should click a button', async () => {
      const result = await client.callTool('click_element', { by: 'id', value: 'btn' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should verify click had effect', async () => {
      const result = await client.callTool('get_element_text', { by: 'id', value: 'output' });
      const text = getResponseText(result);
      assert.ok(text.includes('clicked'), `Expected "clicked" in output, got: ${text}`);
    });

    it('should error when element not found', async () => {
      const result = await client.callTool('click_element', { by: 'id', value: 'nonexistent' });
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error, got: ${text}`);
    });
  });

  describe('send_keys', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('should type text into an input', async () => {
      const result = await client.callTool('send_keys', {
        by: 'id',
        value: 'textbox',
        text: 'hello world',
      });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should clear and retype (default behavior)', async () => {
      const result = await client.callTool('send_keys', {
        by: 'id',
        value: 'textbox',
        text: 'new text',
      });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('get_element_text', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('should return text content of an element', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'text-content',
      });
      const text = getResponseText(result);
      assert.ok(text.includes('This is some text content'), `Expected text content, got: ${text}`);
    });

    it('should error when element not found', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'nonexistent',
      });
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error, got: ${text}`);
    });
  });

  describe('hover', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('mouse-actions.html') });
    });

    it('should hover over an element', async () => {
      const result = await client.callTool('hover', { by: 'id', value: 'hover-target' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('double_click', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('mouse-actions.html') });
    });

    it('should double-click an element', async () => {
      const result = await client.callTool('double_click', { by: 'id', value: 'dblclick-target' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('right_click', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('mouse-actions.html') });
    });

    it('should right-click an element', async () => {
      const result = await client.callTool('right_click', { by: 'id', value: 'rclick-target' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('press_key', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
      await client.callTool('click_element', { by: 'id', value: 'textbox' });
    });

    it('should press a single character key', async () => {
      const result = await client.callTool('press_key', { key: 'a' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should press Enter by name', async () => {
      const result = await client.callTool('press_key', { key: 'Enter' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should press Tab by name', async () => {
      const result = await client.callTool('press_key', { key: 'Tab' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should press Escape by name', async () => {
      const result = await client.callTool('press_key', { key: 'Escape' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should handle case-insensitive key names', async () => {
      const result = await client.callTool('press_key', { key: 'enter' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should error on unknown key name', async () => {
      const result = await client.callTool('press_key', { key: 'FakeKey' });
      const text = getResponseText(result);
      assert.ok(text.includes('Error') && text.includes('Unknown key name'), `Expected unknown key error, got: ${text}`);
    });
  });

  describe('drag_and_drop', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('drag-drop.html') });
    });

    it('should drag and drop between elements', async () => {
      const result = await client.callTool('drag_and_drop', {
        by: 'id',
        value: 'draggable',
        targetBy: 'id',
        targetValue: 'droppable',
      });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });
});
