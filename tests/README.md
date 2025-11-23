# Test Suite for MCP Selenium Lambda

This directory contains comprehensive unit tests for the HTTP Lambda implementation of MCP Selenium.

## Test Files

### `lambda.test.js`
Tests for the AWS Lambda handler including:
- HTTP method handling (OPTIONS, GET, POST)
- CORS preflight requests
- MCP protocol initialization
- Tool and resource listing
- Error handling and edge cases
- API Gateway v1 and v2 event format compatibility
- JSON-RPC compliance

### `transport.test.js`
Tests for the StreamableHTTPTransport class including:
- JSON-RPC request handling
- Method routing (initialize, tools/list, resources/list, tools/call, resources/read)
- Error handling and stack traces
- Tool and resource handler integration
- Protocol version compatibility
- Concurrent request handling

### `tools.test.js`
Tests for MCP tool handlers including:
- Tool registration and schemas
- All 14 browser automation tools
- Schema validation for each tool
- Tool execution error cases
- Response format validation
- Tool categorization (browser management, element interaction, mouse actions)

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

This generates both console output and an HTML coverage report in `coverage/index.html`.

### Watch Mode
```bash
npm run test:watch
```

Automatically re-runs tests when files change.

### Integration Test
```bash
npm run test:lambda
```

Runs the integration test suite (`test-lambda.js` in root) which tests the full Lambda handler.

## Test Statistics

- **Total Tests**: 51
- **Test Suites**: 24
- **Statement Coverage**: ~59%
- **Branch Coverage**: ~88%
- **Function Coverage**: ~75%

## Coverage Notes

### Covered Code
- ✅ HTTP endpoint handling (GET, POST, OPTIONS)
- ✅ CORS configuration
- ✅ MCP protocol methods (initialize, tools/list, resources/list, tools/call, resources/read)
- ✅ JSON-RPC request/response formatting
- ✅ Error handling and error responses
- ✅ Tool and resource registration
- ✅ Event format compatibility
- ✅ Concurrent request handling

### Uncovered Code
The following are intentionally not covered by unit tests as they require a real browser:
- Actual Selenium WebDriver interactions (browser launch, element clicking, etc.)
- Browser session management with real drivers
- Screenshot capture
- File uploads
- Local test server code (lines 676-709)

These functionalities are tested through:
1. Manual testing with `npm run lambda:test`
2. Integration testing in real Lambda environments
3. End-to-end testing with actual browsers

## Writing New Tests

### Test Structure
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Feature Name', () => {
    describe('Sub-feature', () => {
        it('should do something specific', async () => {
            const { handler } = await import('../src/lib/lambda.js');

            const event = {
                httpMethod: 'POST',
                path: '/message',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'some/method',
                    params: {}
                })
            };

            const result = await handler(event, {});
            const body = JSON.parse(result.body);

            assert.strictEqual(result.statusCode, 200);
            assert.ok(body.result);
        });
    });
});
```

### Best Practices
1. **Use descriptive test names** - Explain what the test validates
2. **Test one thing per test** - Keep tests focused
3. **Use meaningful assertions** - Make failures easy to debug
4. **Mock external dependencies** - Tests should be fast and reliable
5. **Test error cases** - Ensure graceful error handling
6. **Test edge cases** - Invalid input, missing parameters, etc.

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Debugging Tests

### Run a Single Test File
```bash
node --test tests/lambda.test.js
```

### Run with Verbose Output
```bash
node --test --test-reporter=spec tests/*.test.js
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Run Tests",
  "program": "${workspaceFolder}/node_modules/.bin/node",
  "args": ["--test", "tests/*.test.js"],
  "console": "integratedTerminal"
}
```

## Test Dependencies

- **Node.js built-in test runner** - No external test framework needed (Node 18+)
- **c8** - Code coverage reporting
- **assert** - Built-in assertion library

No mocking library is required as we test through the Lambda handler interface.

## Contributing

When adding new features to the Lambda handler:

1. Write tests first (TDD approach recommended)
2. Ensure all existing tests pass
3. Maintain or improve code coverage
4. Add tests for both success and error cases
5. Update this README if adding new test files

## Test Output Example

```
✔ Lambda Handler (14.7ms)
  ✔ HTTP Method Handling (2.8ms)
    ✔ should handle OPTIONS request
    ✔ should handle GET request to /sse
    ✔ should return 404 for unknown paths
  ✔ MCP Protocol - Initialize (0.9ms)
  ✔ MCP Protocol - Tools (3.6ms)
  ✔ MCP Protocol - Resources (1.1ms)
  ...

tests 51
suites 24
pass 51
fail 0
```

## License

ISC - Same as parent project
