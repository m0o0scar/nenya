## MODIFIED Requirements
### Requirement: Save pipeline MUST persist to Raindrop without local browser bookmark mirroring
Saving URLs to Unsorted SHALL normalize/process URLs and persist them to Raindrop, but SHALL NOT mutate local browser bookmarks or send extension notifications.

#### Scenario: Save URL without browser bookmark side effects
- **WHEN** the user saves the active tab, selected tabs, or clipboard URL to Unsorted
- **THEN** the background SHALL call the Raindrop API for valid URLs and return a structured summary to the caller
- **AND** it SHALL NOT create/update/remove browser bookmarks
- **AND** it SHALL NOT emit extension notifications.

#### Scenario: Save failure feedback remains local to the invoking surface
- **WHEN** a save fails because tokens are missing, the clipboard has no valid URL, or the Raindrop API rejects the request
- **THEN** the popup/options/status surface that initiated the action SHALL show the error
- **AND** no notification preference check or extension notification SHALL run.
