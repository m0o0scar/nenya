# Change: Remove synced browser sessions

## Why
The Raindrop-backed synced browser sessions feature is being removed so Nenya no longer creates, displays, restores, or continuously exports browser sessions to Raindrop.

## What Changes
- Remove the popup and new-tab Sessions UI and all session restore/rename/delete controls.
- Stop creating `nenya / sessions`, stop exporting current tabs on a one-minute alarm, and remove session-specific background message handlers.
- Clear local session caches/preferences and the legacy auto-export alarm without deleting remote Raindrop collections.
- Update public documentation to stop advertising synced browser sessions or session export cover uploads.

## Impact
- Affected specs: auth
- Affected code: `src/popup`, `src/home`, `src/background/index.js`, `src/background/mirror.js`, `src/options/bookmarks.js`
