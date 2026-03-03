# Operations

## Local Development Setup

### Prerequisites
- Node.js (for dependency installation and CI helper scripts).
- Chrome/Chromium with extension developer mode enabled.

### Install Dependencies
```bash
npm i
```
(Defined in project instructions `AGENTS.md`; runtime extension code itself is zero-build.)

### Load Extension Locally
1. Open Chrome Extensions page (`chrome://extensions`).
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select repository root (contains `manifest.json`).

## Build/Test/Lint Commands
- Build package zip (CI script):
```bash
./.github/scripts/build-extension.sh dist extension.zip
```
- Tests:
  - No real test suite is configured. `npm test` is a placeholder that exits with error (`package.json`).
- Lint/format:
  - No lint/format script is defined in `package.json`.

## Deploy/Release Process
Release automation lives in GitHub Actions:
- `.github/workflows/version-management.yml`
  - Trigger: push to `main`.
  - Bumps version in `manifest.json` and `package.json`, commits, tags `v<version>`.
- `.github/workflows/chrome-store-publish.yml`
  - Trigger: tag push `v*`, `workflow_run`, or manual dispatch.
  - Validates release tag commit, builds zip, uploads and publishes to Chrome Web Store.

Supporting scripts:
- `.github/scripts/build-extension.sh`
- `.github/scripts/publish-to-cws.sh`

## Config, Secrets, Environments

### Runtime Configuration (extension)
- OAuth token map in `chrome.storage.sync` (`cloudAuthTokens`).
- Feature/rule configs in `chrome.storage.local`.

### CI Secrets (GitHub)
- `CWS_EXTENSION_ID`
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`
- Optional: `CWS_PUBLISH_TARGET`, `CWS_PUBLISHER_ID`, `RELEASE_PUSH_TOKEN`

Reference: `docs/CI_CHROME_STORE_PUBLISH.md`.

## Common Failure Modes and Troubleshooting

### "Not authenticated with Raindrop" errors
- Cause: missing/expired tokens in `cloudAuthTokens`.
- Check: options -> account section (`src/options/bookmarks.js`).
- Behavior: token refresh attempted by `src/shared/tokenRefresh.js`; reconnect required if refresh fails.

### Options not restored right after login
- `bookmarks.js` sends `optionsBackup:syncAfterLogin`, but `handleOptionsBackupMessage` in `src/background/options-backup.js` does not currently handle this type.

### Tab switcher overlay appears but cannot activate/resolve tabs
- `src/contentScript/tab-switcher.js` depends on `tab-switcher:*` background messages not currently implemented in `src/background/index.js`.

### Custom/rule behavior not updating live
- Some content scripts gate storage change handling inconsistently (`local` reads with `sync`-area listeners in specific modules). Reloading affected tab is a practical workaround.

### Screen recording preview missing video
- Preview load order is blob URL -> IndexedDB -> base64 fallback (`src/recording/preview.js`).
- If all fail, retry recording and ensure capture permission was granted.

### URL processing on tab open not firing
- Logic is guarded by `if (chrome.webNavigation)` in `src/background/index.js`; if unavailable, open-in-new-tab URL processing is skipped.
