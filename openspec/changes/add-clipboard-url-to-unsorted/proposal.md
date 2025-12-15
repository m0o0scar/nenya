# Change: Add clipboard URL to unsorted feature

## Why
Users often have URLs in their clipboard and need a quick way to save them to their Raindrop Unsorted collection without manually pasting the URL into a browser tab first.

## What Changes
- Add a new pinned shortcut button (🔗) to save the URL currently in the clipboard to Raindrop Unsorted
- Add a context menu item "Save link in clipboard to Raindrop Unsorted" accessible from any page
- Add a keyboard command `bookmarks-save-clipboard-to-unsorted` with description "💧 Save clipboard link to Unsorted"
- Wire all three triggers to call a new background handler that reads the clipboard, validates the URL, and saves it via the existing `saveUrlsToUnsorted` pipeline

## Impact
- Affected specs: `pinned-shortcuts`, `save-to-unsorted`
- Affected code:
  - `src/popup/popup.js` - add new shortcut config and handler
  - `src/background/index.js` - add keyboard command handler, context menu setup, and clipboard read logic
  - `manifest.json` - add new command entry
  - `src/shared/shortcutConfig.js` (if extracted) - add shortcut metadata

