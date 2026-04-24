# Safari Support

This repo keeps the Chrome extension source as the primary zero-build source tree. `manifest.safari.json` is the Safari-target manifest used when staging the source for Safari Web Extension conversion.

## Supported In The Safari Target

- Popup search across Raindrop and Notion.
- Raindrop Save to Unsorted, encrypted Save to Unsorted, and clipboard URL save.
- Options import/export and Raindrop-backed manual backup/restore.
- Clipboard text copy formats and visible-tab screenshot copy.
- Content features that rely on content scripts: dark/bright mode, element blocker, custom JS/CSS, video controls, PiP, Auto Google Login, emoji panel, and LLM content extraction.
- Tab actions that use standard `tabs` APIs, including activation and opening links.

## Disabled Or Removed For Safari

- Browser bookmark mirroring/export/search is removed from the shared implementation and the Safari target does not request the `bookmarks` permission.
- Tab group recreation is removed from the shared implementation and the Safari target does not request the `tabGroups` permission.
- Extension notifications are removed from the shared implementation and the Safari target does not request the `notifications` permission.
- Screen recording is disabled in Safari because this implementation depends on Chrome offscreen documents and downloads APIs. The Safari manifest omits `offscreen`, `downloads`, recording web resources, and the screen-recording command.
- The Safari manifest omits `chrome_url_overrides` for the new tab page until the converted extension is verified in Xcode/Safari.

## Conversion Workflow

If Xcode has not been initialized on the machine, run `xcodebuild -runFirstLaunch` once before packaging.

1. Run `npm run safari`.
2. Build and run the generated Xcode project under `.artifacts/safari-xcode`.
3. Verify OAuth callback behavior, content script injection on representative sites, popup search, Save to Unsorted, screenshots, backup/restore, and options import/export.

The script stages a Safari source copy under `.artifacts/safari-src`, replaces `manifest.json` with `manifest.safari.json` inside that staged copy, and invokes Apple's Safari Web Extension packager. You can override defaults with environment variables:

- `SAFARI_STAGE_DIR`: staged extension source directory.
- `SAFARI_PROJECT_DIR`: generated Xcode project directory.
- `SAFARI_APP_NAME`: generated app/project name.
- `SAFARI_BUNDLE_IDENTIFIER`: generated containing app bundle identifier. The embedded extension target uses `<SAFARI_BUNDLE_IDENTIFIER>.Extension` so Xcode accepts the embedded binary relationship.

The Chrome manifest remains `manifest.json`. Do not replace it in the main source tree unless intentionally packaging the Safari target from a staging directory.
