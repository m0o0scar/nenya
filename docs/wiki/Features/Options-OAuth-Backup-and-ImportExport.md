# Feature: Options, OAuth, Backup, and Import/Export

## What This Feature Does
User-facing:
- Connects/disconnects Raindrop account via OAuth callback.
- Configures all rule-driven features in sectioned options UI.
- Supports manual backup/restore/reset and automatic backup behavior.
- Exports/imports complete settings payload with normalization and migrations.

System-facing:
- Uses module-per-section architecture under `src/options/`.
- Coordinates with background backup service through typed runtime messages.

## Key Modules and Responsibilities
- `src/options/options.js`
  - `NavigationManager` controls hash-based section routing.
- `src/options/bookmarks.js`
  - OAuth provider integration; stores `cloudAuthTokens` in sync storage.
  - Handles external OAuth callback via `chrome.runtime.onMessageExternal`.
- `src/options/backup.js`
  - Floating backup controls; sends `optionsBackup:*` message types.
- `src/background/options-backup.js`
  - Option migration and persistence contract for backup payload.
  - `runManualBackup` (line 793), `runManualRestore` (line 840), `runStartupSync` (line 747), `runAutomaticRestore` (line 705).
  - Runtime dispatcher `handleOptionsBackupMessage` (line 987).
- `src/options/importExport.js`
  - Export schema `EXPORT_VERSION = 12`.
  - Rich normalization + migration paths before apply.

## Public Interfaces
External OAuth message:
- `oauth_success` received by `src/options/bookmarks.js` via `chrome.runtime.onMessageExternal`.

Background runtime messages:
- `optionsBackup:getStatus`
- `optionsBackup:backupNow`
- `optionsBackup:restoreNow`
- `optionsBackup:resetDefaults`
- constants also define `optionsBackup:restoreAfterLogin` and `optionsBackup:syncAfterLogin` in `src/shared/optionsBackupMessages.js`.

## Data Model / Storage Touches
- `chrome.storage.sync`
  - `cloudAuthTokens` (provider token map).
- `chrome.storage.local`
  - `optionsBackupState` (backup state metadata).
  - Full option key set backed up by `OPTION_KEYS` in `src/background/options-backup.js` (rules, prompts, shortcuts, screenshot settings, search engines, etc.).
- Backup payload files (remote)
  - Stored as `options_backup.txt` in Raindrop collection `nenya / backup`.

## Main Control Flow
```mermaid
sequenceDiagram
  participant Opt as options/bookmarks.js
  participant Bg as background/options-backup.js
  participant Rd as Raindrop API

  Opt->>Opt: receive oauth_success external message
  Opt->>Opt: store cloudAuthTokens (sync)
  Opt->>Bg: optionsBackup:syncAfterLogin
  Note over Bg: handleOptionsBackupMessage currently
  Note over Bg: handles status/backup/restore/reset only

  Opt->>Bg: optionsBackup:backupNow (manual)
  Bg->>Bg: buildBackupPayload()
  Bg->>Rd: upload options_backup.txt
  Bg-->>Opt: state update
```

## Error Handling and Edge Cases
- Startup sync resolves local-vs-remote recency using timestamps (`lastBackupAt` vs remote last-modified).
- During restore, `isRestoring` guards auto-backup listener from backup loops.
- Import/Export sanitizes all domains and migrates legacy highlight formats before write.
- Known contract mismatch:
  - `bookmarks.js` sends `optionsBackup:syncAfterLogin`, but `handleOptionsBackupMessage` does not currently route this type.

## Observability
- Console logs use `[bookmarks]`, `[options-backup]`, and `[options:*]` module prefixes.
- Toast status feedback is emitted in options UI modules.

## Tests
- No automated tests are configured for options or backup/import workflows.
