import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';

// ─── clear_element ──────────────────────────────────────────────────────────

describe('clear_element', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('interactions.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
  });

  it('clears an input field', async () => {
    // Type something first
    await client.callTool('send_keys', { by: 'id', value: 'textbox', text: 'hello world' });
    // Verify text was entered
    let result = await client.callTool('execute_script', { script: "return document.getElementById('textbox').value;" });
    assert.equal(getResponseText(result), 'hello world');
    // Clear it
    result = await client.callTool('clear_element', { by: 'id', value: 'textbox' });
    assert.equal(getResponseText(result), 'Element cleared');
    // Verify it's empty
    result = await client.callTool('execute_script', { script: "return document.getElementById('textbox').value;" });
    assert.equal(getResponseText(result), '');
  });

  it('returns error for non-existent element', async () => {
    const result = await client.callTool('clear_element', { by: 'id', value: 'nonexistent', timeout: 1000 });
    assert.equal(result.isError, true);
  });
});

// ─── get_element_attribute ──────────────────────────────────────────────────

describe('get_element_attribute', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('interactions.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
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

// ─── scroll_to_element ──────────────────────────────────────────────────────

describe('scroll_to_element', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('scroll.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
  });

  it('scrolls to an element at the bottom of the page', async () => {
    // Verify we start at the top
    let result = await client.callTool('execute_script', { script: 'return window.scrollY;' });
    assert.equal(getResponseText(result), '0');

    // Scroll to bottom element
    result = await client.callTool('scroll_to_element', { by: 'id', value: 'bottom-element' });
    assert.equal(getResponseText(result), 'Scrolled to element');

    // Verify we scrolled down
    result = await client.callTool('execute_script', { script: 'return window.scrollY > 0;' });
    assert.equal(getResponseText(result), 'true');
  });

  it('returns error for non-existent element', async () => {
    const result = await client.callTool('scroll_to_element', { by: 'id', value: 'nonexistent', timeout: 1000 });
    assert.equal(result.isError, true);
  });
});

// ─── execute_script ─────────────────────────────────────────────────────────

describe('execute_script', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('interactions.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
  });

  it('executes script and returns a string result', async () => {
    const result = await client.callTool('execute_script', { script: 'return document.title;' });
    assert.ok(getResponseText(result).length > 0);
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

  it('returns error for invalid script', async () => {
    const result = await client.callTool('execute_script', { script: 'return undefinedVariable.property;' });
    assert.equal(result.isError, true);
  });
});

// ─── Window/Tab Management ──────────────────────────────────────────────────

describe('window management', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('windows.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
  });

  it('get_window_handles returns current handle', async () => {
    const result = await client.callTool('get_window_handles');
    const data = JSON.parse(getResponseText(result));
    assert.ok(data.current);
    assert.ok(Array.isArray(data.all));
    assert.equal(data.all.length, 1);
    assert.equal(data.current, data.all[0]);
  });

  it('switch_to_latest_window after opening new tab', async () => {
    // Open a new window via script
    await client.callTool('execute_script', { script: "window.open('about:blank', '_blank');" });

    // Should now have 2 handles
    let result = await client.callTool('get_window_handles');
    const data = JSON.parse(getResponseText(result));
    assert.equal(data.all.length, 2);

    // Switch to latest
    result = await client.callTool('switch_to_latest_window');
    assert.ok(getResponseText(result).includes('Switched to latest window'));

    // Verify we're on the new window
    result = await client.callTool('get_window_handles');
    const afterSwitch = JSON.parse(getResponseText(result));
    assert.equal(afterSwitch.current, data.all[1]);
  });

  it('switch_to_window switches back to original', async () => {
    let result = await client.callTool('get_window_handles');
    const data = JSON.parse(getResponseText(result));
    const original = data.all[0];

    result = await client.callTool('switch_to_window', { handle: original });
    assert.ok(getResponseText(result).includes('Switched to window'));

    result = await client.callTool('get_window_handles');
    const afterSwitch = JSON.parse(getResponseText(result));
    assert.equal(afterSwitch.current, original);
  });

  it('close_current_window closes tab and switches back', async () => {
    // Switch to the second window first
    let result = await client.callTool('get_window_handles');
    const data = JSON.parse(getResponseText(result));
    assert.equal(data.all.length, 2);

    await client.callTool('switch_to_window', { handle: data.all[1] });

    // Close it
    result = await client.callTool('close_current_window');
    assert.ok(getResponseText(result).includes('Window closed'));

    // Should be back to 1 window
    result = await client.callTool('get_window_handles');
    const after = JSON.parse(getResponseText(result));
    assert.equal(after.all.length, 1);
  });

  it('switch_to_window returns error for invalid handle', async () => {
    const result = await client.callTool('switch_to_window', { handle: 'invalid-handle-xyz' });
    assert.equal(result.isError, true);
  });
});

// ─── Frame Management ───────────────────────────────────────────────────────

describe('frame management', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('frames.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
  });

  it('switch_to_frame by id and read content', async () => {
    let result = await client.callTool('switch_to_frame', { by: 'id', value: 'test-frame' });
    assert.equal(getResponseText(result), 'Switched to frame');

    // Read text inside the frame
    result = await client.callTool('get_element_text', { by: 'id', value: 'frame-text' });
    assert.equal(getResponseText(result), 'Inside the frame');
  });

  it('switch_to_default_content returns to main page', async () => {
    let result = await client.callTool('switch_to_default_content');
    assert.equal(getResponseText(result), 'Switched to default content');

    // Should be able to find main page element
    result = await client.callTool('get_element_text', { by: 'id', value: 'main-heading' });
    assert.equal(getResponseText(result), 'Main Page');
  });

  it('switch_to_frame by index', async () => {
    let result = await client.callTool('switch_to_frame', { by: 'index', value: '0' });
    assert.equal(getResponseText(result), 'Switched to frame');

    result = await client.callTool('get_element_text', { by: 'id', value: 'frame-text' });
    assert.equal(getResponseText(result), 'Inside the frame');

    // Clean up - go back to default
    await client.callTool('switch_to_default_content');
  });

  it('switch_to_frame returns error for invalid index', async () => {
    const result = await client.callTool('switch_to_frame', { by: 'index', value: 'abc' });
    assert.equal(result.isError, true);
  });
});

// ─── Alert/Dialog Handling ──────────────────────────────────────────────────

describe('alert handling', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', { browser: 'chrome', options: { headless: true } });
    await client.callTool('navigate', { url: fixture('alerts.html') });
  });

  after(async () => {
    await client.callTool('close_session');
    await client.stop();
  });

  it('get_alert_text reads alert message', async () => {
    await client.callTool('click_element', { by: 'id', value: 'alert-btn' });
    const result = await client.callTool('get_alert_text');
    assert.equal(getResponseText(result), 'Hello from alert!');
  });

  it('accept_alert dismisses the alert', async () => {
    // Alert is still open from previous test
    const result = await client.callTool('accept_alert');
    assert.equal(getResponseText(result), 'Alert accepted');
  });

  it('dismiss_alert cancels a confirm dialog', async () => {
    await client.callTool('click_element', { by: 'id', value: 'confirm-btn' });
    const result = await client.callTool('dismiss_alert');
    assert.equal(getResponseText(result), 'Alert dismissed');

    // Verify the confirm returned false (cancelled)
    const text = await client.callTool('get_element_text', { by: 'id', value: 'confirm-result' });
    assert.equal(getResponseText(text), 'cancelled');
  });

  it('accept_alert confirms a confirm dialog', async () => {
    await client.callTool('click_element', { by: 'id', value: 'confirm-btn' });
    const result = await client.callTool('accept_alert');
    assert.equal(getResponseText(result), 'Alert accepted');

    const text = await client.callTool('get_element_text', { by: 'id', value: 'confirm-result' });
    assert.equal(getResponseText(text), 'confirmed');
  });

  it('send_alert_text types into a prompt and accepts', async () => {
    await client.callTool('click_element', { by: 'id', value: 'prompt-btn' });
    const result = await client.callTool('send_alert_text', { text: 'Angie' });
    assert.ok(getResponseText(result).includes('sent to prompt'));

    // Verify the prompt value was captured
    const text = await client.callTool('get_element_text', { by: 'id', value: 'prompt-result' });
    assert.equal(getResponseText(text), 'Angie');
  });

  it('accept_alert returns error when no alert present', async () => {
    const result = await client.callTool('accept_alert', { timeout: 1000 });
    assert.equal(result.isError, true);
  });
});
