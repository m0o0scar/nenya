# Change: Add Custom Tab Rename Feature

## Why
Users need the ability to override tab titles with custom names to better organize and identify tabs, especially for SPAs where the title changes frequently or for sites with generic titles. This feature enhances tab management by allowing persistent custom titles that survive page navigation and title changes.

## What Changes
- Add a new "Rename tab" feature accessible via context menu, keyboard shortcut, and pinned shortcuts
- Implement a content script that locks tab titles by intercepting `document.title` setter and monitoring `<title>` element changes
- Store custom tab titles in local storage with URL and tab ID matching
- Clean up tab IDs from storage on browser startup to handle closed tabs
- Apply title locking on page load and SPA navigation events

## Impact
- Affected specs: `rename-tab` (new capability)
- Affected code:
  - New: `src/contentScript/rename-tab.js` (title locking logic)
  - New: `src/background/rename-tab.js` (storage management and command handlers)
  - Modified: `src/background/index.js` (integrate rename tab handlers)
  - Modified: `src/shared/contextMenus.js` (add context menu item)
  - Modified: `manifest.json` (add command, register content script)
  - Modified: `src/popup/index.js` (add pinned shortcut support)

