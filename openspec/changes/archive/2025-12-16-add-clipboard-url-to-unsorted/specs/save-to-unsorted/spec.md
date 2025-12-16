## ADDED Requirements

### Requirement: Users MUST be able to save clipboard URLs via keyboard command
The extension MUST provide a keyboard command that reads the current clipboard content and saves it to Raindrop Unsorted if it contains a valid URL.

#### Scenario: Keyboard command triggers clipboard save
- **GIVEN** the user has a URL in the clipboard
- **WHEN** the user executes the `bookmarks-save-clipboard-to-unsorted` command
- **THEN** the background MUST read the clipboard text via the scripting API
- **AND** validate the text is a valid HTTP/HTTPS URL
- **AND** invoke `saveUrlsToUnsorted` with the URL and a default title derived from the URL
- **AND** show a notification according to user preferences

#### Scenario: Keyboard command handles invalid clipboard content
- **GIVEN** the clipboard contains non-URL text or is empty
- **WHEN** the user executes the `bookmarks-save-clipboard-to-unsorted` command
- **THEN** the extension MUST show an error notification "Clipboard does not contain a valid URL"
- **AND** not attempt to save anything to Raindrop

### Requirement: Context menu MUST allow saving clipboard URL from any page
A context menu item MUST be available that saves the current clipboard URL to Raindrop Unsorted.

#### Scenario: Context menu item for clipboard save
- **GIVEN** the user right-clicks any page
- **WHEN** the context menu appears
- **THEN** a menu item "Save link in clipboard to Raindrop Unsorted" MUST be visible
- **AND** clicking it MUST read the clipboard, validate the URL, and save it via `saveUrlsToUnsorted`

#### Scenario: Context menu clipboard save with authentication failure
- **GIVEN** the user is not authenticated with Raindrop
- **WHEN** the context menu clipboard save is triggered
- **THEN** the extension MUST return an error "Not authenticated with Raindrop" without attempting the save
- **AND** show an error notification according to user preferences

### Requirement: Clipboard URL save MUST use the existing save pipeline
Saving a clipboard URL MUST follow the same normalization, URL processing, and mirroring flow as other save-to-unsorted operations.

#### Scenario: Clipboard URL normalization and processing
- **GIVEN** a URL is read from the clipboard
- **WHEN** the save operation begins
- **THEN** the URL MUST be trimmed, normalized to HTTP/HTTPS, and processed via `processUrl` with context `save-to-raindrop`
- **AND** split page URLs MUST be converted to the canonical `https://nenya.local/split` format
- **AND** the processed URL MUST be passed to `saveUrlsToUnsorted` as a single-entry array

#### Scenario: Clipboard URL mirrored to local bookmarks
- **GIVEN** the Raindrop API successfully creates the raindrop
- **WHEN** the mirroring step executes
- **THEN** the URL MUST be added to the local Unsorted bookmark folder or updated if it already exists
- **AND** the save summary MUST reflect the operation (created, updated, or skipped)

#### Scenario: Clipboard save notifications respect preferences
- **GIVEN** clipboard URL save completes successfully or fails
- **WHEN** notification preferences allow bookmark notifications for Unsorted saves
- **THEN** a success or failure notification MUST be shown
- **AND** if any notification toggle is disabled, no notification MUST appear even though the save summary is returned


