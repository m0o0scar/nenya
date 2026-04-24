# Bookmark Provider Authentication Specification

## Purpose
Document the provider authentication flow for Raindrop-backed features, including OAuth, token storage, UI state, and logout cleanup.

## Requirements

### Requirement: Users MUST be able to connect to supported bookmark providers from the options page
The options experience MUST expose provider choices (currently Raindrop.io) and drive the OAuth handshake through the hosted auth helper.

#### Scenario: Present provider selection and status
- **GIVEN** the user opens the Cloud Bookmarks Provider section in `src/options/index.html`,
- **THEN** the provider dropdown MUST be populated from the `PROVIDERS` list (`src/options/bookmarks.js`),
- **AND** the provider description and status message MUST reflect whether cached tokens exist and their expiration (displaying success copy + expiry when valid, or errors when expired/missing),
- **AND** the Connect button MUST be visible whenever a provider is selected, with the Disconnect button only shown while connected.

#### Scenario: Start an OAuth session for the selected provider
- **GIVEN** a provider is selected and the user presses Connect (or Reconnect),
- **THEN** the extension MUST open a new tab to `https://ohauth.vercel.app/oauth/<oauthProviderId>?state=<payload>`,
- **AND** the `state` payload MUST JSON-encode the extension ID and provider ID so the OAuth helper can call back the correct extension instance.

#### Scenario: Handle OAuth success callbacks
- **GIVEN** the OAuth helper finishes and posts an `oauth_success` message to the extension (via `chrome.runtime.onMessageExternal`, limited to `https://ohauth.vercel.app/*` by `externally_connectable`),
- **THEN** the extension MUST persist the received access token, refresh token, and calculated `expiresAt` inside `chrome.storage.sync` under `cloudAuthTokens[providerId]`,
- **AND** show a success toast, mark the backup module as connected, trigger `OPTIONS_BACKUP_MESSAGES.RESTORE_AFTER_LOGIN`, and refresh the backup status UI.

### Requirement: Connection state MUST gate provider-dependent UI affordances
Interface elements that rely on a logged-in provider MUST stay hidden or disabled until valid tokens exist.

#### Scenario: Logged-in UI behavior
- **GIVEN** valid (non-expired) tokens are present for the selected provider,
- **THEN** the status line MUST render in the success style with the formatted expiration timestamp,
- **AND** the Connect button label MUST switch to 'Reconnect', the Disconnect button MUST become visible and enabled, and provider-dependent backup states MUST be visible.

#### Scenario: Logged-out or expired state
- **GIVEN** no tokens exist or they are expired,
- **THEN** the status message MUST indicate the disconnected/expired state in the error style, the Connect button MUST read 'Connect', and the Disconnect control plus provider-dependent backup states MUST be hidden/disabled.

### Requirement: Authentication state MUST synchronize across the extension
Stored tokens MUST inform every surface (popup, background, and options) about whether Raindrop features are available.

#### Scenario: Propagate login changes via chrome.storage
- **GIVEN** `cloudAuthTokens` in `chrome.storage.sync` changes (login, logout, or import),
- **THEN** the options page MUST re-render provider UI, and the popup MUST re-run `initializePopup()` (via `chrome.storage.onChanged`) so that Raindrop-dependent actions are available when logged in or replaced with the “Go to Options to Connect” card while logged out.

#### Scenario: Gate background actions on valid tokens
- **GIVEN** background features such as Raindrop search or Save to Unsorted attempt to run,
- **THEN** they MUST call `loadValidProviderTokens()` and short-circuit with an error message returned to callers when tokens are missing or expired, preventing unauthorized API calls.

### Requirement: Users MUST be able to disconnect and purge synced state
Disconnecting from a provider MUST revoke local access to cloud bookmarks and clear provider-dependent local data.

#### Scenario: Logout resets tokens and local caches
- **GIVEN** the user presses the Logout button,
- **THEN** the extension MUST remove the provider entry from `cloudAuthTokens`, clear saved project data, mark the backup module as disconnected, refresh backup status indicators, re-render provider UI into the logged-out state, and show an informational toast confirming local provider data was cleared.
