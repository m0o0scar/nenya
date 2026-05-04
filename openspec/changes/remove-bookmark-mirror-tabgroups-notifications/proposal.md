# Change: Remove bookmark mirroring and notifications

## Why
Safari support is blocked by Chrome-specific browser bookmark and notification APIs that are no longer needed. Removing these features also lets the Chrome manifest drop unused permissions and reduces review risk while preserving tab group APIs required by synced browser sessions.

## What Changes
- Remove browser bookmark mirroring/export/search code and UI, including local bookmark folder management and any `chrome.bookmarks` dependencies.
- Remove extension notification preferences, notification UI, notification storage, and background notification call paths.
- Keep Raindrop authentication, Save to Unsorted, options backup/restore, Notion search, LLM workflows, and page/content tools where they do not require removed APIs.
- Update public documentation and manifest permissions to match the reduced feature set.

## Impact
- Affected specs: `auth`, `raindrop-pull`, `notifications`, `options-restore-backup`, `save-to-unsorted`, `copy-title-url-screenshot`
- Affected code: `manifest.json`, `src/background`, `src/popup`, `src/options`, `src/shared`, `README.md`, `docs`
