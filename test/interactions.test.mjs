/**
 * Element interaction tests — click, send_keys, get_element_text,
 * hover, double_click, right_click, press_key.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText } from './mcp-client.mjs';

const INTERACTION_PAGE = `data:text/html,
<html>
<head><title>Interaction Tests</title></head>
<body>
  <h1 id="title">Interaction Page</h1>
  <input type="text" id="textbox" name="textbox" />
  <button id="btn" onclick="document.getElementById('output').textContent='clicked'">Click Me</button>
  <div id="output"></div>
  <div id="hover-target" onmouseover="this.textContent='hovered'">Hover here</div>
  <div id="dblclick-target" ondblclick="this.textContent='double-clicked'">Double-click here</div>
  <div id="rclick-target" oncontextmenu="this.textContent='right-clicked'; return false;">Right-click here</div>
  <div id="draggable" draggable="true">Drag me</div>
  <div id="droppable">Drop here</div>
  <p id="text-content">This is some text content</p>
</body>
</html>`;

describe('Element Interactions', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', {
      browser: 'chrome',
      options: { headless: true, arguments: ['--no-sandbox', '--disable-dev-shm-usage'] },
    });
    await client.callTool('navigate', { url: INTERACTION_PAGE });
  });

  after(async () => {
    try { await client.callTool('close_session'); } catch { /* ignore */ }
    await client.stop();
  });

  describe('click_element', () => {
    it('should click a button', async () => {
      const result = await client.callTool('click_element', { by: 'id', value: 'btn' });
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
      // send_keys calls clear() first, so this should replace previous text
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
    it('should return text content of an element', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'text-content',
      });
      const text = getResponseText(result);
      assert.ok(
        text.includes('This is some text content'),
        `Expected text content, got: ${text}`
      );
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
    it('should hover over an element', async () => {
      const result = await client.callTool('hover', { by: 'id', value: 'hover-target' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('double_click', () => {
    it('should double-click an element', async () => {
      const result = await client.callTool('double_click', { by: 'id', value: 'dblclick-target' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('right_click', () => {
    it('should right-click an element', async () => {
      const result = await client.callTool('right_click', { by: 'id', value: 'rclick-target' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });

  describe('press_key', () => {
    it('should press a single character key', async () => {
      // Focus the input first
      await client.callTool('click_element', { by: 'id', value: 'textbox' });
      const result = await client.callTool('press_key', { key: 'a' });
      const text = getResponseText(result);
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });

    it('should error on multi-character key names (known limitation)', async () => {
      // The press_key tool passes the raw string to Selenium's keyDown(),
      // which only accepts single Unicode code points. Named keys like
      // "Enter" are not mapped to Key constants — this is a known bug.
      const result = await client.callTool('press_key', { key: 'Enter' });
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error for named key, got: ${text}`);
    });
  });

  describe('drag_and_drop', () => {
    it('should attempt drag and drop between elements', async () => {
      const result = await client.callTool('drag_and_drop', {
        by: 'id',
        value: 'draggable',
        targetBy: 'id',
        targetValue: 'droppable',
      });
      const text = getResponseText(result);
      // Drag and drop may or may not fully work in headless, but it shouldn't error
      assert.ok(!text.includes('Error'), `Expected success, got: ${text}`);
    });
  });
});
