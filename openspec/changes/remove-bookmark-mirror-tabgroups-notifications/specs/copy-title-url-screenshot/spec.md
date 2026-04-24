## MODIFIED Requirements
### Requirement: Clipboard and screenshot operations MUST provide feedback without extension notifications
Clipboard and screenshot commands SHALL continue to use action badges or invoking-surface status for feedback, without notification preferences or extension notifications.

#### Scenario: Clipboard operation completes
- **WHEN** a clipboard or screenshot operation succeeds or fails
- **THEN** the extension MAY update the action badge or return a structured result to the popup/context-menu command handler
- **AND** it SHALL NOT read `notificationPreferences` or call a notification helper.
