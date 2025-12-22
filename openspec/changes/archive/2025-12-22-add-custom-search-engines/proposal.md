# Change: Add Custom Search Engines

## Why
Users need flexibility to search with their preferred search engines (e.g., DuckDuckGo, Bing, Stack Overflow) directly from the popup's bookmark search input. Currently, the popup always falls back to Google search when no bookmark/project matches are found. By allowing custom search engine shortcuts, users can type shortcuts like `dd query` or `so query` to trigger searches on their preferred platforms.

## What Changes
- Add a new options page section for managing custom search engines
- Each search engine entry includes: name (string), shortcut (string), and search URL (string with `%s` placeholder)
- Modify popup search input behavior: when text starts with `<shortcut> <query>`, replace `%s` in the search URL and open the result in a new tab
- Fall back to Google search when no shortcut is detected
- Include custom search engines in Raindrop backup/restore and JSON import/export

## Impact
- Affected specs: `custom-search-engines` (new capability), `options-restore-backup` (backup/restore integration)
- Affected code:
  - `src/popup/popup.js` - Update search input Enter key handler to detect shortcuts
  - `src/options/` - New options section for custom search engines (UI + storage)
  - `src/background/options-backup.js` - Add backup/restore handlers for custom search engines
  - `src/options/importExport.js` - Include custom search engines in JSON import/export

