## 1. Core Infrastructure
- [x] 1.1 Create storage schema for custom tab titles with URL and tab ID matching
- [x] 1.2 Implement background script for managing rename operations
- [x] 1.3 Add tab ID cleanup logic on browser startup
- [x] 1.4 Add keyboard command definition in manifest.json

## 2. Content Script Implementation
- [x] 2.1 Create content script to intercept document.title setter
- [x] 2.2 Add MutationObserver to monitor `<title>` element changes
- [x] 2.3 Implement URL and tab ID matching logic
- [x] 2.4 Handle SPA navigation detection (history events, URL changes)
- [x] 2.5 Apply title locking on page load and navigation

## 3. User Interface Integration
- [x] 3.1 Add context menu item for "Rename tab"
- [x] 3.2 Implement prompt dialog for custom title input
- [x] 3.3 Add keyboard shortcut handler
- [x] 3.4 Add pinned shortcut support in popup
- [x] 3.5 Update SHORTCUT_CONFIG with rename tab action

## 4. Registration and Wiring
- [x] 4.1 Register content script in manifest.json
- [x] 4.2 Wire up context menu click handler
- [x] 4.3 Wire up keyboard command handler
- [x] 4.4 Add message listener for rename requests

## 5. Testing and Validation
- [ ] 5.1 Test custom title persistence across page reloads
- [ ] 5.2 Test SPA navigation title locking
- [ ] 5.3 Test tab ID cleanup on browser restart
- [ ] 5.4 Test URL matching when tab ID is null
- [ ] 5.5 Test all three trigger methods (context menu, keyboard, popup)


