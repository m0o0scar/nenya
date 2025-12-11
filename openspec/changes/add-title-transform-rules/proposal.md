# Change: Add title transform rules for clipboard operations

## Why
Users need to customize page titles before copying them to the clipboard. For example, removing site names, adding prefixes/suffixes, or cleaning up titles for specific domains. This enables better organization and formatting of copied content.

## What Changes
- Add a new "Transform Title" section in the options page for managing title transform rules
- Each rule includes URL patterns and transform operations (remove, replace, prefix, suffix)
- Apply matching rules to titles before copying to clipboard (context menu and keyboard shortcuts)
- Include title transform rules in backup/restore and import/export operations

## Impact
- Affected specs: title-transform-rules (new), copy-title-url-screenshot (modified), options-restore-backup (modified)
- Affected code: `src/background/clipboard.js`, `src/options/titleTransformRules.js` (new), `src/options/index.html`, `src/options/importExport.js`, `src/shared/titleTransform.js` (new)

