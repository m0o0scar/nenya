## MODIFIED Requirements
### Requirement: Connection state MUST gate provider-dependent UI affordances
Interface elements that rely on a logged-in provider MUST stay hidden or disabled until valid tokens exist, but provider authentication MUST NOT trigger local browser bookmark mirroring or notification UI.

#### Scenario: Logged-in UI behavior
- **GIVEN** valid tokens are present for the selected provider
- **THEN** the status line MUST render in the success style with the formatted expiration timestamp
- **AND** the Connect button label MUST switch to `Reconnect`
- **AND** backup/restore and Save to Unsorted affordances MAY become available
- **AND** Pull/Reset mirror controls, root-folder configuration, and notification sections SHALL NOT be shown.

#### Scenario: OAuth callback does not start mirroring
- **GIVEN** the OAuth helper posts an `oauth_success` message to the extension
- **WHEN** the extension persists the provider tokens and refreshes options backup state
- **THEN** it SHALL NOT dispatch `mirror:pull`, create browser bookmark folders, or initialize notification sections.
