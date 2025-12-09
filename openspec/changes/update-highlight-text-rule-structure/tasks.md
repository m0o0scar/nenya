## 1. Data Model & Migration

- [ ] 1.1 Define new JSDoc types for `HighlightEntry` and updated `HighlightTextRuleSettings` in shared location
- [ ] 1.2 Implement `migrateHighlightRule(rule)` function that converts legacy single-pattern/highlight rules to new structure
- [ ] 1.3 Implement `migrateHighlightRules(rules)` wrapper that processes an array and returns migrated array
- [ ] 1.4 Update `loadRules()` in `src/contentScript/highlight-text.js` to call migration and save back if changes detected
- [ ] 1.5 Update `loadRules()` in `src/options/highlightText.js` to call migration and save back if changes detected

## 2. Content Script Updates

- [ ] 2.1 Update `matchesUrlPattern()` to accept `patterns[]` array and return true if any pattern matches
- [ ] 2.2 Update `applyHighlighting()` to iterate over `rule.highlights[]` instead of using flat rule fields
- [ ] 2.3 Update `highlightTextNode()` to accept a `HighlightEntry` instead of full rule
- [ ] 2.4 Update `createHighlightElement()` to use highlight entry's styling properties
- [ ] 2.5 Verify minimap still works correctly with new structure

## 3. Options Page Form UI

- [ ] 3.1 Update HTML: Replace single pattern input with patterns container (input + chip list)
- [ ] 3.2 Implement pattern chip/tag UI: add pattern button, removable chips, validation per pattern
- [ ] 3.3 Update HTML: Replace flat highlight fields with accordion container
- [ ] 3.4 Implement accordion UI: collapsible highlight entries, expand/collapse state, entry header preview
- [ ] 3.5 Implement "Add highlight" button that creates new collapsed entry with defaults
- [ ] 3.6 Implement delete button per highlight entry (disabled when only one remains)
- [ ] 3.7 Update form validation to require at least one pattern and one highlight

## 4. Options Page Data Handling

- [ ] 4.1 Update `clearForm()` to reset to single empty pattern chip and single default highlight entry
- [ ] 4.2 Update `validateForm()` to validate all patterns and all highlight entries
- [ ] 4.3 Update `handleFormSubmit()` to collect patterns array and highlights array from UI
- [ ] 4.4 Update `editRule()` to populate patterns chips and highlight accordion entries
- [ ] 4.5 Update `renderRulesList()` to show pattern count/summary and highlight count/summary
- [ ] 4.6 Update `showRuleDetails()` to display summary of patterns and highlights

## 5. Import/Export & Backup/Restore Integration

- [ ] 5.1 Update import flow in `importExport.js` to migrate highlight rules before merging
- [ ] 5.2 Update restore flow in `options-backup.js` to migrate highlight rules before applying
- [ ] 5.3 Verify export produces new structure (no changes needed if using `saveRules` output)

## 6. Validation & Polish

- [ ] 6.1 Test migration with legacy rules (single pattern, single highlight)
- [ ] 6.2 Test migration with already-migrated rules (idempotent check)
- [ ] 6.3 Test content script highlighting with multiple patterns and multiple highlights
- [ ] 6.4 Test options page full flow: create, edit, delete rules with new structure
- [ ] 6.5 Test import/export round-trip preserves new structure
- [ ] 6.6 Test backup/restore round-trip preserves new structure

