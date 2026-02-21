/**
 * Element interaction tests — click, send_keys, get_element_text,
 * hover, double_click, right_click, press_key, drag_and_drop.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText } from './mcp-client.mjs';

// Short data URIs to avoid Chrome truncation
const INTERACTION_PAGE = `data:text/html,<input id="t"><button id="b" onclick="document.getElementById('o').textContent='clicked'">Go</button><div id="o"></div><p id="p">Hello</p>`;
const MOUSE_PAGE = `data:text/html,<div id="h" onmouseover="this.textContent='hovered'">H</div><div id="d" ondblclick="this.textContent='dbl'">D</div><div id="r" oncontextmenu="this.textContent='ctx';return false">R</div>`;
const DRAG_PAGE = `data:text/html,<div id="a" draggable="true">Drag</div><div id="b2">Drop</div>`;

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
      await client.callTool('navigate', { url: INTERACTION_PAGE });
    });

    it('should click a button', async () => {
      const result = await client.callTool('click_element', { by: 'id', value: 'b' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should error when element not found', async () => {
      const result = await client.callTool('click_element', { by: 'id', value: 'nonexistent' });
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error, got: ${text}`);
    });
  });

  describe('send_keys', () => {
    before(async () => {
      await client.callTool('navigate', { url: INTERACTION_PAGE });
    });

    it('should type text into an input', async () => {
      const result = await client.callTool('send_keys', {
        by: 'id',
        value: 't',
        text: 'hello world',
      });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should clear and retype (default behavior)', async () => {
      const result = await client.callTool('send_keys', {
        by: 'id',
        value: 't',
        text: 'new text',
      });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('get_element_text', () => {
    before(async () => {
      await client.callTool('navigate', { url: INTERACTION_PAGE });
    });

    it('should return text content of an element', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'p',
      });
      const text = getResponseText(result);
      assert.ok(text.includes('Hello'), `Expected "Hello", got: ${text}`);
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
      await client.callTool('navigate', { url: MOUSE_PAGE });
    });

    it('should hover over an element', async () => {
      const result = await client.callTool('hover', { by: 'id', value: 'h' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('double_click', () => {
    before(async () => {
      await client.callTool('navigate', { url: MOUSE_PAGE });
    });

    it('should double-click an element', async () => {
      const result = await client.callTool('double_click', { by: 'id', value: 'd' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('right_click', () => {
    before(async () => {
      await client.callTool('navigate', { url: MOUSE_PAGE });
    });

    it('should right-click an element', async () => {
      const result = await client.callTool('right_click', { by: 'id', value: 'r' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('press_key', () => {
    before(async () => {
      await client.callTool('navigate', { url: INTERACTION_PAGE });
      await client.callTool('click_element', { by: 'id', value: 't' });
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
      await client.callTool('navigate', { url: DRAG_PAGE });
    });

    it('should attempt drag and drop between elements', async () => {
      const result = await client.callTool('drag_and_drop', {
        by: 'id',
        value: 'a',
        targetBy: 'id',
        targetValue: 'b2',
      });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });
});
