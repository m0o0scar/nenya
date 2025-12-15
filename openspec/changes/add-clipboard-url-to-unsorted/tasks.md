## 1. Implementation

- [x] 1.1 Add `saveClipboardToUnsorted` shortcut to `SHORTCUT_CONFIG` in `src/popup/popup.js` with emoji 🔗, tooltip, and handler
- [x] 1.2 Add `bookmarks-save-clipboard-to-unsorted` command to `manifest.json` commands section
- [x] 1.3 Implement keyboard command handler in `src/background/index.js` that reads clipboard and invokes save pipeline
- [x] 1.4 Create context menu entry `CONTEXT_MENU_SAVE_CLIPBOARD_LINK_ID` in `src/background/index.js` with title "Save link in clipboard to Raindrop Unsorted"
- [x] 1.5 Implement context menu click handler in `src/background/index.js` that reads clipboard and invokes save pipeline
- [x] 1.6 Add helper function `readClipboardUrl` in `src/background/index.js` to read text from clipboard via scripting API
- [x] 1.7 Validate clipboard text is a valid HTTP/HTTPS URL before saving
- [x] 1.8 Wire popup shortcut handler to send runtime message to background for clipboard read and save

## 2. Testing

- [ ] 2.1 Test pinned shortcut button triggers clipboard save when URL is in clipboard
- [ ] 2.2 Test keyboard command saves clipboard URL to Raindrop Unsorted
- [ ] 2.3 Test context menu item saves clipboard URL to Raindrop Unsorted
- [ ] 2.4 Test error handling when clipboard is empty or contains non-URL text
- [ ] 2.5 Test error handling when not authenticated with Raindrop
- [ ] 2.6 Verify notifications appear according to user preferences
- [ ] 2.7 Verify saved URL appears in local Unsorted bookmark folder

## 3. Documentation

- [x] 3.1 Update any user-facing documentation if needed

