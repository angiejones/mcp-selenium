/**
 * Cookie management tests — add_cookie, get_cookies, delete_cookie.
 *
 * Cookies require an HTTP domain (file:// URLs don't support cookies),
 * so we spin up a tiny local HTTP server for the duration of the suite.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient, getResponseText } from './mcp-client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function startServer() {
  return new Promise((resolve, reject) => {
    const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'cookies.html'), 'utf-8');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('Cookie Management', () => {
  let client;
  let httpServer;
  let baseUrl;

  before(async () => {
    const srv = await startServer();
    httpServer = srv.server;
    baseUrl = srv.url;

    client = new McpClient();
    await client.start();
    await client.callTool('start_browser', {
      browser: 'chrome',
      options: { headless: true, arguments: ['--no-sandbox', '--disable-dev-shm-usage'] },
    });
    await client.callTool('navigate', { url: baseUrl });
  });

  after(async () => {
    try { await client.callTool('close_session'); } catch { /* ignore */ }
    await client.stop();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  beforeEach(async () => {
    await client.callTool('delete_cookie', {});
  });

  describe('add_cookie', () => {
    it('should add a cookie and verify it was set', async () => {
      const result = await client.callTool('add_cookie', {
        name: 'test_cookie',
        value: 'hello123',
      });
      assert.ok(getResponseText(result).includes('Cookie "test_cookie" added'));

      const getResult = await client.callTool('get_cookies', { name: 'test_cookie' });
      const cookie = JSON.parse(getResponseText(getResult));
      assert.equal(cookie.name, 'test_cookie');
      assert.equal(cookie.value, 'hello123');
    });

    it('should respect optional properties', async () => {
      await client.callTool('add_cookie', {
        name: 'opts_cookie',
        value: 'secret',
        path: '/',
        httpOnly: true,
      });

      const getResult = await client.callTool('get_cookies', { name: 'opts_cookie' });
      const cookie = JSON.parse(getResponseText(getResult));
      assert.equal(cookie.path, '/');
      assert.equal(cookie.httpOnly, true);
    });
  });

  describe('get_cookies', () => {
    it('should return all cookies as an array', async () => {
      await client.callTool('add_cookie', { name: 'a', value: '1' });
      await client.callTool('add_cookie', { name: 'b', value: '2' });

      const result = await client.callTool('get_cookies', {});
      const cookies = JSON.parse(getResponseText(result));
      assert.ok(Array.isArray(cookies));
      const names = cookies.map(c => c.name);
      assert.ok(names.includes('a') && names.includes('b'));
    });

    it('should return empty array when no cookies exist', async () => {
      const result = await client.callTool('get_cookies', {});
      const cookies = JSON.parse(getResponseText(result));
      assert.equal(cookies.length, 0);
    });

    it('should error when a named cookie is not found', async () => {
      const result = await client.callTool('get_cookies', { name: 'ghost' });
      assert.strictEqual(result.isError, true);
      assert.ok(getResponseText(result).includes('not found'));
    });
  });

  describe('delete_cookie', () => {
    it('should delete a specific cookie and leave others', async () => {
      await client.callTool('add_cookie', { name: 'delete_me', value: 'bye' });
      await client.callTool('add_cookie', { name: 'keep_me', value: 'stay' });

      await client.callTool('delete_cookie', { name: 'delete_me' });

      const gone = await client.callTool('get_cookies', { name: 'delete_me' });
      assert.strictEqual(gone.isError, true);

      const kept = JSON.parse(getResponseText(
        await client.callTool('get_cookies', { name: 'keep_me' })
      ));
      assert.equal(kept.name, 'keep_me');
    });

    it('should delete all cookies when no name is provided', async () => {
      await client.callTool('add_cookie', { name: 'x', value: '1' });
      await client.callTool('add_cookie', { name: 'y', value: '2' });

      const result = await client.callTool('delete_cookie', {});
      assert.ok(getResponseText(result).includes('All cookies deleted'));

      const cookies = JSON.parse(getResponseText(
        await client.callTool('get_cookies', {})
      ));
      assert.equal(cookies.length, 0);
    });
  });
});
