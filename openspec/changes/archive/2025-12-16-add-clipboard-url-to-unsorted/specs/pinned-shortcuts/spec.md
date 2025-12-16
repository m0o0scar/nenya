## ADDED Requirements

### Requirement: Save clipboard URL shortcut MUST be available in pinned shortcuts
Users MUST be able to pin a shortcut that saves the URL currently in the clipboard to Raindrop Unsorted collection.

#### Scenario: Add clipboard save shortcut to SHORTCUT_CONFIG
- **GIVEN** the popup loads
- **WHEN** the user has pinned the `saveClipboardToUnsorted` shortcut
- **THEN** a button with emoji 🔗 and tooltip "Save link in clipboard to unsorted" MUST render in the shortcuts container
- **AND** clicking the button MUST trigger the clipboard read and save pipeline

#### Scenario: Clipboard save shortcut handler invokes background logic
- **GIVEN** the clipboard save shortcut button is clicked in the popup
- **WHEN** the handler executes
- **THEN** it MUST send a runtime message to the background with type `clipboard:saveToUnsorted`
- **AND** display appropriate status feedback based on the response (success, error, or no valid URL)

#### Scenario: Clipboard save shortcut participates in backup/restore
- **GIVEN** a user backs up their pinned shortcuts configuration
- **WHEN** `saveClipboardToUnsorted` is in the pinned shortcuts array
- **THEN** it MUST be included in the backup payload and restored correctly from Raindrop or JSON import


