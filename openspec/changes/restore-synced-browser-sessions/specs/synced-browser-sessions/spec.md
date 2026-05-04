## ADDED Requirements
### Requirement: Current browser sessions MUST sync to Raindrop
The extension SHALL persist the current browser profile's open windows and tabs as a Raindrop child collection under `nenya / sessions`.

#### Scenario: Ensure session collection after startup or login
- **GIVEN** valid Raindrop tokens are available
- **WHEN** the extension starts, is installed/updated, or receives `mirror:ensureSessionsCollection`
- **THEN** it MUST ensure the `nenya / sessions` parent collection exists
- **AND** it MUST ensure one child collection exists for the persisted browser/device name
- **AND** it MUST export all current windows and tabs into that child collection.

#### Scenario: Export tab metadata
- **GIVEN** a browser window contains pinned tabs, ungrouped tabs, and grouped tabs
- **WHEN** a session export runs
- **THEN** each saved Raindrop item MUST store the tab URL, title, and JSON metadata in `excerpt`
- **AND** the metadata MUST include tab id, window id, pinned state, tab index, tab group id, and group title/color/collapsed state when available.

#### Scenario: Automatic refresh
- **GIVEN** a current browser session collection exists
- **WHEN** the `nenya-session-export` alarm fires
- **THEN** the extension MUST refresh the collection to match the currently open tabs without creating duplicate entries for unchanged tabs.

### Requirement: Users MUST manage synced sessions from the popup
The popup SHALL expose a Sessions panel for Raindrop-connected users.

#### Scenario: List and inspect sessions
- **GIVEN** valid Raindrop tokens are available
- **WHEN** the popup opens
- **THEN** it MUST render cached sessions when available and refresh the list from Raindrop
- **AND** expanding a session MUST show windows, tab groups, and tabs from the saved metadata.

#### Scenario: Session actions
- **GIVEN** the user acts on a session row
- **WHEN** they restore, sync, rename, choose an icon, or delete a session
- **THEN** the popup MUST send the matching background message and show local status feedback.

### Requirement: Synced sessions MUST restore tabs and groups
Saved sessions SHALL be restorable into browser windows with tab order, pinned state, and tab groups preserved where Chrome APIs support them.

#### Scenario: Restore an entire session
- **GIVEN** a saved session collection contains multiple windows with grouped and pinned tabs
- **WHEN** the user restores the session
- **THEN** the extension MUST create browser windows and tabs in saved order
- **AND** it MUST pin tabs marked as pinned and recreate tab groups with saved title, color, and collapsed state.

#### Scenario: Restore a subset
- **GIVEN** a user restores a saved window, group, or single tab from expanded session details
- **WHEN** the selected action runs
- **THEN** the extension MUST recreate only that selected window, group, or tab using the saved URL and pinned/group metadata.
