## MODIFIED Requirements
### Requirement: Backup payload MUST cover all configurable categories in plain JSON

Manual backups SHALL serialize all configurable options into a plain JSON payload that can be restored without CRDT metadata.

#### Scenario: Backup includes normalized categories without Automerge metadata

- **WHEN** a manual backup builds its payload
- **THEN** it SHALL include normalized values for `mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules`, `darkModeRules`, `brightModeWhitelist`/`brightModeSettings`, `highlightTextRules`, `videoEnhancementRules`, `blockElementRules`, `customCodeRules`, `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, `screenshotSettings`, `titleTransformRules`, `pinnedShortcuts`, `customSearchEngines`, **and `homeWidgetConfig`**
- **AND** the payload SHALL omit Automerge metadata and SHALL store only plain JSON fields
- **AND** restore SHALL overwrite the corresponding local keys, applying defaults when fields are missing.
