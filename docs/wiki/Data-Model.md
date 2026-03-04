# Data Model

## Persistence Overview
Nenya persists state in three browser stores and one remote backend:
- `chrome.storage.sync`: account/token data (`cloudAuthTokens`).
- `chrome.storage.local`: feature settings/rules/UI state/session metadata.
- `chrome.storage.session`: transient runtime mappings (`llmSessionTabs`, `recordedVideoUrl`).
- IndexedDB (`nenya-recordings`): screen recording blob persistence.
- Raindrop API: session collections, unsorted items, options backup file.

## Local Storage Domains

### Auth and Cloud Linking
- `cloudAuthTokens` (sync): map of provider ID -> `{ accessToken, refreshToken, expiresAt }`
  - Written/read by `src/options/bookmarks.js` and `src/shared/tokenRefresh.js`.

### Rule Sets (local)
- `autoReloadRules`
- `darkModeRules`
- `brightModeWhitelist`
- `highlightTextRules`
- `videoEnhancementRules`
- `blockElementRules`
- `customCodeRules`
- `runCodeInPageRules`
- `urlProcessRules`
- `titleTransformRules`
- `autoGoogleLoginRules`

These are edited in `src/options/*.js` modules and consumed by background/content scripts.

### UX and Feature State (local)
- `notificationPreferences`
- `screenshotSettings`
- `clipboardHistory`
- `tabSnapshots`
- `pinnedShortcuts`
- `pinnedSearchResults`
- `customSearchEngines`
- `searchResultWeights`
- `editorSettings`
- `editorScreenshot`
- prefill keys: `highlightTextPrefillUrl`, `autoReloadPrefillUrl`, `brightModePrefillUrl`, `customCodePrefillUrl`
- command-nav flags: `openChatPage`, `openEmojiPage`
- `pipTabId`
- `renamedTabTitles`
- backup state: `optionsBackupState`

### Session Storage
- `llmSessionTabs`: serialized map `{ [sessionId]: { [providerId]: tabId } }`
- `recordedVideoUrl`: blob URL handoff between recorder and preview

### IndexedDB
- DB: `nenya-recordings`
- Store: `videos`
- Key: `current`
- Value shape: `{ blob, timestamp, size, type }` from `src/recording/storage.js`

## Remote Data Shapes

### Raindrop Sessions
- Collection hierarchy under `nenya / sessions` with per-device subcollections (`src/background/mirror.js`).
- Item `excerpt` JSON stores tab metadata (tabId, windowId, group metadata, pin/index).

### Raindrop Backup File
- Collection: `nenya / backup`
- File item: `options_backup.txt`
- Payload produced by `buildBackupPayload()` in `src/background/options-backup.js`:
  - `version`, `savedAt`, `rootFolder`, and the full option-key snapshot.

### Import/Export File
- Exported JSON from `src/options/importExport.js`:
  - top-level `version: 12`
  - `data` containing normalized rule/settings domains.

## Entity Relationship Diagram
```mermaid
erDiagram
  CLOUD_AUTH_TOKENS {
    string provider_id PK
    string access_token
    string refresh_token
    number expires_at
  }

  OPTION_RULE_SET {
    string key PK
    string domain
    json value
  }

  POPUP_STATE {
    string key PK
    json value
  }

  LLM_SESSION_TABS {
    string session_id PK
    json provider_tab_map
  }

  RECORDED_VIDEO {
    string key PK
    blob video_blob
    number timestamp
    number size
    string mime_type
  }

  RAINDROP_COLLECTION {
    number id PK
    string title
    number parent_id
  }

  RAINDROP_ITEM {
    number id PK
    number collection_id FK
    string link
    string title
    string excerpt_json
  }

  OPTIONS_BACKUP_FILE {
    number collection_id FK
    string filename
    number saved_at
    json payload
  }

  CLOUD_AUTH_TOKENS ||--o{ RAINDROP_COLLECTION : authenticates
  RAINDROP_COLLECTION ||--o{ RAINDROP_ITEM : contains
  RAINDROP_COLLECTION ||--|| OPTIONS_BACKUP_FILE : stores
  OPTION_RULE_SET ||--o{ POPUP_STATE : influences
  OPTION_RULE_SET ||--o{ LLM_SESSION_TABS : configures_workflows
  RECORDED_VIDEO ||--|| POPUP_STATE : preview_handoff
```

## Indexes and Migrations
- IndexedDB schema is simple (single object store, no secondary indexes).
- Key migration mechanisms in code:
  - `pinnedItems -> pinnedSearchResults` migration in `src/background/index.js` install path.
  - sync-to-local options migration in `migrateOptionsToLocal()` (`src/background/options-backup.js`).
  - highlight rule migration via `migrateHighlightRules` (`src/shared/highlightTextMigration.js`).
