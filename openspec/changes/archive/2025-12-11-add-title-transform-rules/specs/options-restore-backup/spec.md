## MODIFIED Requirements

### Requirement: Backup payloads MUST cover every configurable category with normalized data and metadata

Each payload MUST be versioned JSON that contains metadata plus a sanitized copy of local settings, guaranteeing that restores are deterministic.

#### Scenario: Category inventory and sanitation

- **GIVEN** backups run, **THEN** the system MUST capture the following categories using their build/parse/apply helpers: root folder + provider linkage (`mirrorRootFolderSettings`), notification preferences, auto reload rules (identifiers generated when missing, minimum 5 s interval, sanitized URL patterns), dark mode rules, bright mode whitelist, highlight text rules (type limited to `whole-phrase|comma-separated|regex` with valid colors/patterns), block element rules (URLPattern validation and selector arrays), custom code rules (stored from `chrome.storage.local`, invalid patterns still persisted but noted), LLM prompts, URL process rules, auto Google login rules, pinned shortcuts (limited to six whitelisted shortcut ids), screenshot settings (auto-save boolean flag), **and title transform rules (URL patterns and transform operations)**.
- **AND** every `apply*` function MUST normalize incoming payloads, write them back through `chrome.storage` with `suppressBackup` to avoid echo loops, and run any needed follow-up (e.g., re-evaluating auto reload rules).

### Requirement: Options data MUST be persisted in local storage only

All option categories SHALL be stored in `chrome.storage.local` instead of `chrome.storage.sync`, including root folder settings, notification preferences, auto reload rules, dark mode rules, bright mode whitelist/settings, highlight text rules, video enhancement rules, block element rules, custom code rules, LLM prompts, URL process rules, auto Google login rules, screenshot settings, **title transform rules**, and pinned shortcuts.

#### Scenario: Option writes use local storage

- **WHEN** any option category is saved by the UI or background helpers
- **THEN** the values SHALL be written to `chrome.storage.local` under their respective keys
- **AND** no writes to `chrome.storage.sync` SHALL occur for these categories.

#### Scenario: Manual backup reads from the local copy

- **WHEN** a manual backup or restore runs
- **THEN** it SHALL read from `chrome.storage.local` for every option category listed above to assemble or apply the payload.

### Requirement: Backup payload MUST cover all configurable categories in plain JSON

Manual backups SHALL serialize all configurable options into a plain JSON payload that can be restored without CRDT metadata.

#### Scenario: Backup includes normalized categories without Automerge metadata

- **WHEN** a manual backup builds its payload
- **THEN** it SHALL include normalized values for `mirrorRootFolderSettings`, `notificationPreferences`, `autoReloadRules`, `darkModeRules`, `brightModeWhitelist`/`brightModeSettings`, `highlightTextRules`, `videoEnhancementRules`, `blockElementRules`, `customCodeRules`, `llmPrompts`, `urlProcessRules`, `autoGoogleLoginRules`, `screenshotSettings`, **`titleTransformRules`**, and `pinnedShortcuts`
- **AND** the payload SHALL omit Automerge metadata and SHALL store only plain JSON fields
- **AND** restore SHALL overwrite the corresponding local keys, applying defaults when fields are missing.

## ADDED Requirements

### Requirement: Title Transform Rules Import/Export

The JSON import/export functionality MUST include title transform rules.

#### Scenario: Export title transform rules to JSON

- **GIVEN** the user exports options to JSON
- **WHEN** building the export payload
- **THEN** the export MUST include a `titleTransformRules` field
- **AND** the field MUST contain an array of normalized title transform rule objects
- **AND** the field MUST be included even if the array is empty

#### Scenario: Import title transform rules from JSON

- **GIVEN** the user imports options from JSON
- **WHEN** the JSON contains a `titleTransformRules` field
- **THEN** the import MUST read and normalize the rules
- **AND** validate URL patterns and transform operations
- **AND** write the normalized rules to `chrome.storage.local.titleTransformRules`
- **AND** the options page UI MUST reflect the imported rules immediately

#### Scenario: Handle missing title transform rules in import

- **GIVEN** the user imports options from JSON
- **WHEN** the JSON does NOT contain a `titleTransformRules` field
- **THEN** the import MUST NOT modify existing title transform rules
- **AND** existing rules MUST be preserved unchanged
- **AND** no error or warning MUST be shown
