## REMOVED Requirements
### Requirement: Notifications Capability
**Reason**: Extension notifications are being removed to reduce unsupported Safari API usage and eliminate unused Chrome permissions.
**Migration**: Background workflows must report outcomes through existing popup/options status text, toasts, or action badge state instead of extension notifications.

#### Scenario: Notification code is absent
- **WHEN** the extension is loaded after this change
- **THEN** no options UI, storage key, backup category, or background workflow SHALL depend on `notificationPreferences` or `pushNotification`
- **AND** the manifest SHALL NOT request a notifications permission.
