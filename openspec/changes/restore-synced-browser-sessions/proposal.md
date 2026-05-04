# Change: Restore synced browser sessions

## Why
Users need the Raindrop-backed Sessions workflow back so the current browser profile's tabs and tab groups are continuously available from other browsers and can be restored later.

## What Changes
- Restore the `nenya / sessions` Raindrop collection hierarchy, with one child collection per browser/device.
- Restore automatic export of all open windows, tabs, pinned state, and tab group metadata on a one-minute alarm and after Raindrop login/startup.
- Restore the popup Sessions panel for listing, expanding, syncing, renaming, deleting, and restoring sessions.
- Preserve existing Raindrop search, Save to Unsorted, options backup, Notion search, and LLM flows.

## Impact
- Affected specs: `auth`, `synced-browser-sessions`
- Affected code: `src/background/index.js`, `src/background/mirror.js`, `src/options/bookmarks.js`, `src/popup/index.html`, `src/popup/popup.js`, `src/popup/popup.css`
