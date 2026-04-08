# Change: refactor custom home page into widgets

## Why
The custom home page is currently a fixed two-card layout. Users need to treat the home page as a configurable workspace where widgets can be added, removed, moved, resized, and restored across devices through the existing Raindrop backup flow.

## What Changes
- Add a widget-based custom home board with a lightweight edit mode.
- Convert the existing search card and sessions card into movable, resizable widgets.
- Add a webpage widget that embeds arbitrary URLs in an iframe and shows a polished fallback when embedding fails.
- Persist the custom home layout in local storage and include it in the Raindrop backup payload.

## Impact
- Affected specs: `options-restore-backup`, `custom-home-page`
- Affected code: `src/home/index.html`, `src/home/home.css`, `src/popup/popup.js`, `src/background/options-backup.js`
