# Changelog: Multi-Tab/Window Support

## New Features

-   **Added five new tools for multi-tab/window management:**
  - `get_window_handles`: Retrieves all active window handles.
  - `get_current_window_handle`: Gets the handle of the currently focused window.
  - `switch_to_window`: Switches focus to a specific window by its handle.
  - `switch_to_latest_window`: Switches to the most recently opened window.
  - `close_current_window`: Closes the currently active window.

## Backward Compatibility

This update is fully backward compatible. Existing tools are unaffected.

-   The `close_session` tool still closes the entire browser session, including all tabs.
-   All element interaction tools (`click_element`, `send_keys`, etc.) operate on the currently focused tab, preserving existing behavior.

Workflows that do not involve multiple tabs will continue to function as before without any changes.
