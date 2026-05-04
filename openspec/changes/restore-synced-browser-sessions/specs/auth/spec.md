## MODIFIED Requirements
### Requirement: Users MUST be able to connect to supported bookmark providers from the options page
The options experience MUST expose provider choices (currently Raindrop.io), drive the OAuth handshake through the hosted auth helper, and initialize Raindrop-backed browser sessions after a successful connection.

#### Scenario: Handle OAuth success callbacks
- **GIVEN** the OAuth helper finishes and posts an `oauth_success` message to the extension
- **WHEN** the extension persists the provider tokens and refreshes options backup state
- **THEN** it MUST dispatch `mirror:ensureSessionsCollection` so the current browser session collection exists and the auto-export alarm is active
- **AND** it MUST NOT dispatch `mirror:pull` or create local browser bookmark mirror folders.
