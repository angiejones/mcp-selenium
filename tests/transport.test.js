import { describe, it, mock } from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for StreamableHTTPTransport class
 *
 * Note: We test the transport through the Lambda handler since it's not exported separately.
 * These tests focus on the transport's behavior and protocol handling.
 */

describe('StreamableHTTPTransport', () => {
    describe('Request Handling', () => {
        it('should handle valid JSON-RPC requests', async () => {
            // Import handler to test transport indirectly
            const { handler } = await import('../src/lib/lambda.js');

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
            assert.strictEqual(body.id, 1);
            assert.ok(body.result || body.error);
        });

        it('should preserve request ID in responses', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const testIds = [1, 42, 'string-id', null];

            for (const testId of testIds) {
                const event = {
                    httpMethod: 'POST',
                    path: '/message',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: testId,
                        method: 'initialize',
                        params: {}
                    })
                };

                const result = await handler(event, {});
                const body = JSON.parse(result.body);

                assert.strictEqual(body.id, testId, `ID ${testId} should be preserved`);
            }
        });
    });

    describe('Method Routing', () => {
        it('should route initialize method correctly', async () => {
            const { handler } = await import('../src/lib/lambda.js');

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

            assert.ok(body.result);
            assert.ok(body.result.serverInfo);
            assert.ok(body.result.capabilities);
        });

        it('should route tools/list method correctly', async () => {
            const { handler } = await import('../src/lib/lambda.js');

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

            assert.ok(body.result);
            assert.ok(Array.isArray(body.result.tools));
        });

        it('should route resources/list method correctly', async () => {
            const { handler } = await import('../src/lib/lambda.js');

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

            assert.ok(body.result);
            assert.ok(Array.isArray(body.result.resources));
        });
    });

    describe('Error Handling', () => {
        it('should return error for invalid method', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invalid/method',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.error);
            assert.strictEqual(body.error.code, -32603);
            assert.ok(body.error.message);
        });

        it('should include stack trace in error data', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'invalid/method',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.error);
            assert.ok(body.error.data, 'Error should include stack trace in data field');
        });

        it('should handle tool execution errors gracefully', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            // Try to call a tool without a browser session
            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'navigate',
                        arguments: {
                            url: 'https://example.com'
                        }
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            // Should return a response (not crash)
            assert.strictEqual(result.statusCode, 200);
            // The tool should return an error in its content
            if (body.result) {
                assert.ok(body.result.content);
                assert.ok(body.result.content[0].text.includes('Error'));
            }
        });
    });

    describe('Tool Handler Integration', () => {
        it('should retrieve all registered tools', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/list',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            // Should have 14 tools
            assert.strictEqual(body.result.tools.length, 14);

            // Verify each tool has required fields
            for (const tool of body.result.tools) {
                assert.ok(tool.name, 'Tool should have name');
                assert.ok(tool.description, 'Tool should have description');
                assert.ok(tool.inputSchema, 'Tool should have input schema');
                assert.strictEqual(tool.inputSchema.type, 'object');
            }
        });

        it('should include proper schema for start_browser tool', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/list',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            const startBrowser = body.result.tools.find(t => t.name === 'start_browser');
            assert.ok(startBrowser);
            assert.ok(startBrowser.inputSchema.properties.browser);
            assert.ok(startBrowser.inputSchema.properties.options);
        });
    });

    describe('Resource Handler Integration', () => {
        it('should retrieve all registered resources', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'resources/list',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            // Should have 1 resource (browser-status)
            assert.strictEqual(body.result.resources.length, 1);

            const resource = body.result.resources[0];
            assert.strictEqual(resource.name, 'browser-status');
            assert.ok(resource.uri);
        });

        it('should read browser-status resource when no session active', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'resources/read',
                    params: {
                        uri: 'browser-status://current'
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.result);
            assert.ok(body.result.contents);
            assert.strictEqual(body.result.contents.length, 1);
            assert.ok(body.result.contents[0].text.includes('No active'));
        });
    });

    describe('Protocol Version', () => {
        it('should return correct protocol version', async () => {
            const { handler } = await import('../src/lib/lambda.js');

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

            assert.strictEqual(body.result.protocolVersion, '2024-11-05');
        });
    });

    describe('Concurrent Requests', () => {
        it('should handle multiple concurrent requests', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const requests = [
                { method: 'initialize', params: {} },
                { method: 'tools/list', params: {} },
                { method: 'resources/list', params: {} }
            ];

            const promises = requests.map((req, i) => {
                const event = {
                    httpMethod: 'POST',
                    path: '/message',
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: i + 1,
                        method: req.method,
                        params: req.params
                    })
                };
                return handler(event, {});
            });

            const results = await Promise.all(promises);

            // All requests should succeed
            for (let i = 0; i < results.length; i++) {
                assert.strictEqual(results[i].statusCode, 200);
                const body = JSON.parse(results[i].body);
                assert.strictEqual(body.id, i + 1);
                assert.ok(body.result);
            }
        });
    });
});
