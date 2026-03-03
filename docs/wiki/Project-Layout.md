# Project Layout

## Repository Walkthrough

```text
.
├── manifest.json
├── src/
│   ├── background/        # Service worker orchestration and backend workflows
│   ├── contentScript/     # In-page automation, extraction, and overlay UIs
│   ├── popup/             # Popup/home/chat/emoji user interfaces
│   ├── options/           # Settings UI and feature-specific config editors
│   ├── editor/            # Screenshot annotation + OCR editor
│   ├── recording/         # Offscreen recorder + preview + IndexedDB storage
│   ├── shared/            # Cross-context contracts and utility modules
│   ├── libs/              # Browser-ready vendored libraries (no build)
│   └── home/              # Full-tab home surface reusing popup controller
├── assets/                # Extension icons + browser icon assets
├── docs/                  # Product docs, store metadata, CI docs
├── references/            # API references (Raindrop, OAuth, Ace, etc.)
├── .github/workflows/     # Version bump + Chrome Web Store publish automation
└── openspec/              # Change/spec artifacts
```

## Where Responsibilities Live
- Extension wiring and permissions: `manifest.json`
- Global event routing: `src/background/index.js`
- Cloud sync/session model: `src/background/mirror.js`
- Backup/restore model: `src/background/options-backup.js`
- Scheduled reload model: `src/background/auto-reload.js`
- Clipboard and screenshot flow: `src/background/clipboard.js`
- Screen recording controller: `src/background/screen-recorder.js`
- Runtime menu model: `src/shared/contextMenus.js`
- URL/title rewrite rules: `src/shared/urlProcessor.js`, `src/shared/titleTransform.js`
- Token refresh/auth contract: `src/shared/tokenRefresh.js`

## UI Entry Points
- Popup shell: `src/popup/index.html` -> `src/popup/popup.js`
- Chat UI: `src/popup/chat.html` -> `src/popup/chat.js`
- Emoji UI: `src/popup/emoji.html` -> `src/popup/emoji.js`
- Home surface: `src/home/index.html` -> `src/popup/popup.js`
- Options shell: `src/options/index.html` -> `src/options/options.js`
- Screenshot editor: `src/editor/editor.html` -> `src/editor/editor.js`
- Recording preview: `src/recording/preview.html` -> `src/recording/preview.js`

## Background Module Map
- `index.js`: command/message/context-menu dispatch, LLM tab lifecycle, split/window utilities, URL-on-open processing.
- `mirror.js`: Raindrop request client (`raindropRequest`), unsorted save, sessions fetch/restore/export, notification emission.
- `options-backup.js`: option migration to local storage, backup file upload/download, startup sync heuristics, auto-backup listener.
- `auto-reload.js`: rule normalization, URLPattern matching, per-tab alarm scheduling, action-badge countdown.
- `clipboard.js`: copy format rendering, screenshot capture, editor handoff.
- `screen-recorder.js`: offscreen document lifecycle and preview handoff.
- `tab-snapshots.js`: captures active tab thumbnails + metadata into `tabSnapshots`.

## Content Script Organization
- Page mode rules: `darkMode.js`, `bright-mode.js`, `block-elements.js`, `highlight-text.js`, `video-controller.js`, `custom-js-css.js`, `auto-google-login.js`.
- Data extraction: `getContent-general.js`, `getContent-notion.js`, `getContent-youtube.js`, `pageContentCollector.js`.
- LLM page write automation: `llmPageInjector.js`.
- Interactive overlays: `epicker.js` (+ `epicker-ui.*`), `emoji-picker.js` (+ `emoji-picker-ui.*`), `tab-switcher.js`.

## Configuration and Contracts
- Message string constants:
  - Background local constants in `src/background/index.js`
  - Shared backup message constants in `src/shared/optionsBackupMessages.js`
- Provider metadata: `src/shared/llmProviders.js`
- Storage key conventions:
  - Auth in `chrome.storage.sync`: `cloudAuthTokens`
  - Feature config in `chrome.storage.local`: rule sets and UI state
  - Session ephemeral state in `chrome.storage.session`: `llmSessionTabs`, `recordedVideoUrl`

## Release and Packaging Locations
- Package build script: `.github/scripts/build-extension.sh`
- CWS publish script: `.github/scripts/publish-to-cws.sh`
- Version automation: `.github/workflows/version-management.yml`
- CWS publish workflow: `.github/workflows/chrome-store-publish.yml`
