# Multi-Tab/Window Usage Guide

This guide provides examples and best practices for using the new multi-tab/window management tools.

## Available Tools

-   `get_window_handles`: Retrieves all active window handles.
-   `get_current_window_handle`: Gets the handle of the currently focused window.
-   `switch_to_window`: Switches focus to a specific window by its handle.
-   `switch_to_latest_window`: Switches to the most recently opened window.
-   `close_current_window`: Closes the currently active window.

## Example Workflow

Here’s a common workflow for handling multiple tabs:

1.  **Start a browser and navigate to a page.**
    ```json
    {
      "tool": "start_browser",
      "browser": "chrome"
    }
    {
      "tool": "navigate",
      "url": "https://example.com"
    }
    ```

2.  **Click a link that opens a new tab.**
    ```json
    {
      "tool": "click_element",
      "by": "css",
      "value": "a[target='_blank']"
    }
    ```

3.  **Get all window handles to see the new tab's handle.**
    ```json
    {
      "tool": "get_window_handles"
    }
    ```
    *Output might look like: `Window handles: CDwindow-ABC, CDwindow-DEF`*

4.  **Switch to the new tab.**
    You can either switch by the specific handle or use `switch_to_latest_window`.
    ```json
    {
      "tool": "switch_to_latest_window"
    }
    ```

5.  **Perform actions in the new tab.**
    ```json
    {
      "tool": "get_element_text",
      "by": "css",
      "value": "h1"
    }
    ```

6.  **Close the new tab and switch back to the original.**
    ```json
    {
      "tool": "close_current_window"
    }
    {
      "tool": "switch_to_window",
      "handle": "CDwindow-ABC"
    }
    ```

## Best Practices

-   **Always get handles after opening a new tab:** Don't assume the handle format. Call `get_window_handles` to get the correct identifiers.
-   **Use `switch_to_latest_window` for simplicity:** It's the easiest way to switch to a newly opened tab without needing to manage handles manually.
-   **Be mindful of context:** After closing a tab, the driver's focus may be lost. Always switch back to a valid window handle to continue working.
