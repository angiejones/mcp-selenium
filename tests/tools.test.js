import { describe, it } from 'node:test';
import assert from 'node:assert';

/**
 * Unit tests for MCP tool handlers
 */

describe('Tool Handlers', () => {
    describe('Tool Registration', () => {
        it('should register all expected tools', async () => {
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

            const toolNames = body.result.tools.map(t => t.name);

            // Browser management tools
            assert.ok(toolNames.includes('start_browser'));
            assert.ok(toolNames.includes('navigate'));
            assert.ok(toolNames.includes('close_session'));

            // Element interaction tools
            assert.ok(toolNames.includes('find_element'));
            assert.ok(toolNames.includes('click_element'));
            assert.ok(toolNames.includes('send_keys'));
            assert.ok(toolNames.includes('get_element_text'));

            // Mouse interaction tools
            assert.ok(toolNames.includes('hover'));
            assert.ok(toolNames.includes('drag_and_drop'));
            assert.ok(toolNames.includes('double_click'));
            assert.ok(toolNames.includes('right_click'));

            // Keyboard and file tools
            assert.ok(toolNames.includes('press_key'));
            assert.ok(toolNames.includes('upload_file'));

            // Screenshot tool
            assert.ok(toolNames.includes('take_screenshot'));
        });

        it('should have exactly 14 tools', async () => {
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

            assert.strictEqual(body.result.tools.length, 14);
        });
    });

    describe('Tool Schemas', () => {
        it('start_browser should have correct schema', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'start_browser');
            assert.ok(tool);
            assert.strictEqual(tool.description, 'launches browser');
            assert.ok(tool.inputSchema.properties.browser);
            assert.ok(tool.inputSchema.properties.options);
        });

        it('navigate should have correct schema', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'navigate');
            assert.ok(tool);
            assert.strictEqual(tool.description, 'navigates to a URL');
            assert.ok(tool.inputSchema.properties.url);
        });

        it('click_element should have locator schema', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'click_element');
            assert.ok(tool);
            assert.ok(tool.inputSchema.properties.by);
            assert.ok(tool.inputSchema.properties.value);
            assert.ok(tool.inputSchema.properties.timeout);
        });

        it('send_keys should include text parameter', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'send_keys');
            assert.ok(tool);
            assert.ok(tool.inputSchema.properties.text);
        });

        it('drag_and_drop should have source and target parameters', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'drag_and_drop');
            assert.ok(tool);
            assert.ok(tool.inputSchema.properties.by);
            assert.ok(tool.inputSchema.properties.value);
            assert.ok(tool.inputSchema.properties.targetBy);
            assert.ok(tool.inputSchema.properties.targetValue);
        });

        it('take_screenshot should have optional outputPath', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'take_screenshot');
            assert.ok(tool);
            assert.ok(tool.inputSchema.properties.outputPath);
        });
    });

    describe('Tool Execution - Error Cases', () => {
        it('should return error when calling tool without browser session', async () => {
            const { handler } = await import('../src/lib/lambda.js');

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

            assert.strictEqual(result.statusCode, 200);
            // The tool should handle the error gracefully
            if (body.result && body.result.content) {
                const errorText = body.result.content[0].text;
                assert.ok(errorText.includes('Error') || errorText.includes('No active'));
            }
        });

        it('should return error for invalid tool name', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'nonexistent_tool',
                        arguments: {}
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.ok(body.error);
            assert.ok(body.error.message.includes('not found'));
        });

        it('should handle missing tool arguments', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'navigate'
                        // Missing arguments
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            // Should handle gracefully (either error or default empty arguments)
            assert.strictEqual(result.statusCode, 200);
        });
    });

    describe('Tool Response Format', () => {
        it('should return content array in tool response', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            // Try to navigate without session - should return error in content
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

            if (body.result) {
                assert.ok(body.result.content);
                assert.ok(Array.isArray(body.result.content));
                assert.ok(body.result.content[0].type);
                assert.ok(body.result.content[0].text);
            }
        });
    });

    describe('Close Session Tool', () => {
        it('should have close_session tool', async () => {
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

            const tool = body.result.tools.find(t => t.name === 'close_session');
            assert.ok(tool);
            assert.strictEqual(tool.description, 'closes the current browser session');
        });

        it('should return error when closing non-existent session', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: {
                        name: 'close_session',
                        arguments: {}
                    }
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            if (body.result && body.result.content) {
                const responseText = body.result.content[0].text;
                assert.ok(responseText.includes('Error') || responseText.includes('No active'));
            }
        });
    });

    describe('Tool Categories', () => {
        it('should have browser management tools', async () => {
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
            const toolNames = body.result.tools.map(t => t.name);

            const browserTools = ['start_browser', 'navigate', 'close_session'];
            for (const tool of browserTools) {
                assert.ok(toolNames.includes(tool));
            }
        });

        it('should have element interaction tools', async () => {
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
            const toolNames = body.result.tools.map(t => t.name);

            const elementTools = [
                'find_element',
                'click_element',
                'send_keys',
                'get_element_text'
            ];
            for (const tool of elementTools) {
                assert.ok(toolNames.includes(tool));
            }
        });

        it('should have mouse interaction tools', async () => {
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
            const toolNames = body.result.tools.map(t => t.name);

            const mouseTools = [
                'hover',
                'drag_and_drop',
                'double_click',
                'right_click'
            ];
            for (const tool of mouseTools) {
                assert.ok(toolNames.includes(tool));
            }
        });
    });
});
