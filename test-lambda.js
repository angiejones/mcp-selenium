#!/usr/bin/env node

/**
 * Simple test script for the Lambda handler
 * Tests basic MCP protocol methods without actually launching a browser
 */

import { handler } from './src/lib/lambda.js';

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function runTest(name, testFn) {
  try {
    log('blue', `\n🧪 Testing: ${name}`);
    await testFn();
    log('green', `✅ PASSED: ${name}`);
    return true;
  } catch (error) {
    log('red', `❌ FAILED: ${name}`);
    log('red', `   Error: ${error.message}`);
    return false;
  }
}

async function testInitialize() {
  const event = {
    httpMethod: 'POST',
    path: '/message',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    })
  };

  const result = await handler(event, {});
  const body = JSON.parse(result.body);

  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }

  if (body.result.serverInfo.name !== 'MCP Selenium') {
    throw new Error(`Unexpected server name: ${body.result.serverInfo.name}`);
  }

  log('yellow', `   Server: ${body.result.serverInfo.name} v${body.result.serverInfo.version}`);
}

async function testListTools() {
  const event = {
    httpMethod: 'POST',
    path: '/message',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })
  };

  const result = await handler(event, {});
  const body = JSON.parse(result.body);

  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }

  if (!Array.isArray(body.result.tools)) {
    throw new Error('Expected tools array');
  }

  log('yellow', `   Found ${body.result.tools.length} tools`);

  // Check for key tools
  const toolNames = body.result.tools.map(t => t.name);
  const expectedTools = ['start_browser', 'navigate', 'click_element', 'take_screenshot'];

  for (const tool of expectedTools) {
    if (!toolNames.includes(tool)) {
      throw new Error(`Missing expected tool: ${tool}`);
    }
  }
}

async function testListResources() {
  const event = {
    httpMethod: 'POST',
    path: '/message',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/list',
      params: {}
    })
  };

  const result = await handler(event, {});
  const body = JSON.parse(result.body);

  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }

  if (!Array.isArray(body.result.resources)) {
    throw new Error('Expected resources array');
  }

  log('yellow', `   Found ${body.result.resources.length} resources`);
}

async function testCorsOptions() {
  const event = {
    httpMethod: 'OPTIONS',
    path: '/message'
  };

  const result = await handler(event, {});

  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }

  if (!result.headers['Access-Control-Allow-Origin']) {
    throw new Error('Missing CORS headers');
  }

  log('yellow', `   CORS headers present`);
}

async function testSseEndpoint() {
  const event = {
    httpMethod: 'GET',
    path: '/sse'
  };

  const result = await handler(event, {});

  if (result.statusCode !== 200) {
    throw new Error(`Expected status 200, got ${result.statusCode}`);
  }

  if (result.headers['Content-Type'] !== 'text/event-stream') {
    throw new Error('Expected SSE content type');
  }

  log('yellow', `   SSE endpoint configured`);
}

async function test404() {
  const event = {
    httpMethod: 'GET',
    path: '/nonexistent'
  };

  const result = await handler(event, {});

  if (result.statusCode !== 404) {
    throw new Error(`Expected status 404, got ${result.statusCode}`);
  }

  log('yellow', `   404 handling works`);
}

async function main() {
  log('blue', '\n===========================================');
  log('blue', '  MCP Selenium Lambda Handler Test Suite');
  log('blue', '===========================================');

  const tests = [
    ['Initialize MCP Connection', testInitialize],
    ['List Available Tools', testListTools],
    ['List Resources', testListResources],
    ['CORS Preflight', testCorsOptions],
    ['SSE Endpoint', testSseEndpoint],
    ['404 Handler', test404]
  ];

  let passed = 0;
  let failed = 0;

  for (const [name, testFn] of tests) {
    const result = await runTest(name, testFn);
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }

  log('blue', '\n===========================================');
  log('blue', '  Test Results');
  log('blue', '===========================================');
  log('green', `  ✅ Passed: ${passed}`);
  if (failed > 0) {
    log('red', `  ❌ Failed: ${failed}`);
  }
  log('blue', '===========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
  log('red', `\n❌ Test suite error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
