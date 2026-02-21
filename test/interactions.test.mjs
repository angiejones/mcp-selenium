/**
 * Element interaction tests — click, send_keys, get_element_text,
 * hover, double_click, right_click, press_key, drag_and_drop, upload_file.
 *
 * Every interaction is verified by checking the resulting DOM state.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_FILE = join(__dirname, 'fixtures', 'test-upload.txt');

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

    it('should click a button and verify the effect', async () => {
      await client.callTool('click_element', { by: 'id', value: 'btn' });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'output' });
      const text = getResponseText(result);
      assert.equal(text, 'clicked');
    });

    it('should not trigger click on a disabled button', async () => {
      await client.callTool('click_element', { by: 'id', value: 'disabled-btn' });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'disabled-output' });
      const text = getResponseText(result);
      assert.equal(text, '', 'Disabled button click should not produce output');
    });

    it('should error when element not found', async () => {
      const result = await client.callTool('click_element', { by: 'id', value: 'nonexistent' });
      assert.strictEqual(result.isError, true, 'Expected isError: true on error response');
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error, got: ${text}`);
    });
  });

  describe('send_keys', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('should type text and verify via mirror element', async () => {
      await client.callTool('send_keys', {
        by: 'id',
        value: 'textbox',
        text: 'hello world',
      });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'textbox-mirror' });
      const text = getResponseText(result);
      assert.equal(text, 'hello world');
    });

    it('should clear previous text and retype', async () => {
      await client.callTool('send_keys', {
        by: 'id',
        value: 'textbox',
        text: 'replaced',
      });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'textbox-mirror' });
      const text = getResponseText(result);
      assert.equal(text, 'replaced');
    });

    it('should error when targeting a non-input element', async () => {
      const result = await client.callTool('send_keys', {
        by: 'id',
        value: 'not-an-input',
        text: 'should fail',
      });
      assert.strictEqual(result.isError, true, 'Expected isError: true on error response');
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error sending keys to div, got: ${text}`);
    });
  });

  describe('get_element_text', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('should return exact text content', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'text-content',
      });
      const text = getResponseText(result);
      assert.equal(text, 'This is some text content');
    });

    it('should return empty string for empty element', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'output',
      });
      const text = getResponseText(result);
      assert.equal(text, '');
    });

    it('should error when element not found', async () => {
      const result = await client.callTool('get_element_text', {
        by: 'id',
        value: 'nonexistent',
      });
      assert.strictEqual(result.isError, true, 'Expected isError: true on error response');
      const text = getResponseText(result);
      assert.ok(text.includes('Error'), `Expected error, got: ${text}`);
    });
  });

  describe('hover', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('mouse-actions.html') });
    });

    it('should hover and verify text changed', async () => {
      await client.callTool('hover', { by: 'id', value: 'hover-target' });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'hover-target' });
      const text = getResponseText(result);
      assert.equal(text, 'hovered');
    });
  });

  describe('double_click', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('mouse-actions.html') });
    });

    it('should double-click and verify text changed', async () => {
      await client.callTool('double_click', { by: 'id', value: 'dblclick-target' });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'dblclick-target' });
      const text = getResponseText(result);
      assert.equal(text, 'double-clicked');
    });
  });

  describe('right_click', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('mouse-actions.html') });
    });

    it('should right-click and verify text changed', async () => {
      await client.callTool('right_click', { by: 'id', value: 'rclick-target' });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'rclick-target' });
      const text = getResponseText(result);
      assert.equal(text, 'right-clicked');
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
      assert.ok(text.includes("Key 'a' pressed"), `Expected success, got: ${text}`);
    });

    it('should press Enter by name', async () => {
      const result = await client.callTool('press_key', { key: 'Enter' });
      const text = getResponseText(result);
      assert.ok(text.includes("Key 'Enter' pressed"), `Expected success, got: ${text}`);
    });

    it('should press Tab by name', async () => {
      const result = await client.callTool('press_key', { key: 'Tab' });
      const text = getResponseText(result);
      assert.ok(text.includes("Key 'Tab' pressed"), `Expected success, got: ${text}`);
    });

    it('should press Escape by name', async () => {
      const result = await client.callTool('press_key', { key: 'Escape' });
      const text = getResponseText(result);
      assert.ok(text.includes("Key 'Escape' pressed"), `Expected success, got: ${text}`);
    });

    it('should handle case-insensitive key names', async () => {
      const result = await client.callTool('press_key', { key: 'enter' });
      const text = getResponseText(result);
      assert.ok(text.includes("Key 'enter' pressed"), `Expected success, got: ${text}`);
    });

    it('should press arrow keys', async () => {
      const result = await client.callTool('press_key', { key: 'Arrow_Left' });
      const text = getResponseText(result);
      assert.ok(text.includes("Key 'Arrow_Left' pressed"), `Expected success, got: ${text}`);
    });

    it('should error on unknown key name', async () => {
      const result = await client.callTool('press_key', { key: 'FakeKey' });
      assert.strictEqual(result.isError, true, 'Expected isError: true on error response');
      const text = getResponseText(result);
      assert.ok(text.includes('Unknown key name'), `Expected unknown key error, got: ${text}`);
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

  describe('upload_file', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('upload.html') });
    });

    it('should upload a file and verify filename appears', async () => {
      await client.callTool('upload_file', {
        by: 'id',
        value: 'file-input',
        filePath: UPLOAD_FILE,
      });
      const result = await client.callTool('get_element_text', { by: 'id', value: 'file-name' });
      const text = getResponseText(result);
      assert.equal(text, 'test-upload.txt');
    });
  });
});
