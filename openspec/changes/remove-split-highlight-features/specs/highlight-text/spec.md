## REMOVED Requirements
### Requirement: The options page SHALL load and sanitize highlight rules from sync storage
**Reason**: The highlight text feature is being removed from the product.
**Migration**: Existing `highlightTextRules` data is no longer loaded, rendered, backed up, imported, or restored.

### Requirement: The highlight rule form SHALL enforce valid input and provide complete rule metadata
**Reason**: The highlight text feature is being removed from the product.
**Migration**: The options form, rule editor, and detail views are removed.

### Requirement: The popup highlight shortcut SHALL prefill the options section with the active tab URL
**Reason**: The highlight text feature is being removed from the product.
**Migration**: The popup shortcut and any prefill handoff state are removed.

### Requirement: The highlight text content script SHALL apply stored rules to matching pages
**Reason**: The highlight text feature is being removed from the product.
**Migration**: The content script and runtime DOM-highlighting behavior are removed from the extension.

### Requirement: Highlight rendering SHALL stay accurate as content, navigation state, or stored rules change
**Reason**: The highlight text feature is being removed from the product.
**Migration**: No replacement behavior is provided.

### Requirement: The highlight minimap SHALL visualize result density and offer navigation
**Reason**: The highlight text feature is being removed from the product.
**Migration**: The minimap UI and navigation behavior are removed together with the feature.

### Requirement: Backward compatibility migration SHALL convert legacy rules to the new structure
**Reason**: The highlight text feature is being removed from the product.
**Migration**: Legacy highlight rule migration is removed because highlight rules are no longer processed.
