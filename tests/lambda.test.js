import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { handler } from '../src/lib/lambda.js';

/**
 * Unit tests for Lambda handler
 */

describe('Lambda Handler', () => {
    describe('HTTP Method Handling', () => {
        it('should handle OPTIONS request (CORS preflight)', async () => {
            const event = {
                httpMethod: 'OPTIONS',
                path: '/message'
            };

            const result = await handler(event, {});

            assert.strictEqual(result.statusCode, 200);
            assert.ok(result.headers['Access-Control-Allow-Origin']);
            assert.ok(result.headers['Access-Control-Allow-Methods']);
            assert.strictEqual(result.body, '');
        });

        it('should handle GET request to /sse endpoint', async () => {
            const event = {
                httpMethod: 'GET',
                path: '/sse'
            };

            const result = await handler(event, {});

            assert.strictEqual(result.statusCode, 200);
            assert.strictEqual(result.headers['Content-Type'], 'text/event-stream');
            assert.ok(result.body.includes('event: endpoint'));
        });

        it('should return 404 for unknown paths', async () => {
            const event = {
                httpMethod: 'GET',
                path: '/unknown'
            };

            const result = await handler(event, {});

            assert.strictEqual(result.statusCode, 404);
        });
    });

    describe('MCP Protocol - Initialize', () => {
        it('should handle initialize request', async () => {
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

            assert.strictEqual(result.statusCode, 200);
            assert.strictEqual(body.jsonrpc, '2.0');
            assert.strictEqual(body.id, 1);
            assert.ok(body.result);
            assert.strictEqual(body.result.serverInfo.name, 'MCP Selenium');
            assert.strictEqual(body.result.protocolVersion, '2024-11-05');
        });

        it('should return server capabilities', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.result.capabilities);
            assert.ok(body.result.capabilities.tools);
            assert.ok(body.result.capabilities.resources);
        });
    });

    describe('MCP Protocol - Tools', () => {
        it('should list all available tools', async () => {
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

            assert.strictEqual(result.statusCode, 200);
            assert.ok(Array.isArray(body.result.tools));
            assert.ok(body.result.tools.length > 0);

            // Check for expected tools
            const toolNames = body.result.tools.map(t => t.name);
            const expectedTools = [
                'start_browser',
                'navigate',
                'click_element',
                'send_keys',
                'take_screenshot',
                'close_session'
            ];

            for (const tool of expectedTools) {
                assert.ok(toolNames.includes(tool), `Tool ${tool} should be available`);
            }
        });

        it('should include tool descriptions and schemas', async () => {
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

            const startBrowserTool = body.result.tools.find(t => t.name === 'start_browser');
            assert.ok(startBrowserTool);
            assert.ok(startBrowserTool.description);
            assert.ok(startBrowserTool.inputSchema);
            assert.strictEqual(startBrowserTool.inputSchema.type, 'object');
        });

        it('should return error for unknown tool', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 3,
                    method: 'tools/call',
                    params: {
                        name: 'unknown_tool',
                        arguments: {}
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.strictEqual(result.statusCode, 200);
            assert.ok(body.error);
            assert.ok(body.error.message.includes('not found'));
        });
    });

    describe('MCP Protocol - Resources', () => {
        it('should list all available resources', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 4,
                    method: 'resources/list',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.strictEqual(result.statusCode, 200);
            assert.ok(Array.isArray(body.result.resources));

            const resourceNames = body.result.resources.map(r => r.name);
            assert.ok(resourceNames.includes('browser-status'));
        });

        it('should read browser-status resource', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 5,
                    method: 'resources/read',
                    params: {
                        uri: 'browser-status://current'
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.strictEqual(result.statusCode, 200);
            assert.ok(body.result);
            assert.ok(body.result.contents);
        });

        it('should return error for unknown resource', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 6,
                    method: 'resources/read',
                    params: {
                        uri: 'unknown://resource'
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.error);
            assert.ok(body.error.message.includes('not found'));
        });
    });

    describe('Error Handling', () => {
        it('should handle malformed JSON', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: 'invalid json {'
            };

            const result = await handler(event, {});

            assert.strictEqual(result.statusCode, 500);
            const body = JSON.parse(result.body);
            assert.ok(body.error);
        });

        it('should handle missing request body', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: null
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            // Should handle empty request
            assert.strictEqual(result.statusCode, 200);
        });

        it('should handle unknown MCP method', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 7,
                    method: 'unknown/method',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.error);
            assert.ok(body.error.message.includes('Unknown method'));
        });
    });

    describe('CORS Headers', () => {
        it('should include CORS headers in all responses', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {}
                })
            };

            const result = await handler(event, {});

            assert.ok(result.headers['Access-Control-Allow-Origin']);
            assert.ok(result.headers['Access-Control-Allow-Methods']);
            assert.ok(result.headers['Access-Control-Allow-Headers']);
        });
    });

    describe('Event Format Compatibility', () => {
        it('should handle API Gateway v2 event format', async () => {
            const event = {
                requestContext: {
                    http: {
                        method: 'POST',
                        path: '/message'
                    }
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {}
                })
            };

            const result = await handler(event, {});

            assert.strictEqual(result.statusCode, 200);
        });

        it('should handle API Gateway v1 event format', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {}
                })
            };

            const result = await handler(event, {});

            assert.strictEqual(result.statusCode, 200);
        });
    });

    describe('JSON-RPC Compliance', () => {
        it('should include jsonrpc version in response', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.strictEqual(body.jsonrpc, '2.0');
        });

        it('should include request id in response', async () => {
            const requestId = 12345;
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: requestId,
                    method: 'initialize',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.strictEqual(body.id, requestId);
        });

        it('should include error code in error responses', async () => {
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'unknown/method',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.error);
            assert.strictEqual(body.error.code, -32603);
            assert.ok(body.error.message);
        });
    });
});
