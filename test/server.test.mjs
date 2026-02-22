/**
 * MCP Server — connection, tool registration, and resource registration tests.
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

  it('should register all expected tools', async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);

    const expected = [
      'start_browser',
      'navigate',
      'interact',
      'send_keys',
      'get_element_text',
      'press_key',
      'upload_file',
      'take_screenshot',
      'close_session',
      'get_element_attribute',
      'execute_script',
      'window',
      'frame',
      'alert',
      'add_cookie',
      'get_cookies',
      'delete_cookie',
      'diagnostics',
    ];

    for (const name of expected) {
      assert.ok(names.includes(name), `Missing tool: ${name}`);
    }

    assert.equal(names.length, expected.length, `Expected ${expected.length} tools, got ${names.length}: ${names.join(', ')}`);
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

  it('should register all expected resources', async () => {
    const resources = await client.listResources();
    const uris = resources.map((r) => r.uri);

    const expected = [
      'browser-status://current',
      'accessibility://current',
    ];

    for (const uri of expected) {
      assert.ok(uris.includes(uri), `Missing resource: ${uri}`);
    }

    assert.equal(uris.length, expected.length, `Expected ${expected.length} resources, got ${uris.length}: ${uris.join(', ')}`);
  });
});
