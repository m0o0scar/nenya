## MODIFIED Requirements
### Requirement: Users SHALL manage popup toolbar shortcuts
The options page SHALL let users choose which supported popup shortcuts appear in the popup toolbar, save that selection in local storage, and render only currently supported shortcut actions.

#### Scenario: Unsupported shortcuts are ignored
- **GIVEN** the stored pinned shortcut list contains IDs for removed or unknown features,
- **WHEN** the popup or options page loads pinned shortcuts,
- **THEN** it MUST ignore those IDs instead of rendering buttons or configuration rows,
- **AND** it MUST continue rendering any remaining supported shortcuts in order.
