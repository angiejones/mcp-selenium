/**
 * MCP Server — connection and tool registration tests.
 * No browser needed for these.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient } from './mcp-client.mjs';

describe('MCP Server', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
  });

  after(async () => {
    await client.stop();
  });

  it('should initialize with correct server info', async () => {
    // start() already initializes, so we just verify the client is usable
    const tools = await client.listTools();
    assert.ok(tools.length > 0, 'Server should have tools registered');
  });

  it('should register all 34 expected tools', async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);

    const expected = [
      'start_browser',
      'navigate',
      'find_element',
      'click_element',
      'send_keys',
      'get_element_text',
      'hover',
      'drag_and_drop',
      'double_click',
      'right_click',
      'press_key',
      'upload_file',
      'take_screenshot',
      'close_session',
      'clear_element',
      'get_element_attribute',
      'scroll_to_element',
      'execute_script',
      'switch_to_window',
      'get_window_handles',
      'switch_to_latest_window',
      'close_current_window',
      'switch_to_frame',
      'switch_to_default_content',
      'accept_alert',
      'dismiss_alert',
      'get_alert_text',
      'send_alert_text',
      'add_cookie',
      'get_cookies',
      'delete_cookie',
      'get_console_logs',
      'get_page_errors',
      'get_network_logs',
    ];

    for (const name of expected) {
      assert.ok(names.includes(name), `Missing tool: ${name}`);
    }
  });

  it('should include descriptions for all tools', async () => {
    const tools = await client.listTools();
    for (const tool of tools) {
      assert.ok(
        tool.description && tool.description.length > 0,
        `Tool "${tool.name}" should have a description`
      );
    }
  });

  it('should include input schemas for all tools', async () => {
    const tools = await client.listTools();
    for (const tool of tools) {
      assert.ok(tool.inputSchema, `Tool "${tool.name}" should have an inputSchema`);
      assert.equal(tool.inputSchema.type, 'object', `Tool "${tool.name}" schema should be type object`);
    }
  });
});
