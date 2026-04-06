# Change: remove split and highlight text features

## Why
The product no longer wants to ship split-screen or highlight-text capabilities. Both features currently remain wired into the extension runtime, UI, and stored settings flows, so they need a coordinated removal rather than a partial hide.

## What Changes
- Remove split and merge commands, context menu entries, and background handlers.
- Remove highlight text popup entry points, options UI, content script runtime, and related storage/import-export/backup handling.
- Remove highlight-text capability requirements from OpenSpec and update related specs that currently expose the feature in pinned shortcuts and backup payloads.
- Remove user-facing documentation references to both capabilities.

## Impact
- Affected specs: `highlight-text`, `pinned-shortcuts`, `options-restore-backup`
- Affected code: `manifest.json`, `src/background/index.js`, `src/shared/contextMenus.js`, `src/popup/popup.js`, `src/options/index.html`, `src/options/options.js`, `src/options/pinnedShortcuts.js`, `src/options/importExport.js`, `src/background/options-backup.js`, `README.md`
- Additional note: split-screen is currently implemented in code but does not have a current spec under `openspec/specs`; this change removes that undocumented runtime behavior and leaves the unfinished `update-split-screen-current-display` proposal superseded by product direction.
