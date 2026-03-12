## ADDED Requirements
### Requirement: The extension SHALL expose explicit split and merge triggers
The extension SHALL provide dedicated split-screen triggers through both keyboard commands and context menus.

#### Scenario: Keyboard commands expose split and merge
- **WHEN** the user opens Chrome's extension keyboard shortcut settings
- **THEN** the extension MUST expose one dedicated command for split and one dedicated command for merge
- **AND** those commands MUST be distinct from window resize shortcuts

#### Scenario: Context menu exposes split and merge
- **WHEN** the user opens the extension context menu on a page
- **THEN** the extension MUST show one `Split` action and one `Merge` action
- **AND** invoking either menu item MUST execute the same handler as the corresponding keyboard command

### Requirement: Split SHALL only affect windows on the current display
When the user triggers split, the extension SHALL only consider normal browser windows that belong to the same display as the active window.

#### Scenario: Split ignores windows on other displays
- **GIVEN** the user has browser windows open across multiple displays
- **WHEN** the user triggers split from a window on one display
- **THEN** the extension MUST only count, create, arrange, and focus windows that belong to that same display
- **AND** windows on other displays MUST remain unchanged

#### Scenario: Split uses highlighted tabs or the active tab
- **GIVEN** the user triggers split in the current window
- **WHEN** one or more tabs are highlighted
- **THEN** the extension MUST split the highlighted tabs in ascending tab-index order
- **AND** when no tabs are highlighted it MUST split the active tab only

#### Scenario: Split aborts when the current-display window total would exceed twelve
- **GIVEN** the active display currently has `N` eligible windows
- **AND** the user selected `M` tabs to split
- **WHEN** `N + M` is greater than `12`
- **THEN** the extension MUST show an alert explaining that there are too many windows to split further
- **AND** it MUST abort without moving tabs or resizing windows

#### Scenario: Split closes an emptied source window implicitly
- **GIVEN** the source window contains only the tabs being split out
- **WHEN** the split operation moves those tabs into new windows
- **THEN** the emptied source window MUST not be counted in the final layout
- **AND** the final arranged window count MUST reflect only remaining and newly created windows

### Requirement: Split SHALL arrange current-display windows into supported grids
After creating new windows for the selected tabs, the extension SHALL arrange the current-display windows into a supported grid layout while preserving ordering.

#### Scenario: Split preserves existing windows before newly created windows
- **GIVEN** the active display already has existing windows before split runs
- **WHEN** the extension builds the arranged window list
- **THEN** existing current-display windows and the leftover source window, when it still exists, MUST appear before newly created windows
- **AND** newly created windows MUST preserve the original selected-tab order

#### Scenario: Split picks layout by final current-display window count
- **WHEN** the final current-display window count is `2`, `3`, `4`, `6`, `9`, or `12`
- **THEN** the extension MUST arrange windows using these layouts:
- **AND** `2` uses left/right on landscape displays and top/bottom on portrait displays
- **AND** `3` uses left/middle/right on landscape displays and top/middle/bottom on portrait displays
- **AND** `4` uses a `2 x 2` grid
- **AND** `6` uses a `2 x 3` grid
- **AND** `9` uses a `3 x 3` grid
- **AND** `12` uses a `3 x 4` grid

### Requirement: Merge SHALL consolidate current-display windows into one window
When the user triggers merge, the extension SHALL gather tabs from all eligible windows on the current display and place them into one window only.

#### Scenario: Merge ignores other displays
- **GIVEN** the user has browser windows open on multiple displays
- **WHEN** the user triggers merge from one display
- **THEN** only windows on that same display MUST contribute tabs to the merged result
- **AND** windows on other displays MUST remain unchanged

#### Scenario: Merge combines all current-display tabs into the active window
- **GIVEN** the active display has more than one eligible window
- **WHEN** the user triggers merge
- **THEN** the extension MUST use the current active window as the merge target
- **AND** it MUST move all tabs from the other current-display windows into that target window
- **AND** it MUST preserve each moved tab's pinned status
- **AND** it MUST recreate moved tab groups in the target window with their original title, color, and collapsed state
- **AND** once merge completes there MUST be a single remaining current-display window
