## ADDED Requirements
### Requirement: Pinned search results MUST support dedicated Raindrop backup and restore
The system SHALL back up the `pinnedSearchResults` list independently from the general options payload so popup-pinned search items can be restored from their own Raindrop file.

#### Scenario: Backup pinned search results to a dedicated root collection
- **GIVEN** `chrome.storage.local.pinnedSearchResults` changes while the user is connected to Raindrop
- **WHEN** the debounced backup runs
- **THEN** the system MUST normalize the list to entries containing `title`, `url`, and `type` strings
- **AND** it MUST ensure a root-level collection named `nenya / pinned search results` exists
- **AND** it MUST replace the prior backup contents with a single file item named `pinned_search_results.json`
- **AND** the file contents MUST be plain JSON containing the normalized list and backup metadata.

#### Scenario: Restore pinned search results from Raindrop on sync checks
- **GIVEN** the pinned search results backup collection exists in Raindrop
- **WHEN** startup sync, periodic restore checks, or post-login sync determines the remote file is newer than the local backup timestamp
- **THEN** the system MUST download and parse `pinned_search_results.json`
- **AND** it MUST normalize the parsed list before writing it to `chrome.storage.local.pinnedSearchResults`
- **AND** if no valid backup file exists, it MUST leave local pinned search results unchanged and surface a non-success result instead of applying partial data.
