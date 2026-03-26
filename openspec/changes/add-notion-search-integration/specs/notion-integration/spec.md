## ADDED Requirements
### Requirement: The Integration options section SHALL manage a Notion integration secret
The visible General options entry SHALL be labeled `Integration`, and the Integration section SHALL let the user save or clear a Notion integration secret used by popup search.

#### Scenario: Save a valid secret
- **GIVEN** the user enters a Notion integration secret in the Integration section
- **WHEN** they click `Save`
- **THEN** the extension MUST validate the secret through the background script before persisting it
- **AND** if validation succeeds it MUST store the trimmed secret in `chrome.storage.local.notionIntegrationSecret`
- **AND** the UI MUST show that Notion is configured.

#### Scenario: Reject an invalid secret
- **GIVEN** the user enters an invalid Notion integration secret
- **WHEN** they click `Save`
- **THEN** the extension MUST not store the secret
- **AND** the UI MUST show an error message explaining that validation failed.

#### Scenario: Clear the saved secret
- **GIVEN** a Notion integration secret is already stored
- **WHEN** the user clicks `Clear`
- **THEN** the extension MUST remove `chrome.storage.local.notionIntegrationSecret`
- **AND** the UI MUST return to the unconfigured state.

### Requirement: Popup search SHALL include shared Notion pages and data sources
When a Notion integration secret is configured, popup search SHALL include matching Notion pages and data sources in addition to the existing Raindrop search results.

#### Scenario: Search with Notion configured
- **GIVEN** the user has a valid Notion integration secret saved
- **WHEN** they type a popup search query with at least three characters
- **THEN** the background MUST query both Raindrop and the Notion Search API
- **AND** the popup MUST render Raindrop results first, then Notion pages, then Notion data sources
- **AND** each Notion result MUST display a `Notion` source chip plus a `Page` or `Database` type chip.

#### Scenario: Open a Notion result
- **GIVEN** popup search results include a matching Notion page or data source
- **WHEN** the user clicks the result or presses Enter while it is highlighted
- **THEN** the extension MUST open the Notion URL in the browser
- **AND** pinning and search-result weight tracking MUST work for that URL just like other popup search results.

#### Scenario: Notion search fails without blocking Raindrop
- **GIVEN** the user has a saved Notion integration secret
- **WHEN** the Notion request fails during popup search
- **THEN** the popup MUST still show any Raindrop results returned for the query
- **AND** it MUST not crash or show a blocking popup error for the Notion failure.
