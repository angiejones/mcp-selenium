#!/usr/bin/env python3
"""
Test script for the mcp-selenium MCP server.

Starts the MCP server as a subprocess, communicates via stdio,
launches a headless browser session, navigates to a local test page,
retrieves console logs and error stack traces, then closes the session.
"""

import asyncio
import json
import os
import sys
import socket
import threading
import argparse
import re
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
    print(f"    Arguments: {json.dumps(arguments, indent=2)}")
    print(f"{'='*60}")

    result = await session.call_tool(name, arguments)

    texts = []
    for block in result.content:
        if hasattr(block, "text"):
            texts.append(block.text)
    combined = "\n".join(texts)
    print(combined)
    return combined


def validate_console_logs(logs_text: str, port: int) -> tuple[bool, list[str]]:
    """
    Validate that console logs match the expected format.
    Returns (success, list_of_errors)
    """
    errors = []

    # Expected format:
    # [INFO] 2026-02-14T17:59:48.527Z
    # ✅ JavaScript is active and modifying the DOM.
    # [INFO] 2026-02-14T17:59:48.529Z
    # Processing... (about to fail)

    print("\n" + "="*60)
    print("VALIDATING CONSOLE LOGS")
    print("="*60)

    lines = logs_text.strip().splitlines()

    # Look for both INFO logs
    expected_messages = [
        "✅ JavaScript is active and modifying the DOM.",
        "Processing... (about to fail)"
    ]
    found_messages = []

    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("[INFO]"):
            # Check timestamp format (ISO 8601)
            if not re.search(r'\[INFO\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z', line):
                errors.append(f"❌ INFO log timestamp format incorrect. Got: {line}")
            else:
                print(f"✅ Found INFO log with correct timestamp format: {line}")

            # Check next line for a message
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                print(f"   Checking next line: '{next_line}'")
                if next_line in expected_messages:
                    found_messages.append(next_line)
                    print(f"✅ Found expected message: {next_line}")
                else:
                    print(f"   (Not in expected messages)")
        i += 1

    print(f"\nExpected messages: {expected_messages}")
    print(f"Found messages: {found_messages}")

    # Verify all expected messages were found
    for expected_msg in expected_messages:
        if expected_msg not in found_messages:
            errors.append(f"❌ Expected message not found: '{expected_msg}'")

    return (len(errors) == 0, errors)


def validate_stacktrace(stacktrace_text: str, port: int) -> tuple[bool, list[str]]:
    """
    Validate that the stacktrace matches the expected format.
    Returns (success, list_of_errors)
    """
    errors = []

    print("\n" + "="*60)
    print("VALIDATING STACK TRACE")
    print("="*60)

    # Expected format:
    # Type: error
    # Message: Uncaught ReferenceError: forceSystemErrorNow is not defined
    #
    # Stack Trace:
    # Uncaught ReferenceError: forceSystemErrorNow is not defined
    #     at triggerCrash (http://localhost:PORT/logging-test.html:58:13)
    #     at processData (http://localhost:PORT/logging-test.html:53:13)
    #     at startChain (http://localhost:PORT/logging-test.html:48:13)
    #     at (anonymous) (http://localhost:PORT/logging-test.html:62:9)

    lines = stacktrace_text.strip().splitlines()

    # Check for "Type: error"
    if len(lines) > 0 and lines[0].strip() == "Type: error":
        print("✅ Found 'Type: error'")
    else:
        errors.append(f"❌ Expected 'Type: error' on first line. Got: '{lines[0] if lines else '(empty)'}'")

    # Check for "Message: ..."
    expected_message = "Message: Uncaught ReferenceError: forceSystemErrorNow is not defined"
    if len(lines) > 1 and lines[1].strip() == expected_message:
        print(f"✅ Found correct message: {lines[1].strip()}")
    else:
        errors.append(f"❌ Expected: '{expected_message}'\n   Got: '{lines[1].strip() if len(lines) > 1 else '(missing)'}'")

    # Check for "Stack Trace:" header
    stack_trace_header_found = False
    stack_trace_line_idx = -1
    for i, line in enumerate(lines):
        if line.strip() == "Stack Trace:":
            stack_trace_header_found = True
            stack_trace_line_idx = i
            print(f"✅ Found 'Stack Trace:' header at line {i}")
            break

    if not stack_trace_header_found:
        errors.append("❌ 'Stack Trace:' header not found")
        return (False, errors)

    # Validate stack trace lines
    expected_functions = ["triggerCrash", "processData", "startChain", "(anonymous)"]
    stack_lines = lines[stack_trace_line_idx + 1:]

    # First line should be the error message again
    if stack_lines and "Uncaught ReferenceError: forceSystemErrorNow is not defined" in stack_lines[0]:
        print(f"✅ Stack trace starts with error message")
        stack_lines = stack_lines[1:]  # Remove the first line for function checking

    # Check each expected function appears in order
    for func_name in expected_functions:
        found = False
        for line in stack_lines:
            if func_name in line and f"http://localhost:{port}/logging-test.html" in line:
                print(f"✅ Found stack frame: {line.strip()}")
                found = True
                break
        if not found:
            errors.append(f"❌ Stack frame not found or incorrect format for function: {func_name}")

    return (len(errors) == 0, errors)


async def main(browser: str) -> None:
    # Start local test server
    test_pages_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test-pages")
    port = find_free_port()
    server = start_test_server(port, test_pages_dir)
    TARGET_URL = f"http://localhost:{port}/logging-test.html"
    
    print(f"Started local test server on port {port}")
    print(f"Serving directory: {test_pages_dir}")
    print(f"Browser: {browser}")
    
    validation_passed = True
    all_errors = []

    try:
        server_params = StdioServerParameters(
            command="node",
            args=[SERVER_SCRIPT],
        )

        print(f"Starting MCP Selenium server: node {SERVER_SCRIPT}")
        print(f"Target URL: {TARGET_URL}\n")

        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()

                # List available tools
                tools_result = await session.list_tools()
                print(f"Available tools ({len(tools_result.tools)}):")
                for tool in tools_result.tools:
                    print(f"  - {tool.name}: {tool.description}")

                # 1. Start headless browser
                await call_tool(session, "start_browser", {
                    "browser": browser,
                    "options": {"headless": True},
                })

                # 2. Navigate to the target URL
                await call_tool(session, "navigate", {"url": TARGET_URL})

                # Small delay to let the page finish loading / errors fire
                await asyncio.sleep(2)

                # 3. Get console logs
                logs_text = await call_tool(session, "get_console_logs", {"logType": "browser"})

                # Validate console logs
                logs_valid, logs_errors = validate_console_logs(logs_text, port)
                if not logs_valid:
                    validation_passed = False
                    all_errors.extend([("Console Logs", error) for error in logs_errors])

                # 4. Look for the specific ReferenceError and get its stack trace
                EXPECTED_ERROR = "Uncaught ReferenceError: forceSystemErrorNow is not defined"

                # Parse log blocks: each starts with [SEVERE] timestamp, followed by the message
                lines = logs_text.splitlines()
                matching_timestamp: str | None = None
                i = 0
                while i < len(lines):
                    line = lines[i]
                    if line.startswith("[SEVERE]"):
                        parts = line.split()
                        ts = parts[1] if len(parts) >= 2 else None
                        # The message is on the next line(s)
                        msg_lines: list[str] = []
                        i += 1
                        while i < len(lines) and not lines[i].startswith("["):
                            if lines[i].strip():
                                msg_lines.append(lines[i])
                            i += 1
                        message = "\n".join(msg_lines)
                        if EXPECTED_ERROR in message and ts:
                            matching_timestamp = ts
                            break
                    else:
                        i += 1

                if matching_timestamp:
                    print(f"\n✅ Found expected error: {EXPECTED_ERROR}")
                    print(f"   Timestamp: {matching_timestamp}")
                    print(f"\nFetching stack trace...")
                    stacktrace_text = await call_tool(session, "get_error_stacktrace", {
                        "timestamp": matching_timestamp,
                        "maxStackLines": 0,  # unlimited
                    })

                    # Validate stack trace
                    stack_valid, stack_errors = validate_stacktrace(stacktrace_text, port)
                    if not stack_valid:
                        validation_passed = False
                        all_errors.extend([("Stack Trace", error) for error in stack_errors])
                else:
                    validation_passed = False
                    all_errors.append(("Error Detection", f"❌ Expected error NOT found: {EXPECTED_ERROR}"))

                # 5. Close the browser session
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
    print(f"Test Page: logging-test.html")
    print("="*60)

    if validation_passed:
        print("\n✅ ALL VALIDATIONS PASSED")
        print("\nTest Categories:")
        print("  ✅ Console Logs - Format and content validated")
        print("  ✅ Error Detection - Expected ReferenceError found")
        print("  ✅ Stack Trace - Complete call stack validated")
        print("\n" + "="*60)
        print("RESULT: SUCCESS")
        print("="*60)
    else:
        print("\n❌ VALIDATION FAILED")
        print(f"\nTotal Errors: {len(all_errors)}")
        print("\nErrors by Category:")

        # Group errors by category
        error_categories = {}
        for category, error in all_errors:
            if category not in error_categories:
                error_categories[category] = []
            error_categories[category].append(error)

        for category, errors in error_categories.items():
            print(f"\n  {category} ({len(errors)} error(s)):")
            for error in errors:
                print(f"    {error}")

        print("\n" + "="*60)
        print("RESULT: FAILED")
        print("="*60)

    # Exit with appropriate code
    if not validation_passed:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test mcp-selenium with a specified browser")
    parser.add_argument(
        "browser",
        choices=["chrome", "firefox", "edge"],
        help="Browser to use for testing (chrome, firefox, or edge)"
    )
    
    args = parser.parse_args()
    asyncio.run(main(args.browser))
