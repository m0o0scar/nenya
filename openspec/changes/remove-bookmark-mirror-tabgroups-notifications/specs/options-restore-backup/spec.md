## MODIFIED Requirements
### Requirement: Backup payload MUST cover supported configurable categories only
Manual backups SHALL serialize supported configurable options into a plain JSON payload and SHALL omit removed browser bookmark mirror and notification settings.

#### Scenario: Backup excludes removed categories
- **WHEN** a manual backup builds its payload
- **THEN** it SHALL NOT include `mirrorRootFolderSettings` or `notificationPreferences`
- **AND** restore SHALL ignore those fields if present in older backup files
- **AND** supported categories such as auto reload rules, dark mode rules, bright mode settings, video enhancement rules, block element rules, custom code rules, LLM prompts, URL process rules, auto Google login rules, screenshot settings, title transform rules, pinned shortcuts, and custom search engines SHALL continue to round-trip.
