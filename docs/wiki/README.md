# Nenya Code Wiki

This wiki is a code-grounded map of the Nenya Chrome extension.

Use it top-down:
1. Read [Architecture.md](./Architecture.md) for runtime boundaries and flows.
2. Read [Project-Layout.md](./Project-Layout.md) to find source ownership quickly.
3. Read feature pages in [Features/](./Features/) for behavior, contracts, data touches, and edge cases.
4. Use [API-and-Interfaces.md](./API-and-Interfaces.md) and [Data-Model.md](./Data-Model.md) while debugging or extending message/storage contracts.
5. Use [Operations.md](./Operations.md) and [Contributing.md](./Contributing.md) for setup and change workflow.

## Table of Contents
- [Architecture](./Architecture.md)
- [Project Layout](./Project-Layout.md)
- [Feature: Raindrop Sync and Sessions](./Features/Raindrop-Sync-and-Sessions.md)
- [Feature: LLM Content Collection and Injection](./Features/LLM-Content-and-Injection.md)
- [Feature: Clipboard, Screenshot, and Editor](./Features/Clipboard-Screenshot-and-Editor.md)
- [Feature: Screen Recording](./Features/Screen-Recording.md)
- [Feature: Rule-Based Page Automation](./Features/Rule-Based-Page-Automation.md)
- [Feature: Popup, Home, and Search UX](./Features/Popup-Home-and-Search.md)
- [Feature: Options, OAuth, Backup, and Import/Export](./Features/Options-OAuth-Backup-and-ImportExport.md)
- [Feature: Tab and Window Utilities](./Features/Tab-and-Window-Utilities.md)
- [API and Interfaces](./API-and-Interfaces.md)
- [Data Model](./Data-Model.md)
- [Operations](./Operations.md)
- [Contributing](./Contributing.md)

## Glossary
- `Unsorted`: Raindrop default collection (`collectionId: -1`) targeted by `saveUrlsToUnsorted` in `src/background/mirror.js`.
- `Sessions Collection`: The `nenya / sessions` Raindrop tree managed by `ensureNenyaSessionsCollection` and `ensureDeviceCollectionAndExport` in `src/background/mirror.js`.
- `Device Collection`: Per-browser sub-collection used to mirror current window/tab state (`exportCurrentSessionToRaindrop` in `src/background/mirror.js`).
- `LLM Session`: Chat orchestration unit keyed by `sessionId`, stored in `chrome.storage.session` under `llmSessionTabs` (`src/background/index.js`).
- `Rule`: URLPattern-driven config persisted in `chrome.storage.local` (examples: `autoReloadRules`, `customCodeRules`, `highlightTextRules`).
- `Prefill URL`: Temporary local-storage key used by context menu actions to open options with prefilled target URL (for example `brightModePrefillUrl`, `customCodePrefillUrl`).
- `Offscreen Document`: `src/recording/offscreen.html` + `src/recording/offscreen.js`, used because MV3 service workers cannot run `MediaRecorder` directly.
- `Popup Surface`: Extension popup UI (`src/popup/index.html`) handled by `src/popup/popup.js`.
- `Home Surface`: Full-tab UI (`src/home/index.html`) reusing the same popup controller (`src/popup/popup.js`) with `data-surface='home'`.
