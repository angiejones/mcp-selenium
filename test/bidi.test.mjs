import { describe, it, after, before } from 'node:test';
import assert from 'node:assert';
import { McpClient, getResponseText, fixture } from './mcp-client.mjs';

describe('BiDi Diagnostic Tools', () => {
    let client;

    before(async () => {
        client = new McpClient();
        await client.start();
    });

    after(async () => {
        await client.stop();
    });

    describe('Tool Registration', () => {
        it('should register get_console_logs tool', async () => {
            const tools = await client.listTools();
            const tool = tools.find(t => t.name === 'get_console_logs');
            assert.ok(tool, 'get_console_logs tool should be registered');
            assert.ok(tool.description.includes('console'), 'Description should mention console');
            assert.ok(tool.inputSchema.properties.clear, 'Should have clear parameter');
        });

        it('should register get_page_errors tool', async () => {
            const tools = await client.listTools();
            const tool = tools.find(t => t.name === 'get_page_errors');
            assert.ok(tool, 'get_page_errors tool should be registered');
            assert.ok(tool.description.includes('error') || tool.description.includes('exception'), 'Description should mention errors');
            assert.ok(tool.inputSchema.properties.clear, 'Should have clear parameter');
        });

        it('should register get_network_logs tool', async () => {
            const tools = await client.listTools();
            const tool = tools.find(t => t.name === 'get_network_logs');
            assert.ok(tool, 'get_network_logs tool should be registered');
            assert.ok(tool.description.includes('network'), 'Description should mention network');
            assert.ok(tool.inputSchema.properties.clear, 'Should have clear parameter');
        });
    });

    describe('BiDi Enablement', () => {
        after(async () => {
            try { await client.callTool('close_session', {}); } catch (_) {}
        });

        it('should enable BiDi automatically when starting browser', async () => {
            const result = await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });
            const text = getResponseText(result);
            assert.ok(text.includes('BiDi enabled'), `Expected BiDi enabled message, got: ${text}`);
        });
    });

    describe('Console Log Capture', () => {
        before(async () => {
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });
            await client.callTool('navigate', { url: fixture('bidi.html') });
        });

        after(async () => {
            try { await client.callTool('close_session', {}); } catch (_) {}
        });

        it('should return empty message when no console logs exist', async () => {
            // Clear any logs from page load
            await client.callTool('get_console_logs', { clear: true });
            const result = await client.callTool('get_console_logs', {});
            const text = getResponseText(result);
            assert.strictEqual(text, 'No console logs captured');
        });

        it('should capture console.log messages', async () => {
            await client.callTool('get_console_logs', { clear: true });
            await client.callTool('click_element', { by: 'id', value: 'log-info' });
            await new Promise(r => setTimeout(r, 500));
            const result = await client.callTool('get_console_logs', {});
            const text = getResponseText(result);
            const logs = JSON.parse(text);
            const logEntry = logs.find(l => l.text?.includes('Hello from console'));
            assert.ok(logEntry, `Expected console.log entry with 'Hello from console', got: ${text}`);
        });

        it('should capture console.warn messages', async () => {
            await client.callTool('get_console_logs', { clear: true });
            await client.callTool('click_element', { by: 'id', value: 'log-warn' });
            await new Promise(r => setTimeout(r, 500));
            const result = await client.callTool('get_console_logs', {});
            const text = getResponseText(result);
            const logs = JSON.parse(text);
            const warnLog = logs.find(l => l.text?.includes('This is a warning'));
            assert.ok(warnLog, `Expected warn log with 'This is a warning', got: ${text}`);
            assert.ok(warnLog.level === 'warn' || warnLog.level === 'warning', `Expected warn level, got: ${warnLog.level}`);
        });

        it('should capture console.error messages', async () => {
            await client.callTool('get_console_logs', { clear: true });
            await client.callTool('click_element', { by: 'id', value: 'log-error' });
            await new Promise(r => setTimeout(r, 500));
            const result = await client.callTool('get_console_logs', {});
            const text = getResponseText(result);
            const logs = JSON.parse(text);
            const errorLog = logs.find(l => l.text?.includes('This is a console error'));
            assert.ok(errorLog, `Expected error log with 'This is a console error', got: ${text}`);
            assert.strictEqual(errorLog.level, 'error');
        });

        it('should clear logs when clear=true', async () => {
            // Trigger a log
            await client.callTool('execute_script', { script: 'console.log("clear-test");' });
            await new Promise(r => setTimeout(r, 500));

            // Clear and verify it returns the logs before clearing
            const clearResult = await client.callTool('get_console_logs', { clear: true });
            assert.ok(getResponseText(clearResult).includes('clear-test'), 'Should return logs before clearing');

            // Verify cleared
            const afterResult = await client.callTool('get_console_logs', {});
            assert.strictEqual(getResponseText(afterResult), 'No console logs captured');
        });

        it('should preserve logs when clear=false (default)', async () => {
            await client.callTool('get_console_logs', { clear: true });
            await client.callTool('execute_script', { script: 'console.log("persist-test");' });
            await new Promise(r => setTimeout(r, 500));

            // Read twice without clearing
            const first = await client.callTool('get_console_logs', {});
            const second = await client.callTool('get_console_logs', {});
            assert.strictEqual(getResponseText(first), getResponseText(second), 'Logs should persist across reads');
        });
    });

    describe('Page Error Capture', () => {
        before(async () => {
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });
            await client.callTool('navigate', { url: fixture('bidi.html') });
        });

        after(async () => {
            try { await client.callTool('close_session', {}); } catch (_) {}
        });

        it('should return empty message when no page errors exist', async () => {
            await client.callTool('get_page_errors', { clear: true });
            const result = await client.callTool('get_page_errors', {});
            assert.strictEqual(getResponseText(result), 'No page errors captured');
        });

        it('should capture JavaScript errors with stack traces', async () => {
            await client.callTool('get_page_errors', { clear: true });
            // Use setTimeout to throw an uncaught error that BiDi will capture
            await client.callTool('execute_script', {
                script: 'setTimeout(() => { throw new Error("Intentional test error"); }, 0);'
            });
            await new Promise(r => setTimeout(r, 1000));
            const result = await client.callTool('get_page_errors', {});
            const text = getResponseText(result);
            const errors = JSON.parse(text);
            const jsError = errors.find(e => e.text?.includes('Intentional test error'));
            assert.ok(jsError, `Expected JS error with 'Intentional test error', got: ${text}`);
            assert.strictEqual(jsError.type, 'javascript');
            assert.ok(jsError.stackTrace, 'Should include stack trace');
        });

        it('should clear errors when clear=true', async () => {
            await client.callTool('execute_script', {
                script: 'setTimeout(() => { throw new Error("clear-error-test"); }, 0);'
            });
            await new Promise(r => setTimeout(r, 1000));

            const clearResult = await client.callTool('get_page_errors', { clear: true });
            assert.ok(getResponseText(clearResult).includes('clear-error-test'), 'Should return errors before clearing');

            const afterResult = await client.callTool('get_page_errors', {});
            assert.strictEqual(getResponseText(afterResult), 'No page errors captured');
        });
    });

    describe('Network Log Capture', () => {
        before(async () => {
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });
        });

        after(async () => {
            try { await client.callTool('close_session', {}); } catch (_) {}
        });

        it('should capture network activity from page navigation', async () => {
            await client.callTool('get_network_logs', { clear: true });
            await client.callTool('navigate', { url: fixture('bidi.html') });
            await new Promise(r => setTimeout(r, 500));
            const result = await client.callTool('get_network_logs', {});
            const text = getResponseText(result);
            const logs = JSON.parse(text);
            const pageLoad = logs.find(l => l.url?.includes('bidi.html'));
            assert.ok(pageLoad, `Expected network log for bidi.html, got: ${text}`);
            assert.strictEqual(pageLoad.method, 'GET');
        });

        it('should capture failed network requests', async () => {
            await client.callTool('get_network_logs', { clear: true });
            await client.callTool('execute_script', {
                script: 'fetch("http://localhost:1/nonexistent").catch(() => {});'
            });
            await new Promise(r => setTimeout(r, 1000));
            const result = await client.callTool('get_network_logs', {});
            const text = getResponseText(result);
            const logs = JSON.parse(text);
            const failedRequest = logs.find(l => l.type === 'error');
            assert.ok(failedRequest, `Expected failed network request, got: ${text}`);
        });

        it('should clear network logs when clear=true', async () => {
            // There should be logs from previous tests
            const clearResult = await client.callTool('get_network_logs', { clear: true });
            assert.notStrictEqual(getResponseText(clearResult), 'No network activity captured');

            const afterResult = await client.callTool('get_network_logs', {});
            assert.strictEqual(getResponseText(afterResult), 'No network activity captured');
        });
    });

    describe('Session Isolation', () => {
        it('should reset BiDi logs when starting a new session', async () => {
            // First session — generate some logs
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });
            await client.callTool('navigate', { url: fixture('bidi.html') });
            await client.callTool('execute_script', { script: 'console.log("session-1-log");' });
            await new Promise(r => setTimeout(r, 500));

            // Verify logs exist
            const firstLogs = await client.callTool('get_console_logs', {});
            assert.ok(getResponseText(firstLogs).includes('session-1-log'));

            // Close and start new session
            await client.callTool('close_session', {});
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });

            // New session should have clean logs
            const newLogs = await client.callTool('get_console_logs', {});
            assert.strictEqual(getResponseText(newLogs), 'No console logs captured');

            await client.callTool('close_session', {});
        });
    });
});
