# rename-tab Specification

## Purpose
TBD - created by archiving change add-rename-tab. Update Purpose after archive.
## Requirements
### Requirement: Custom tab title storage

The system SHALL store custom tab titles with URL and tab ID for matching and persistence.

#### Scenario: Save custom title with tab metadata

- **GIVEN** the user provides a custom title for a tab
- **WHEN** the rename operation is triggered
- **THEN** the system MUST save a record containing `{ title: string, url: string, tabId: number }` to local storage
- **AND** the record MUST include the current tab's URL and ID

#### Scenario: Clean up tab IDs on browser startup

- **GIVEN** the browser starts or the extension is installed
- **WHEN** `chrome.runtime.onStartup` fires
- **THEN** the system MUST remove all `tabId` properties from stored records
- **AND** preserve the `title` and `url` properties for URL-based matching

### Requirement: Title override triggers

The system SHALL provide multiple ways to trigger the rename tab feature.

#### Scenario: Trigger via context menu

- **GIVEN** the user right-clicks on a page
- **WHEN** the user selects "Rename tab" from the context menu
- **THEN** a prompt dialog MUST appear asking for a custom title
- **AND** if the user confirms with a non-empty title, save it to storage
- **AND** if the user cancels, do nothing

#### Scenario: Trigger via keyboard shortcut

- **GIVEN** a keyboard command is defined in manifest.json
- **WHEN** the user presses the shortcut key combination
- **THEN** a prompt dialog MUST appear asking for a custom title
- **AND** handle confirmation or cancellation as in the context menu scenario

#### Scenario: Trigger via pinned shortcut

- **GIVEN** the user has pinned the rename tab shortcut in the popup
- **WHEN** the user clicks the shortcut button
- **THEN** a prompt dialog MUST appear for the active tab
- **AND** handle confirmation or cancellation as in the context menu scenario

### Requirement: Title locking mechanism

The system SHALL override document.title getter and setter to conditionally lock titles based on storage state.

#### Scenario: Override document.title getter and setter

- **GIVEN** the content script initializes
- **WHEN** the script runs
- **THEN** it MUST override both `document.title` getter and setter
- **AND** the override MUST persist for the lifetime of the page

#### Scenario: Return custom title when match exists

- **GIVEN** the document.title getter is overridden
- **WHEN** page JavaScript reads `document.title` AND a matching custom title record exists in storage
- **THEN** the getter MUST return the custom title from the record
- **AND** the original page title MUST NOT be returned

#### Scenario: Block title changes when match exists

- **GIVEN** the document.title setter is overridden
- **WHEN** page JavaScript attempts to set `document.title` AND a matching custom title record exists in storage
- **THEN** the setter MUST do nothing (no-op)
- **AND** the title MUST remain locked to the custom title

#### Scenario: Normal behavior when no match exists

- **GIVEN** the document.title getter and setter are overridden
- **WHEN** page JavaScript reads or writes `document.title` AND no matching custom title record exists in storage
- **THEN** the getter and setter MUST delegate to the original native behavior
- **AND** the page MUST be able to change its title normally

#### Scenario: Monitor title element changes

- **GIVEN** a custom title is stored for the current tab
- **WHEN** a MutationObserver detects changes to the `<title>` element
- **THEN** the content script MUST immediately restore the custom title
- **AND** the locked title MUST remain visible in the browser tab

### Requirement: Title matching logic

The system SHALL match stored titles to tabs using both tab ID and URL.

#### Scenario: Match by tab ID when available

- **GIVEN** a stored record has a non-null `tabId`
- **WHEN** the content script checks for a matching title
- **THEN** the record MUST match if `record.tabId === currentTabId`
- **AND** the custom title MUST be applied

#### Scenario: Match by URL when tab ID is null

- **GIVEN** a stored record has a null or undefined `tabId`
- **WHEN** the content script checks for a matching title
- **THEN** the record MUST match if `record.url === currentUrl`
- **AND** the custom title MUST be applied

#### Scenario: Tab ID takes precedence over URL

- **GIVEN** a stored record has both `tabId` and `url` set
- **WHEN** the tab ID matches the current tab
- **THEN** the custom title MUST be applied regardless of URL
- **AND** URL matching MUST only be used as a fallback when `tabId` is null

### Requirement: Title application timing

The system SHALL apply custom titles at critical lifecycle points.

#### Scenario: Apply on browser startup

- **GIVEN** the browser launches and the extension starts
- **WHEN** tab ID cleanup completes
- **THEN** the content script MUST check for URL-based matches
- **AND** apply custom titles to matching tabs

#### Scenario: Apply on page load

- **GIVEN** a page finishes loading
- **WHEN** the content script initializes
- **THEN** it MUST check storage for matching custom titles
- **AND** apply the custom title if a match is found

#### Scenario: Apply on SPA navigation

- **GIVEN** a single-page application changes the URL
- **WHEN** the content script detects a URL change (via history events or polling)
- **THEN** it MUST re-check storage for matching custom titles
- **AND** apply the custom title if the new URL matches a stored record

### Requirement: Custom title removal

The system SHALL allow users to remove custom titles and restore default behavior.

#### Scenario: Remove custom title

- **GIVEN** a tab has a custom title applied
- **WHEN** the user triggers rename with an empty title
- **THEN** the system MUST remove the stored record
- **AND** restore the page's original title behavior

