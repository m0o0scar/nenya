# Implementation Tasks

## 1. Data Model and Storage
- [x] 1.1 Define custom search engine data structure: `{ id, name, shortcut, searchUrl }`
- [x] 1.2 Store custom search engines in `chrome.storage.local.customSearchEngines`
- [x] 1.3 Create helper functions: `getCustomSearchEngines()`, `saveCustomSearchEngines(engines)`, `validateSearchEngine(engine)`

## 2. Options Page UI
- [x] 2.1 Create new options section: `src/options/customSearchEngines.js`
- [x] 2.2 Add navigation link and section container in `src/options/index.html`
- [x] 2.3 Implement UI: list of engines, add/edit/delete controls
- [x] 2.4 Add validation: non-empty shortcut, unique shortcut, valid URL with `%s` placeholder
- [x] 2.5 Register section in `src/options/options.js`

## 3. Popup Search Integration
- [x] 3.1 Update `src/popup/popup.js` search Enter key handler to detect shortcuts
- [x] 3.2 Parse input: extract shortcut and query (split on first space)
- [x] 3.3 Match shortcut against saved custom search engines
- [x] 3.4 Replace `%s` in search URL with encoded query and open in new tab
- [x] 3.5 Fall back to Google search when no shortcut matches

## 4. Backup and Restore Integration
- [x] 4.1 Add custom search engines category to `src/background/options-backup.js`: `buildCustomSearchEnginesPayload`, `parseCustomSearchEnginesItem`, `applyCustomSearchEngines`
- [x] 4.2 Register category in `BACKUP_CATEGORIES`
- [x] 4.3 Test Raindrop backup/restore flow with custom search engines

## 5. Import/Export Integration
- [x] 5.1 Update `src/options/importExport.js` to include `customSearchEngines` in JSON export
- [x] 5.2 Update JSON import to read and validate `customSearchEngines` field
- [x] 5.3 Test import/export with custom search engines

## 6. Validation and Testing
- [ ] 6.1 Test adding/editing/deleting custom search engines in options
- [ ] 6.2 Test popup search with various shortcuts and queries
- [ ] 6.3 Test fallback to Google search when no shortcut detected
- [ ] 6.4 Test backup/restore includes custom search engines
- [ ] 6.5 Test import/export includes custom search engines
- [ ] 6.6 Test edge cases: empty shortcut, duplicate shortcut, invalid URL, missing `%s` placeholder

