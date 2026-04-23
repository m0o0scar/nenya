## MODIFIED Requirements
### Requirement: Users MUST be able to connect to supported bookmark providers from the options page
The options experience MUST expose provider choices (currently Raindrop.io) and drive the OAuth handshake through the hosted auth helper without initializing synced browser sessions.

#### Scenario: Present provider selection and status
- **GIVEN** the user opens the Cloud Bookmarks Provider section in `src/options/index.html`,
- **THEN** the provider dropdown MUST be populated from the `PROVIDERS` list (`src/options/bookmarks.js`),
- **AND** the provider description and status message MUST reflect whether cached tokens exist and their expiration (displaying success copy + expiry when valid, or errors when expired/missing),
- **AND** the Connect button MUST be visible whenever a provider is selected, with the Disconnect / Pull / Reset buttons only shown while connected.

#### Scenario: Start an OAuth session for the selected provider
- **GIVEN** a provider is selected and the user presses Connect (or Reconnect),
- **THEN** the extension MUST open a new tab to `https://ohauth.vercel.app/oauth/<oauthProviderId>?state=<payload>`,
- **AND** the `state` payload MUST JSON-encode the extension ID and provider ID so the OAuth helper can call back the correct extension instance.

#### Scenario: Handle OAuth success callbacks
- **GIVEN** the OAuth helper finishes and posts an `oauth_success` message to the extension (via `chrome.runtime.onMessageExternal`, limited to `https://ohauth.vercel.app/*` by `externally_connectable`),
- **THEN** the extension MUST persist the received access token, refresh token, and calculated `expiresAt` inside `chrome.storage.sync` under `cloudAuthTokens[providerId]`,
- **AND** show a success toast, mark the backup module as connected, trigger `OPTIONS_BACKUP_MESSAGES.RESTORE_AFTER_LOGIN`, and refresh the backup status UI,
- **AND** it MUST NOT create a `nenya / sessions` collection, export open tabs, or dispatch any synced browser session initialization message.
