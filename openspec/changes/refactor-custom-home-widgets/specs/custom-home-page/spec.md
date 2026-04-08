## ADDED Requirements
### Requirement: The custom home page SHALL render a widget board below the header
The custom home page SHALL keep the header fixed and treat all remaining content as widget instances rendered from persisted layout state.

#### Scenario: Render persisted widget instances
- **GIVEN** the user opens the custom home page
- **WHEN** a saved widget layout exists
- **THEN** the page MUST render the saved widgets in their stored order, size, and position below the header
- **AND** when no saved layout exists, the page MUST create a default layout containing the search widget and the sessions widget.

### Requirement: The custom home page SHALL expose a lightweight edit mode
Users SHALL manage the widget board through a single edit-mode entry point rather than always-visible widget controls.

#### Scenario: Enter and exit edit mode
- **GIVEN** the user is on the custom home page
- **WHEN** the user activates the edit layout control
- **THEN** the page MUST reveal add, remove, move, resize, and widget settings controls
- **AND** when edit mode is off, those controls MUST be hidden while widget content remains usable.

### Requirement: Widgets SHALL support smooth movement and resizing with snap-on-release
Widget interactions SHALL feel continuous during pointer movement and commit to the board grid only after the pointer is released.

#### Scenario: Drag and resize a widget
- **GIVEN** edit mode is active
- **WHEN** the user drags or resizes a widget
- **THEN** the widget MUST move or resize smoothly during the interaction
- **AND** once the interaction ends, the widget MUST snap to the nearest valid grid position and size
- **AND** the snapped layout MUST be persisted.

### Requirement: Search and sessions SHALL be widget types
The current home page functionality SHALL be preserved as first-class widgets.

#### Scenario: Render the search widget
- **GIVEN** the search widget is present on the board
- **THEN** it MUST provide bookmark search input, pinned result chips, custom search suggestions, and search results
- **AND** existing pinned-result behavior MUST continue to work inside the widget.

#### Scenario: Render the sessions widget
- **GIVEN** the sessions widget is present on the board
- **THEN** it MUST render the session list, session expansion state, and session actions that are already available on the home page today.

### Requirement: Users SHALL be able to add and remove widget instances
The home page SHALL support adding new widget instances and removing existing ones while preserving the remaining board state.

#### Scenario: Add and remove widgets in edit mode
- **GIVEN** edit mode is active
- **WHEN** the user adds a widget instance
- **THEN** the new widget MUST be inserted into the board with a valid default size and position
- **AND** when the user removes a widget instance, that widget MUST disappear immediately and the new layout MUST be persisted.

### Requirement: The custom home page SHALL support webpage widgets with iframe fallback handling
Users SHALL be able to add webpage widgets that attempt to embed any URL and degrade cleanly when the target page cannot render inside an iframe.

#### Scenario: Load a webpage widget successfully
- **GIVEN** the user adds a webpage widget and provides a URL
- **WHEN** the target page allows iframe embedding
- **THEN** the widget MUST render the page inside an iframe
- **AND** the widget MUST persist the configured URL.

#### Scenario: Show iframe fallback placeholder
- **GIVEN** a webpage widget targets a page that refuses iframe embedding or otherwise fails to render
- **WHEN** the widget detects that the embedded content is unavailable
- **THEN** the widget MUST show a well-designed fallback placeholder
- **AND** the placeholder MUST identify the target URL and provide a direct way to open it outside the widget.
