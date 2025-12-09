# Change: Update Highlight Text Rule Data Structure

## Why

The current highlight text rule structure is limited to a single URL pattern and a single text highlight definition per rule. Users who want to highlight the same text across multiple related URLs (e.g., `github.com/*` and `gitlab.com/*`) must duplicate entire rules. Similarly, users who want multiple different highlight styles on the same pages must create separate rules, making management cumbersome.

## What Changes

- **Data Model**: Restructure `HighlightTextRuleSettings` to support:
  - `patterns: string[]` — one or more URL patterns per rule (replaces singular `pattern`)
  - `highlights: HighlightEntry[]` — one or more highlight definitions per rule (replaces flat `type`, `value`, `textColor`, etc.)
- **Options Page UI**: Update the highlight text editor to:
  - Use a tag/chip-style UI for managing multiple URL patterns
  - Use an accordion-style expandable list for managing multiple highlight entries
  - Show a summary view in the rule details panel
- **Content Script**: Update matching logic to iterate over `patterns[]` and apply all `highlights[]`
- **Backward Compatibility**: Implement eager migration that:
  - Runs on extension load to convert legacy single-pattern/single-highlight rules
  - Integrates with backup/restore and import/export flows

## Impact

- Affected specs: `highlight-text`
- Affected code:
  - `src/contentScript/highlight-text.js` — matching and rendering logic
  - `src/options/highlightText.js` — form handling and rule management
  - `src/options/index.html` — form structure and UI elements
  - `src/options/importExport.js` — migration during import
  - `src/background/options-backup.js` — migration during restore

