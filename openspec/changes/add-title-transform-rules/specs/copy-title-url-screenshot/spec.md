## MODIFIED Requirements

### Requirement: Copy Title Format

The extension MUST support copying tab titles only.

#### Scenario: Copy single tab title

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Title"
- **THEN** the tab's title MUST be transformed using matching title transform rules
- **AND** the transformed title MUST be copied to the clipboard
- **AND** a success badge MUST be displayed
- **AND** a success notification MUST be shown (if notifications are enabled)

#### Scenario: Copy multiple tab titles

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy Title"
- **THEN** each tab's title MUST be transformed using matching title transform rules
- **AND** all transformed titles MUST be copied to the clipboard
- **AND** each title MUST be on a separate line
- **AND** the success message MUST indicate the number of tabs copied

### Requirement: Copy Title and URL Format

The extension MUST support copying tab title and URL on separate lines.

#### Scenario: Copy single tab title and URL

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Title\\nURL"
- **THEN** the tab's title MUST be transformed using matching title transform rules
- **AND** the transformed title MUST be copied on the first line
- **AND** the tab's URL MUST be copied on the second line
- **AND** the URL MUST be processed through the URL processor

#### Scenario: Copy multiple tabs title and URL

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy Title\\nURL"
- **THEN** each tab's title MUST be transformed using matching title transform rules
- **AND** each tab's information MUST be formatted as transformed title on first line, URL on second line
- **AND** each tab's information MUST be separated by a blank line
- **AND** tabs MUST be ordered by their selection order

### Requirement: Copy Title - URL Format

The extension MUST support copying tab title and URL on a single line separated by " - ".

#### Scenario: Copy single tab in dash format

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy Title - URL"
- **THEN** the tab's title MUST be transformed using matching title transform rules
- **AND** the format MUST be: `{transformedTitle} - {url}`
- **AND** the URL MUST be processed through the URL processor

#### Scenario: Copy multiple tabs in dash format

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy Title - URL"
- **THEN** each tab's title MUST be transformed using matching title transform rules
- **AND** each tab MUST be formatted as `{transformedTitle} - {url}` on separate lines
- **AND** URLs MUST be processed through the URL processor

### Requirement: Copy Markdown Link Format

The extension MUST support copying tab information as markdown links.

#### Scenario: Copy single tab as markdown link

- **GIVEN** a single tab is active
- **WHEN** the user selects "Copy [Title](URL)"
- **THEN** the tab's title MUST be transformed using matching title transform rules
- **AND** the format MUST be: `[{transformedTitle}]({url})`
- **AND** the URL MUST be processed through the URL processor

#### Scenario: Copy multiple tabs as markdown links

- **GIVEN** multiple tabs are highlighted
- **WHEN** the user selects "Copy [Title](URL)"
- **THEN** each tab's title MUST be transformed using matching title transform rules
- **AND** each tab MUST be formatted as `[{transformedTitle}]({url})` on separate lines
- **AND** URLs MUST be processed through the URL processor

### Requirement: Title Transformation

The extension MUST apply title transform rules before copying titles to the clipboard.

#### Scenario: Apply matching rules to title

- **GIVEN** title transform rules exist
- **WHEN** copying a title to clipboard
- **THEN** the system MUST find all rules that match the tab's URL
- **AND** all matching rules MUST be applied sequentially
- **AND** within each rule, operations MUST be applied in order
- **AND** only enabled rules MUST be applied

#### Scenario: No transformation when no rules match

- **GIVEN** no title transform rules match the tab's URL
- **WHEN** copying a title to clipboard
- **THEN** the original title MUST be used without transformation

#### Scenario: Transform applies to all copy formats

- **GIVEN** title transform rules match a tab's URL
- **WHEN** copying title in any format (title only, title-url, title-dash-url, markdown-link)
- **THEN** the transformed title MUST be used in all formats

