# title-transform-rules Specification

## Purpose
TBD - created by archiving change add-title-transform-rules. Update Purpose after archive.
## Requirements
### Requirement: Title Transform Rule Structure
The system MUST store title transform rules with URL patterns and transform operations.

#### Scenario: Rule data structure
- **GIVEN** a title transform rule is stored
- **THEN** it MUST contain:
  - `id`: unique identifier (string)
  - `name`: user-friendly rule name (string)
  - `urlPatterns`: array of URL patterns (string[])
  - `operations`: array of transform operations (TitleTransformOperation[])
  - `disabled`: optional boolean flag to enable/disable the rule
  - `createdAt`: optional ISO timestamp string
  - `updatedAt`: optional ISO timestamp string

#### Scenario: Transform operation structure
- **GIVEN** a transform operation
- **THEN** it MUST contain:
  - `id`: unique identifier (string)
  - `type`: one of `'remove'`, `'replace'`, `'prefix'`, `'suffix'` (string)
  - `pattern`: regex pattern for remove/replace operations (string, required for remove/replace)
  - `value`: replacement value for replace, or text for prefix/suffix (string, required for replace/prefix/suffix)

### Requirement: Transform Operations
The system MUST support four types of transform operations: remove, replace, prefix, and suffix.

#### Scenario: Remove operation
- **GIVEN** a remove operation with pattern `/\[.*?\]/`
- **WHEN** applying to title "Article Title [Site Name]"
- **THEN** the result MUST be "Article Title "

#### Scenario: Replace operation
- **GIVEN** a replace operation with pattern `/ - Site Name$/` and value `""`
- **WHEN** applying to title "Article Title - Site Name"
- **THEN** the result MUST be "Article Title"

#### Scenario: Prefix operation
- **GIVEN** a prefix operation with value `"[READ] "`
- **WHEN** applying to title "Article Title"
- **THEN** the result MUST be "[READ] Article Title"

#### Scenario: Suffix operation
- **GIVEN** a suffix operation with value `" - Notes"`
- **WHEN** applying to title "Article Title"
- **THEN** the result MUST be "Article Title - Notes"

### Requirement: URL Pattern Matching
The system MUST match rules based on URL patterns using URLPattern API validation.

#### Scenario: Match rule by URL pattern
- **GIVEN** a rule with URL pattern `"https://example.com/*"`
- **WHEN** checking URL `"https://example.com/article"`
- **THEN** the rule MUST match

#### Scenario: Multiple URL patterns in one rule
- **GIVEN** a rule with URL patterns `["https://example.com/*", "https://test.com/*"]`
- **WHEN** checking URL `"https://test.com/page"`
- **THEN** the rule MUST match

#### Scenario: No match when URL doesn't match pattern
- **GIVEN** a rule with URL pattern `"https://example.com/*"`
- **WHEN** checking URL `"https://other.com/page"`
- **THEN** the rule MUST NOT match

### Requirement: Rule Application Order
The system MUST apply all matching rules sequentially, and within each rule, apply operations in order.

#### Scenario: Apply multiple matching rules
- **GIVEN** two rules both match a URL
- **AND** rule 1 has operation "remove /\[.*?\]/"
- **AND** rule 2 has operation "prefix '[READ] '"
- **WHEN** transforming title "Article [Site]"
- **THEN** rule 1 MUST be applied first, then rule 2
- **AND** the final result MUST be "[READ] Article "

#### Scenario: Apply operations within rule in order
- **GIVEN** a rule with operations: ["remove /\[.*?\]/", "prefix '[READ] '"]
- **WHEN** transforming title "Article [Site]"
- **THEN** operations MUST be applied in order
- **AND** the result MUST be "[READ] Article "

### Requirement: Options Page UI
The system MUST provide a "Transform Title" section in the options page for managing rules.

#### Scenario: Display transform title section
- **GIVEN** the user opens the options page
- **WHEN** navigating to the "Transform Title" section
- **THEN** a form MUST be displayed for creating/editing rules
- **AND** a list MUST show all existing rules
- **AND** each rule MUST show name, URL patterns count, and operations count

#### Scenario: Create new rule
- **GIVEN** the user is in the Transform Title section
- **WHEN** filling the form with name, URL patterns, and operations
- **AND** clicking "Add rule"
- **THEN** the rule MUST be saved to `chrome.storage.local` under key `'titleTransformRules'`
- **AND** the rule MUST appear in the list
- **AND** the form MUST be cleared

#### Scenario: Edit existing rule
- **GIVEN** an existing rule in the list
- **WHEN** clicking "Edit"
- **THEN** the form MUST be populated with rule data
- **AND** clicking "Save changes" MUST update the rule
- **AND** the updated rule MUST be saved to storage

#### Scenario: Delete rule
- **GIVEN** an existing rule in the list
- **WHEN** clicking "Delete"
- **AND** confirming the deletion
- **THEN** the rule MUST be removed from storage
- **AND** the rule MUST disappear from the list

#### Scenario: Enable/disable rule
- **GIVEN** an existing rule in the list
- **WHEN** toggling the enable/disable switch
- **THEN** the rule's `disabled` property MUST be updated
- **AND** disabled rules MUST NOT be applied during transformation

### Requirement: Rule Validation
The system MUST validate rules before saving them.

#### Scenario: Validate rule name
- **GIVEN** a rule with empty name
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "Rule name is required."

#### Scenario: Validate URL patterns
- **GIVEN** a rule with no URL patterns
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "At least one URL pattern is required."

#### Scenario: Validate URL pattern format
- **GIVEN** a rule with invalid URL pattern
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "Invalid URL pattern."

#### Scenario: Validate operations
- **GIVEN** a rule with no operations
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "At least one transform operation is required."

#### Scenario: Validate regex patterns
- **GIVEN** a remove/replace operation with invalid regex pattern
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "Invalid regex pattern."

#### Scenario: Validate required fields per operation type
- **GIVEN** a replace operation without `value`
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "Value is required for replace operation."

- **GIVEN** a prefix operation without `value`
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "Value is required for prefix operation."

- **GIVEN** a suffix operation without `value`
- **WHEN** attempting to save
- **THEN** an error MUST be shown: "Value is required for suffix operation."

### Requirement: Storage and Persistence
Title transform rules MUST be stored in `chrome.storage.local` and normalized on load.

#### Scenario: Store rules in local storage
- **GIVEN** a title transform rule is saved
- **WHEN** saving to storage
- **THEN** it MUST be stored in `chrome.storage.local` under key `'titleTransformRules'`
- **AND** the value MUST be an array of rule objects

#### Scenario: Normalize rules on load
- **GIVEN** rules are loaded from storage
- **WHEN** some rules have invalid data
- **THEN** invalid rules MUST be filtered out
- **AND** missing IDs MUST be generated
- **AND** rules MUST be sorted by name

#### Scenario: Handle missing storage key
- **GIVEN** no rules exist in storage
- **WHEN** loading rules
- **THEN** an empty array MUST be returned
- **AND** no error MUST be thrown

### Requirement: Storage Change Synchronization
The options page MUST update when rules are changed in other contexts.

#### Scenario: Update UI on storage change
- **GIVEN** the options page is open
- **WHEN** title transform rules are changed in another context
- **THEN** the options page MUST listen to `chrome.storage.onChanged`
- **AND** update the UI to reflect the changes
- **AND** clear selection if selected rule no longer exists

