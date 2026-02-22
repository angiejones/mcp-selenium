/**
 * MCP Resources — accessibility-snapshot tests.
 * Requires a browser session with a loaded page.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, fixture } from './mcp-client.mjs';

describe('Resources', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', {
      browser: 'chrome',
      options: { headless: true, arguments: ['--no-sandbox', '--disable-dev-shm-usage'] },
    });
    await client.callTool('navigate', { url: fixture('locators.html') });
  });

  after(async () => {
    try { await client.callTool('close_session'); } catch { /* ignore */ }
    await client.stop();
  });

  describe('accessibility://current', () => {
    it('should include page elements with roles, levels, and IDs', async () => {
      const result = await client.readResource('accessibility://current');
      assert.equal(result.contents[0].mimeType, 'application/json');
      const tree = JSON.parse(result.contents[0].text);

      const headings = findNodes(tree, (n) => n.role === 'heading');
      assert.ok(headings.length > 0, 'Should find at least one heading');
      assert.equal(headings[0].level, 1, 'H1 should have level 1');

      const buttons = findNodes(tree, (n) => n.role === 'button');
      const links = findNodes(tree, (n) => n.role === 'link');
      const textboxes = findNodes(tree, (n) => n.role === 'textbox');
      assert.ok(buttons.length > 0, 'Should find at least one button');
      assert.ok(links.length > 0, 'Should find at least one link');
      assert.ok(textboxes.length > 0, 'Should find at least one textbox');

      const ids = findNodes(tree, (n) => n.id).map((n) => n.id);
      assert.ok(ids.includes('title'), 'Should include #title');
      assert.ok(ids.includes('btn'), 'Should include #btn');
      assert.ok(ids.includes('input'), 'Should include #input');
    });

    it('should not include script or style content', async () => {
      await client.callTool('execute_script', {
        script: `
          var s = document.createElement('script'); s.textContent = 'var secret = 42;'; document.body.appendChild(s);
          var c = document.createElement('style'); c.textContent = 'body { color: red; }'; document.body.appendChild(c);
        `
      });
      const result = await client.readResource('accessibility://current');
      const text = result.contents[0].text;
      assert.ok(!text.includes('secret'), 'Tree should not contain script content');
      assert.ok(!text.includes('color: red'), 'Tree should not contain style content');
    });

    // Separate client needed: the main client already has a browser session,
    // and we need a clean session with no browser to test the no-session error path.
    it('should return error code -32002 when reading with no session', async () => {
      const freshClient = new McpClient();
      await freshClient.start();
      try {
        await freshClient.readResource('accessibility://current');
        assert.fail('Should have thrown');
      } catch (e) {
        assert.ok(e.message.includes('-32002') || e.message.includes('No active browser session'), `Expected -32002 error, got: ${e.message}`);
      } finally {
        await freshClient.stop();
      }
    });
  });
});

/** Recursively find nodes matching a predicate. */
function findNodes(node, predicate) {
  if (!node) return [];
  const results = [];
  if (predicate(node)) results.push(node);
  if (node.children) {
    for (const child of node.children) {
      results.push(...findNodes(child, predicate));
    }
  }
  return results;
}
