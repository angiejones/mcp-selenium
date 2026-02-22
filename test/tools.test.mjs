/**
 * Tests for get_element_attribute, execute_script, execute_script drag-and-drop,
 * window, frame, and alert tools.
 *
 * Uses a single MCP client/server for the entire file to avoid process-lifecycle
 * races that cause intermittent timeouts when many clients start/stop in sequence.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';

describe('tools', () => {
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
    try { await client.callTool('close_session', {}); } catch { /* ignore */ }
    await client.stop();
  });

  // ─── get_element_attribute ────────────────────────────────────────────────

  describe('get_element_attribute', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('gets an attribute value from an element', async () => {
      const result = await client.callTool('get_element_attribute', { by: 'id', value: 'textbox', attribute: 'type' });
      assert.equal(getResponseText(result), 'text');
    });

    it('gets the name attribute', async () => {
      const result = await client.callTool('get_element_attribute', { by: 'id', value: 'textbox', attribute: 'name' });
      assert.equal(getResponseText(result), 'textbox');
    });
  });

  // ─── execute_script ───────────────────────────────────────────────────────

  describe('execute_script', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('interactions.html') });
    });

    it('executes script and returns a string result', async () => {
      const result = await client.callTool('execute_script', { script: 'return document.title;' });
      assert.equal(getResponseText(result), 'Interaction Test Page');
    });

    it('executes script and returns a numeric result', async () => {
      const result = await client.callTool('execute_script', { script: 'return 42;' });
      assert.equal(getResponseText(result), '42');
    });

    it('executes script with no return value', async () => {
      const result = await client.callTool('execute_script', { script: 'document.title = "modified";' });
      assert.equal(getResponseText(result), 'Script executed (no return value)');
    });

    it('returns object results as JSON', async () => {
      const result = await client.callTool('execute_script', { script: 'return {a: 1, b: 2};' });
      const parsed = JSON.parse(getResponseText(result));
      assert.deepEqual(parsed, { a: 1, b: 2 });
    });

    it('executes script with arguments', async () => {
      const result = await client.callTool('execute_script', { script: 'return arguments[0] + arguments[1];', args: [10, 32] });
      assert.equal(getResponseText(result), '42');
    });

    it('returns error for invalid script', async () => {
      const result = await client.callTool('execute_script', { script: 'return undefinedVariable.property;' });
      assert.equal(result.isError, true);
    });
  });

  // ─── execute_script — drag and drop via JS ────────────────────────────────

  describe('execute_script — drag and drop', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('drag-drop.html') });
    });

    it('should perform drag and drop using execute_script and verify the result', async () => {
      const script = `
        const src = document.getElementById('draggable');
        const tgt = document.getElementById('droppable');
        const dataTransfer = new DataTransfer();

        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
        tgt.dispatchEvent(new DragEvent('dragover',  { bubbles: true, dataTransfer }));
        tgt.dispatchEvent(new DragEvent('drop',      { bubbles: true, dataTransfer }));
        src.dispatchEvent(new DragEvent('dragend',   { bubbles: true, dataTransfer }));
      `;
      const execResult = await client.callTool('execute_script', { script });
      assert.ok(!execResult.isError, `Script failed: ${getResponseText(execResult)}`);

      const result = await client.callTool('get_element_text', { by: 'id', value: 'result' });
      assert.equal(getResponseText(result), 'dropped');
    });
  });

  // ─── Window/Tab Management ────────────────────────────────────────────────

  describe('window management', () => {
    before(async () => {
      // Close any extra windows left by previous tests, keeping only one
      let result = await client.callTool('window', { action: 'list' });
      let data = JSON.parse(getResponseText(result));
      while (data.all.length > 1) {
        await client.callTool('window', { action: 'switch', handle: data.all[data.all.length - 1] });
        await client.callTool('window', { action: 'close' });
        result = await client.callTool('window', { action: 'list' });
        data = JSON.parse(getResponseText(result));
      }
      await client.callTool('navigate', { url: fixture('windows.html') });
    });

    it('window list returns current handle', async () => {
      const result = await client.callTool('window', { action: 'list' });
      const data = JSON.parse(getResponseText(result));
      assert.ok(data.current);
      assert.ok(Array.isArray(data.all));
      assert.equal(data.all.length, 1);
      assert.equal(data.current, data.all[0]);
    });

    it('window switch_latest after opening new tab', async () => {
      await client.callTool('execute_script', { script: "window.open('about:blank', '_blank');" });

      let result = await client.callTool('window', { action: 'list' });
      const data = JSON.parse(getResponseText(result));
      assert.equal(data.all.length, 2);

      result = await client.callTool('window', { action: 'switch_latest' });
      assert.ok(getResponseText(result).includes('Switched to latest window'));

      result = await client.callTool('window', { action: 'list' });
      const afterSwitch = JSON.parse(getResponseText(result));
      assert.equal(afterSwitch.current, data.all[1]);
    });

    it('window switch switches back to original', async () => {
      let result = await client.callTool('window', { action: 'list' });
      const data = JSON.parse(getResponseText(result));
      const original = data.all[0];

      result = await client.callTool('window', { action: 'switch', handle: original });
      assert.ok(getResponseText(result).includes('Switched to window'));

      result = await client.callTool('window', { action: 'list' });
      const afterSwitch = JSON.parse(getResponseText(result));
      assert.equal(afterSwitch.current, original);
    });

    it('window close closes tab and switches back', async () => {
      let result = await client.callTool('window', { action: 'list' });
      const data = JSON.parse(getResponseText(result));
      assert.equal(data.all.length, 2);

      await client.callTool('window', { action: 'switch', handle: data.all[1] });

      result = await client.callTool('window', { action: 'close' });
      assert.ok(getResponseText(result).includes('Window closed'));

      result = await client.callTool('window', { action: 'list' });
      const after = JSON.parse(getResponseText(result));
      assert.equal(after.all.length, 1);
    });

    it('window switch returns error for invalid handle', async () => {
      const result = await client.callTool('window', { action: 'switch', handle: 'invalid-handle-xyz' });
      assert.equal(result.isError, true);
    });
  });

  // ─── Frame Management ─────────────────────────────────────────────────────

  describe('frame management', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('frames.html') });
    });

    it('frame switch by id and read content', async () => {
      let result = await client.callTool('frame', { action: 'switch', by: 'id', value: 'test-frame' });
      assert.equal(getResponseText(result), 'Switched to frame');

      result = await client.callTool('get_element_text', { by: 'id', value: 'frame-text' });
      assert.equal(getResponseText(result), 'Inside the frame');
    });

    it('frame default returns to main page', async () => {
      let result = await client.callTool('frame', { action: 'default' });
      assert.equal(getResponseText(result), 'Switched to default content');

      result = await client.callTool('get_element_text', { by: 'id', value: 'main-heading' });
      assert.equal(getResponseText(result), 'Main Page');
    });

    it('frame switch by index', async () => {
      let result = await client.callTool('frame', { action: 'switch', index: 0 });
      assert.equal(getResponseText(result), 'Switched to frame');

      result = await client.callTool('get_element_text', { by: 'id', value: 'frame-text' });
      assert.equal(getResponseText(result), 'Inside the frame');

      await client.callTool('frame', { action: 'default' });
    });

    it('frame switch returns error when no locator or index provided', async () => {
      const result = await client.callTool('frame', { action: 'switch' });
      assert.equal(result.isError, true);
    });
  });

  // ─── Alert/Dialog Handling ────────────────────────────────────────────────

  describe('alert handling', () => {
    before(async () => {
      await client.callTool('navigate', { url: fixture('alerts.html') });
    });

    it('alert get_text reads alert message and accept closes it', async () => {
      await client.callTool('interact', { action: 'click', by: 'id', value: 'alert-btn' });
      const result = await client.callTool('alert', { action: 'get_text' });
      assert.equal(getResponseText(result), 'Hello from alert!');

      const acceptResult = await client.callTool('alert', { action: 'accept' });
      assert.equal(getResponseText(acceptResult), 'Alert accepted');
    });

    it('alert accept accepts a fresh alert and verifies DOM effect', async () => {
      await client.callTool('interact', { action: 'click', by: 'id', value: 'alert-btn' });
      const result = await client.callTool('alert', { action: 'accept' });
      assert.equal(getResponseText(result), 'Alert accepted');

      const status = await client.callTool('get_element_text', { by: 'id', value: 'alert-result' });
      assert.equal(getResponseText(status), 'alerted');
    });

    it('alert dismiss cancels a confirm dialog', async () => {
      await client.callTool('interact', { action: 'click', by: 'id', value: 'confirm-btn' });
      const result = await client.callTool('alert', { action: 'dismiss' });
      assert.equal(getResponseText(result), 'Alert dismissed');

      const text = await client.callTool('get_element_text', { by: 'id', value: 'confirm-result' });
      assert.equal(getResponseText(text), 'cancelled');
    });

    it('alert accept confirms a confirm dialog', async () => {
      await client.callTool('interact', { action: 'click', by: 'id', value: 'confirm-btn' });
      const result = await client.callTool('alert', { action: 'accept' });
      assert.equal(getResponseText(result), 'Alert accepted');

      const text = await client.callTool('get_element_text', { by: 'id', value: 'confirm-result' });
      assert.equal(getResponseText(text), 'confirmed');
    });

    it('alert send_text types into a prompt and accepts', async () => {
      await client.callTool('interact', { action: 'click', by: 'id', value: 'prompt-btn' });
      const result = await client.callTool('alert', { action: 'send_text', text: 'Angie' });
      assert.ok(getResponseText(result).includes('sent to prompt'));

      const text = await client.callTool('get_element_text', { by: 'id', value: 'prompt-result' });
      assert.equal(getResponseText(text), 'Angie');
    });

    it('alert accept returns error when no alert present', async () => {
      const result = await client.callTool('alert', { action: 'accept', timeout: 1000 });
      assert.equal(result.isError, true);
    });
  });
});
