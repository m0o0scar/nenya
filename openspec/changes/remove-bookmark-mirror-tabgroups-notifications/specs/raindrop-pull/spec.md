## REMOVED Requirements
### Requirement: Raindrop Browser Bookmark Mirroring
**Reason**: Browser bookmark mirroring/export/search depends on unsupported Safari bookmark APIs and is no longer needed.
**Migration**: Users may continue using Raindrop-backed Save to Unsorted and other remote Raindrop flows, but the extension will not create, update, delete, or search local browser bookmarks.

#### Scenario: Browser bookmarks are not mirrored
- **WHEN** the user connects a Raindrop provider or saves a URL to Raindrop
- **THEN** the extension SHALL NOT create a mirror root folder, pull Raindrop collections into browser bookmarks, export Raindrop items to browser bookmarks, or reset local browser bookmark mirrors
- **AND** the extension SHALL NOT call `chrome.bookmarks`.
