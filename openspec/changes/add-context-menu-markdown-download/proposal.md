# Change: add context menu markdown download

## Why
Markdown download is currently available from the chat popup and keyboard shortcut, but not from the right-click context menu. Adding a context menu entry makes the export flow reachable from the page where the content is being collected.

## What Changes
- Add a context menu item that triggers the existing Markdown download flow.
- Reuse the same background collection and file-download pipeline already used by the `llm-download-markdown` command.
- Update the send-context-to-llm spec so the download capability includes the new context menu surface.

## Impact
- Affected specs: `send-context-to-llm`
- Affected code: `src/shared/contextMenus.js`, `src/background/index.js`
