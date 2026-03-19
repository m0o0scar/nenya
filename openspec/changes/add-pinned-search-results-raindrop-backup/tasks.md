## 1. Specification
- [x] 1.1 Add an `options-restore-backup` spec delta for dedicated pinned search results Raindrop sync
- [x] 1.2 Validate the OpenSpec change with `openspec validate --strict`

## 2. Implementation
- [x] 2.1 Add a shared pinned search results normalization helper
- [x] 2.2 Implement a dedicated background backup/restore service for `pinnedSearchResults`
- [x] 2.3 Wire startup, alarm, storage-change, and login-triggered sync into the background lifecycle
- [x] 2.4 Reuse the shared normalization helper in existing popup/import-export code

## 3. Verification
- [x] 3.1 Run targeted syntax checks for changed JavaScript files
- [x] 3.2 Review the final diff and commit the repository
