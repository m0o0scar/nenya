# Change: Add conflict-free options sync

## Why
The current Raindrop options flow uploads whole JSON snapshots and restores by overwrite, so concurrent edits from multiple browsers can clobber settings and cause data loss.

## What Changes
- Replace snapshot overwrite sync with a single Automerge CRDT document stored in Raindrop.
- Keep `chrome.storage.local` as the extension runtime store while treating the Raindrop Automerge document as durable multi-device sync state.
- Merge during normal startup, alarm, login, storage-change, and manual backup flows.
- Keep manual Restore as an explicit destructive recovery action that replaces local state from the remote document.

## Impact
- Affected specs: `options-restore-backup`
- Affected code: `src/background/options-backup.js`, `src/background/automerge-options-sync.js`, `src/background/index.js`, `src/options/backup.js`, `src/libs/automerge@3.2.0-mjs`
