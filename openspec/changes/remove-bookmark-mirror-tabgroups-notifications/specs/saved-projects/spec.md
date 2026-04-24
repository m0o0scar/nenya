## MODIFIED Requirements
### Requirement: Restored tabs MUST not use browser tab groups
Project or collection tab-opening workflows SHALL open the required tabs without attempting to create or update browser tab groups.

#### Scenario: Open restored tabs
- **WHEN** a workflow opens multiple tabs from saved data
- **THEN** it SHALL create the tabs in the requested order where possible
- **AND** it SHALL NOT call `chrome.tabs.group`, `chrome.tabs.ungroup`, or `chrome.tabGroups.update`
- **AND** the result summary SHALL omit grouped-tab counts.
