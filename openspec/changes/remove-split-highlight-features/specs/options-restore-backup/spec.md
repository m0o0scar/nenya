## MODIFIED Requirements
### Requirement: Extension settings backup SHALL export supported settings only
The backup and restore flows SHALL include only settings for currently supported extension capabilities.

#### Scenario: Removed feature settings are dropped
- **GIVEN** the extension exports, imports, or restores settings,
- **WHEN** highlight text data is encountered in storage or backup payloads,
- **THEN** the flow MUST omit `highlightTextRules` and related migration logic from exported payloads,
- **AND** restore/import MUST ignore any incoming highlight text payload fields without reintroducing stored rules.
