import { describe, it, after, before } from 'node:test';
import assert from 'node:assert/strict';
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

        it('should capture console messages at different levels', async () => {
            await client.callTool('diagnostics', { type: 'console', clear: true });

            await client.callTool('interact', { action: 'click', by: 'id', value: 'log-info' });
            await client.callTool('interact', { action: 'click', by: 'id', value: 'log-warn' });
            await client.callTool('interact', { action: 'click', by: 'id', value: 'log-error' });
            await new Promise(r => setTimeout(r, 500));

            const result = await client.callTool('diagnostics', { type: 'console' });
            assert.ok(!result.isError, `Tool returned error: ${getResponseText(result)}`);
            const logs = JSON.parse(getResponseText(result));

            assert.ok(logs.find(l => l.text?.includes('Hello from console')), 'Should capture console.log');
            const warnLog = logs.find(l => l.text?.includes('This is a warning'));
            assert.ok(warnLog, 'Should capture console.warn');
            assert.ok(warnLog.level === 'warn' || warnLog.level === 'warning', `Expected warn level, got: ${warnLog.level}`);
            const errorLog = logs.find(l => l.text?.includes('This is a console error'));
            assert.ok(errorLog, 'Should capture console.error');
            assert.strictEqual(errorLog.level, 'error');
        });

        it('should clear logs when clear=true and return empty on next read', async () => {
            await client.callTool('execute_script', { script: 'console.log("clear-test");' });
            await new Promise(r => setTimeout(r, 500));

            const clearResult = await client.callTool('diagnostics', { type: 'console', clear: true });
            assert.ok(getResponseText(clearResult).includes('clear-test'), 'Should return logs before clearing');

            const afterResult = await client.callTool('diagnostics', { type: 'console' });
            assert.strictEqual(getResponseText(afterResult), 'No console logs captured');
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

        it('should capture JavaScript errors with stack traces', async () => {
            await client.callTool('diagnostics', { type: 'errors', clear: true });
            await client.callTool('execute_script', {
                script: 'setTimeout(() => { throw new Error("Intentional test error"); }, 0);'
            });
            await new Promise(r => setTimeout(r, 1000));
            const result = await client.callTool('diagnostics', { type: 'errors' });
            assert.ok(!result.isError, `Tool returned error: ${getResponseText(result)}`);
            const text = getResponseText(result);
            const errors = JSON.parse(text);
            const jsError = errors.find(e => e.text?.includes('Intentional test error'));
            assert.ok(jsError, `Expected JS error with 'Intentional test error', got: ${text}`);
            assert.strictEqual(jsError.type, 'javascript');
            assert.ok(jsError.stackTrace, 'Should include stack trace');
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

        it('should capture successful and failed network requests', async () => {
            await client.callTool('diagnostics', { type: 'network', clear: true });
            await client.callTool('navigate', { url: fixture('bidi.html') });
            await client.callTool('execute_script', {
                script: 'fetch("http://localhost:1/nonexistent").catch(() => {});'
            });
            await new Promise(r => setTimeout(r, 1000));

            const result = await client.callTool('diagnostics', { type: 'network' });
            assert.ok(!result.isError, `Tool returned error: ${getResponseText(result)}`);
            const logs = JSON.parse(getResponseText(result));

            const pageLoad = logs.find(l => l.url?.includes('bidi.html'));
            assert.ok(pageLoad, 'Should capture page navigation');
            assert.strictEqual(pageLoad.method, 'GET');

            const failedRequest = logs.find(l => l.type === 'error');
            assert.ok(failedRequest, 'Should capture failed network request');
        });
    });

    describe('Session Isolation', () => {
        after(async () => {
            try { await client.callTool('close_session', {}); } catch (_) {}
        });

        it('should reset BiDi logs when starting a new session', async () => {
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });
            await client.callTool('navigate', { url: fixture('bidi.html') });
            await client.callTool('execute_script', { script: 'console.log("session-1-log");' });
            await new Promise(r => setTimeout(r, 500));

            const firstLogs = await client.callTool('diagnostics', { type: 'console' });
            assert.ok(getResponseText(firstLogs).includes('session-1-log'));

            await client.callTool('close_session', {});
            await client.callTool('start_browser', {
                browser: 'chrome',
                options: { headless: true, arguments: ['--no-sandbox'] }
            });

            const newLogs = await client.callTool('diagnostics', { type: 'console' });
            assert.strictEqual(getResponseText(newLogs), 'No console logs captured');

            await client.callTool('close_session', {});
        });
    });
});
