# Change: add Notion integration secret and popup search

## Why
Users already search and manage Raindrop content from the popup, but there is no way to surface related Notion content in the same workflow. The extension also lacks a dedicated place to configure a Notion integration secret.

## What Changes
- Rename the visible General options entry from `Raindrop` to `Integration`.
- Add a Notion integration secret field to the Integration section with save, clear, and validation flows.
- Extend popup search to include shared Notion pages and data sources when a secret is configured.
- Include the Notion integration secret in JSON import/export and Raindrop backup/restore.
- Update user-facing docs to mention Notion integration and backup behavior.

## Impact
- Affected specs: `notion-integration`, `options-restore-backup`
- Affected code: `src/options/index.html`, `src/options/options.js`, `src/options/importExport.js`, `src/popup/index.html`, `src/popup/popup.js`, `src/background/index.js`, `src/background/options-backup.js`
