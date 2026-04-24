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

1. Stage a Safari source copy where `manifest.safari.json` is named `manifest.json`.
2. Run Apple's Safari Web Extension converter against the staged directory.
3. Build and run the generated Xcode project.
4. Verify OAuth callback behavior, content script injection on representative sites, popup search, Save to Unsorted, screenshots, backup/restore, and options import/export.

The Chrome manifest remains `manifest.json`. Do not replace it in the main source tree unless intentionally packaging the Safari target from a staging directory.
