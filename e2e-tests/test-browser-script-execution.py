#!/usr/bin/env python3
"""
Test script for the execute_script MCP tool in mcp-selenium.

Tests both synchronous and asynchronous JavaScript execution with various
scenarios including:
- Simple expressions and calculations
- DOM manipulation
- Passing arguments to scripts
- Returning different data types (primitives, objects, arrays)
- Async script execution with callbacks
"""

import asyncio
import json
import os
import sys
import socket
import threading
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


SERVER_SCRIPT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "src",
    "lib",
    "server.js",
)


def find_free_port():
    """Find a free port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port


def start_test_server(port, directory):
    """Start an HTTP server in a background thread."""
    os.chdir(directory)
    
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, format, *args):
            pass  # Suppress request logs
    
    server = HTTPServer(('localhost', port), QuietHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


async def call_tool(session: ClientSession, name: str, arguments: dict) -> str:
    """Call an MCP tool and return its text content."""
    print(f"\n{'='*60}")
    print(f">>> Calling tool: {name}")

    # Format arguments with proper line breaks for readability
    formatted_args = json.dumps(arguments, indent=2)
    # Replace escaped newlines with actual newlines for better readability
    formatted_args = formatted_args.replace('\\n', '\n')

    print(f"    Arguments: {formatted_args}")
    print(f"{'='*60}")

    result = await session.call_tool(name, arguments)

    texts = []
    for block in result.content:
        if hasattr(block, "text"):
            texts.append(block.text)
    combined = "\n".join(texts)
    print(combined)
    return combined


class TestResult:
    """Track test results"""
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.error = None
        
    def mark_pass(self):
        self.passed = True
        print(f"✅ {self.name} - PASSED")
        
    def mark_fail(self, error: str):
        self.passed = False
        self.error = error
        print(f"❌ {self.name} - FAILED: {error}")


async def run_tests(session: ClientSession, target_url: str) -> list[TestResult]:
    """Run all execute_script tests"""
    results = []
    
    # Navigate to test page
    await call_tool(session, "navigate", {"url": target_url})
    await asyncio.sleep(1)  # Let page load
    
    # Test 1: Simple expression
    test = TestResult("Simple Expression (2 + 2)")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return 2 + 2;"
        })
        if "Result: 4" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected '4', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 2: Get document title
    test = TestResult("Get Document Title")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return document.title;"
        })
        if "Script Execution Test" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected 'Script Execution Test', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 3: Get element text
    test = TestResult("Get Element Text (Counter)")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return document.getElementById('counter').textContent;"
        })
        if "Result: 0" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected '0', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 4: Modify DOM
    test = TestResult("Modify DOM (Set Message)")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": """
                document.getElementById('message').textContent = 'Modified by test';
                return document.getElementById('message').textContent;
            """
        })
        if "Modified by test" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected 'Modified by test', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 5: Script with arguments (single arg)
    test = TestResult("Script with Single Argument")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return arguments[0] * 2;",
            "args": [21]
        })
        if "Result: 42" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected '42', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 6: Script with multiple arguments
    test = TestResult("Script with Multiple Arguments")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return window.addNumbers(arguments[0], arguments[1], arguments[2]);",
            "args": [10, 20, 15]
        })
        if "Result: 45" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected '45', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 7: Return object
    test = TestResult("Return Object (Page Info)")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return window.getPageInfo();"
        })
        # Check for JSON structure with expected keys
        if all(key in result for key in ['"title"', '"url"', '"timestamp"', '"counter"']):
            if "Script Execution Test" in result:
                test.mark_pass()
            else:
                test.mark_fail(f"Object missing expected title value: {result}")
        else:
            test.mark_fail(f"Expected object with title/url/timestamp/counter, got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 8: Return array
    test = TestResult("Return Array")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return [1, 2, 3, 'test', true];"
        })
        if all(str(item) in result for item in [1, 2, 3, 'test', 'true']):
            test.mark_pass()
        else:
            test.mark_fail(f"Expected array [1,2,3,'test',true], got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 9: Get attribute from hidden element
    test = TestResult("Get Hidden Element Attribute")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return document.getElementById('data-store').dataset.secret;"
        })
        if "hidden-value-12345" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected 'hidden-value-12345', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 10: DOM manipulation with return value
    test = TestResult("DOM Manipulation (Add List Item)")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": "return window.addListItem('Test Item 3');"
        })
        if "Result: 3" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected list length '3', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 11: Async script with callback
    test = TestResult("Async Script with setTimeout")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": """
                var callback = arguments[arguments.length - 1];
                setTimeout(function() {
                    callback('Async complete');
                }, 500);
            """,
            "async": True
        })
        if "Async complete" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected 'Async complete', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 12: Async script with Promise
    test = TestResult("Async Script with Promise")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": """
                var callback = arguments[arguments.length - 1];
                window.fetchDataAsync().then(function(data) {
                    callback(data);
                });
            """,
            "async": True
        })
        if all(key in result for key in ['"status"', '"data"', '"timestamp"']):
            if "success" in result and "Async data loaded" in result:
                test.mark_pass()
            else:
                test.mark_fail(f"Async object missing expected values: {result}")
        else:
            test.mark_fail(f"Expected async result object, got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    # Test 13: Async script with arguments and callback
    test = TestResult("Async Script with Arguments")
    results.append(test)
    try:
        result = await call_tool(session, "execute_script", {
            "script": """
                var multiplier = arguments[0];
                var callback = arguments[arguments.length - 1];
                setTimeout(function() {
                    callback(42 * multiplier);
                }, 300);
            """,
            "args": [2],
            "async": True
        })
        if "Result: 84" in result:
            test.mark_pass()
        else:
            test.mark_fail(f"Expected '84', got: {result}")
    except Exception as e:
        test.mark_fail(str(e))
    
    return results


async def main(browser: str) -> None:
    # Start local test server
    test_pages_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test-pages")
    port = find_free_port()
    server = start_test_server(port, test_pages_dir)
    TARGET_URL = f"http://localhost:{port}/script-execution-test.html"
    
    print(f"Started local test server on port {port}")
    print(f"Serving directory: {test_pages_dir}")
    print(f"Browser: {browser}")
    print(f"Target URL: {TARGET_URL}\n")
    
    all_results = []

    try:
        server_params = StdioServerParameters(
            command="node",
            args=[SERVER_SCRIPT],
        )

        print(f"Starting MCP Selenium server: node {SERVER_SCRIPT}\n")

        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()

                # List available tools
                tools_result = await session.list_tools()
                print(f"Available tools ({len(tools_result.tools)}):")
                for tool in tools_result.tools:
                    print(f"  - {tool.name}: {tool.description}")

                # Start headless browser
                await call_tool(session, "start_browser", {
                    "browser": browser,
                    "options": {"headless": True},
                })

                # Run all tests
                all_results = await run_tests(session, TARGET_URL)

                # Close the browser session
                await call_tool(session, "close_session", {})

    finally:
        # Kill the test server
        print(f"\nShutting down local test server on port {port}...")
        server.shutdown()
        server.server_close()
        print("Test server stopped.")

    # Print comprehensive test report
    print("\n" + "="*60)
    print("TEST REPORT")
    print("="*60)
    print(f"Browser: {browser}")
    print(f"Test URL: {TARGET_URL}")
    print(f"Test Page: script-execution-test.html")
    print("="*60)

    passed_tests = [r for r in all_results if r.passed]
    failed_tests = [r for r in all_results if not r.passed]

    print(f"\nTotal Tests: {len(all_results)}")
    print(f"Passed: {len(passed_tests)}")
    print(f"Failed: {len(failed_tests)}")
    
    if failed_tests:
        print("\n❌ FAILED TESTS:")
        for test in failed_tests:
            print(f"  • {test.name}")
            print(f"    Error: {test.error}")
    
    if passed_tests:
        print("\n✅ PASSED TESTS:")
        for test in passed_tests:
            print(f"  • {test.name}")

    print("\n" + "="*60)
    if len(failed_tests) == 0:
        print("RESULT: SUCCESS - All tests passed!")
    else:
        print(f"RESULT: FAILED - {len(failed_tests)} test(s) failed")
    print("="*60)

    # Exit with appropriate code
    if len(failed_tests) > 0:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test mcp-selenium execute_script with a specified browser")
    parser.add_argument(
        "browser",
        choices=["chrome", "firefox", "edge"],
        help="Browser to use for testing (chrome, firefox, or edge)"
    )
    
    args = parser.parse_args()
    asyncio.run(main(args.browser))
