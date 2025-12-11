## 1. Implementation
- [ ] 1.1 Create shared title transform utility (`src/shared/titleTransform.js`) with functions to match rules and apply transforms
- [ ] 1.2 Create title transform rules options page module (`src/options/titleTransformRules.js`) following the pattern of `urlProcessRules.js`
- [ ] 1.3 Add "Transform Title" section to options page HTML (`src/options/index.html`) with navigation link
- [ ] 1.4 Integrate title transform into clipboard operations (`src/background/clipboard.js`) - apply rules before formatting titles
- [ ] 1.5 Add title transform rules to import/export (`src/options/importExport.js`) - include in payload and apply functions
- [ ] 1.6 Update backup/restore to include title transform rules (`src/background/options-backup.js`)

## 2. Testing
- [ ] 2.1 Test title transform rules matching by URL pattern
- [ ] 2.2 Test all transform operations (remove, replace, prefix, suffix) individually and in combination
- [ ] 2.3 Test rule application order (all matching rules applied sequentially)
- [ ] 2.4 Test clipboard operations (context menu and keyboard shortcuts) with transform rules
- [ ] 2.5 Test backup/restore includes title transform rules
- [ ] 2.6 Test import/export includes title transform rules
- [ ] 2.7 Test edge cases (no matching rules, invalid patterns, empty titles)

