# API and Interfaces

## Interface Surface Overview
Nenya has no standalone HTTP server. Interfaces are:
- Chrome extension contracts (commands, context menus, runtime messages, storage).
- External callback interface (`onMessageExternal`) for OAuth success.
- Outbound HTTP calls to Raindrop and token/encryption services.

## Runtime Message Contracts
Main router: `src/background/index.js` (`chrome.runtime.onMessage.addListener`, line 3103).

### Raindrop / Sessions
- `mirror:saveToUnsorted`
- `mirror:encryptAndSave`
- `mirror:search`
- `mirror:fetchSessions`
- `mirror:fetchSessionDetails`
- `mirror:restoreSession`
- `mirror:restoreWindow`
- `mirror:restoreGroup`
- `mirror:restoreTab`
- `mirror:openAllItems`
- `mirror:saveSession`
- `mirror:ensureSessionsCollection`
- `mirror:updateSessionName`
- `mirror:deleteSession`
- `mirror:uploadCollectionCover`
- `mirror:updateRaindropUrl`

### Clipboard / Capture / Utility
- `clipboard:saveToUnsorted`
- `clipboard:takeScreenshot`
- `rename-tab`
- `launchElementPicker`
- `blockElement:addSelector`
- `open-in-popup`
- `INJECT_CUSTOM_JS`
- Legacy: `message.action === 'addClipboardItem'`

### LLM
- `collect-page-content-as-markdown`
- `collect-and-send-to-llm`
- `open-llm-tabs`
- `close-llm-tabs`
- `switch-llm-provider`
- Content callback: `page-content-collected`
- Provider injection payload: `inject-llm-data`

### Screen Recorder
- `screen-recorder:toggle`
- `screen-recorder:start-new`
- `screen-recorder:get-status`
- `screen-recorder:recording-complete`
- `screen-recorder:stream-ended`
- `screen-recorder:close-offscreen`
- `screen-recorder:get-video-blob`
- `screen-recorder:preview-opened`
- `screen-recorder:preview-closed`
- Offscreen bridge uses `screen-recorder:start` / `screen-recorder:stop` / `get-video-base64`

### Auto Reload
- `autoReload:getStatus`
- `autoReload:reEvaluate`

### Auth / Backup
- `auth:validateTokens` (from `src/shared/tokenRefresh.js`)
- `optionsBackup:getStatus`
- `optionsBackup:backupNow`
- `optionsBackup:restoreNow`
- `optionsBackup:resetDefaults`
- Constants defined but not currently dispatched by handler: `optionsBackup:restoreAfterLogin`, `optionsBackup:syncAfterLogin`

## External Message Interface
- `chrome.runtime.onMessageExternal` in `src/options/bookmarks.js` accepts:
  - `type: 'oauth_success'`
  - `provider`
  - `tokens: { access_token, refresh_token, expires_in }`
- Allowed origins are constrained by `manifest.json` `externally_connectable.matches`.

## Command Interface (Keyboard Shortcuts)
Defined in `manifest.json` and handled primarily in `src/background/index.js`:
- Bookmark/clipboard actions
- Tab/window management actions
- LLM and popup actions
- Screen recording and PiP actions
- Pinned shortcut openers (`open-pinned-shortcut-1` .. `-5`)

## Context Menu Interface
Context model and IDs: `src/shared/contextMenus.js`.
- Static groups: Copy, Raindrop, Send to LLM, Run Code, Tools/Appearance/Developer root menus.
- Dynamic IDs:
  - LLM providers: `send-to-llm-{providerId}`
  - Run code rules: `run-code-{ruleId}`
- Dispatch route: `chrome.contextMenus.onClicked` in `src/background/index.js`.

## External HTTP Interfaces
Primary outbound APIs:
- Raindrop REST base: `https://api.raindrop.io/rest/v1` (`raindropRequest` in `src/background/mirror.js`).
- Token refresh:
  - `https://ohauth.vercel.app/oauth/refresh`
  - `https://oh-auth.vercel.app/auth/raindrop/refresh`
- URL encryption service: `https://oh-auth.vercel.app/secret/encrypt`
- LLM provider pages from `src/shared/llmProviders.js`.

## AuthN/AuthZ Model
- Authentication state is provider-token based (`cloudAuthTokens` in sync storage).
- Each Raindrop operation first resolves valid tokens via `loadValidProviderTokens`/`getValidTokens`.
- Authorization scope is effectively “whoever owns the supplied provider tokens”; no internal role model exists.

## Validation and Versioning
- Message-type safety:
  - String constants are centralized for backup (`src/shared/optionsBackupMessages.js`) and token validation (`src/shared/tokenRefresh.js`).
- Rule validation:
  - URLPattern validation and normalization are implemented in each options module plus shared processors.
- Import/export versioning:
  - `src/options/importExport.js` exports with `version: 12` and performs normalization/migration on import.
- Backup payload versioning:
  - `src/background/options-backup.js` writes payload with `version: 1` for cloud backup file.
