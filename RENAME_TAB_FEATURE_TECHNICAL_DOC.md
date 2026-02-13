# Tab Renamer: Rename Browser Tab Feature (Technical Design)

## 1. Scope

This document describes how the extension implements tab renaming (tab title + optional emoji favicon), including:

- UI entry points and rendering
- Content script and background service worker coordination
- Storage/persistence model
- Title/fallback correction behavior (including Chrome PDF viewer edge case)

The packaged extension is bundled/minified, but ships source maps. The implementation details below are traced from the mapped TypeScript sources extracted from:

- `background.js.map`
- `contentScript.js.map`
- `initializationContentScript.js.map`

Readable extracted sources are under `.analysis/recovered/src/*`.

## 2. Runtime Architecture

The rename feature is split across three runtime surfaces:

1. Background service worker
- Central message router and storage owner.
- Opens rename UI by messaging content scripts.
- Tracks tab lifecycle (`onRemoved`, `onUpdated`, `onMoved`, startup/install).

2. Initialization content script (`document_start`)
- Runs very early to apply stored renamed title quickly.
- Stashes the page’s original title before the page mutates it further.

3. Main content script (`document_end`) + React UI
- Initializes tab state from background storage.
- Injects the rename UI into a Shadow DOM host on demand.
- Applies/clears title and favicon changes in-page.

## 3. Core Data Model

### `TabSignature`
File: `.analysis/recovered/src/types.ts:27`

- `title: string | null`
- `favicon: FaviconDTO | null`

Represents the user’s customizations for a tab.

### `TabInfo`
File: `.analysis/recovered/src/types.ts:5`

- `id`, `url`, `index`
- `isClosed`, `closedAt`
- `signature: TabSignature`

Represents persisted tab state in `chrome.storage.sync`, keyed by tab ID string.

### `FaviconDTO`
File: `.analysis/recovered/src/types.ts:52`

Serialized favicon type/content. Supported runtime classes in `.analysis/recovered/src/favicon.ts`:

- `SystemEmojiFavicon` (`systemEmojiFavicon`)
- `TwemojiFavicon` (`twemojiFavicon`)
- `UrlFavicon` (`urlFavicon`)

## 4. Entry Points to Open Rename UI

Background opens UI by sending `COMMAND_OPEN_RENAME_DIALOG` to active tab:

- Toolbar icon click: `.analysis/recovered/src/background/background.ts:52`
- Context menu “Rename Tab”: `.analysis/recovered/src/background/background.ts:247`
- Command handler: `.analysis/recovered/src/background/background.ts:41`

If messaging fails (restricted pages, missing content script), it opens fallback popup:

- `.analysis/recovered/src/background/background.ts:17`
- UI text in `popup/popup.html`

## 5. Message Protocol (Content Script <-> Background)

API wrapper: `.analysis/recovered/src/backgroundScriptApi.ts`

Commands:

- `save_signature`: persist `TabSignature`
- `load_signature`: load stored signature, reconcile tab ID
- `get_tab_info`: current tab `{id,url,index}`
- `get_favicon_url`: browser-reported favicon URL
- `stash_original_title`: store original page title in memory
- `unstash_original_title`: retrieve and clear stashed title
- `refresh_current_title`: background -> content script correction command

Background message switch:

- `.analysis/recovered/src/background/background.ts:56`

## 6. End-to-End Rename Flow

## 6.1 Bootstrap and restore on page load

### Stage A: Early script (`document_start`)
File: `.analysis/recovered/src/contentScript/initializationContentScript.ts`

1. Calls `loadSignature(false)` from background.
2. Applies title immediately with `tab.setSignature(title, null, false, false)`.
3. Captures `document.title` before/around this process.
4. If original title differs from stored renamed title, stashes it in background memory.
5. Starts a `<head>` mutation observer to catch `<title>` node replacement and preserve stashed original value.

Why this exists:

- Gives early title control before most page scripts run.
- Preserves “real/original” title so clearing rename can restore it later.

### Stage B: Main script (`document_end`)
File: `.analysis/recovered/src/contentScript/contentScript.tsx`

1. Starts `tab.initializeForMainContentScript()` immediately.
2. In `Tab.initializeForMainContentScript()`:
   - Loads signature via `loadSignature(true)`.
   - Applies signature with preserve behavior enabled.
   - Pulls and clears original title from background (`unstashOriginalTitle()`).
3. Registers listeners for open-dialog and title-refresh commands.

## 6.2 Opening the dialog and editing

UI root insertion:

- `insertUIIntoDOM()` in `.analysis/recovered/src/contentScript/contentScript.tsx:21`
- Injects `<tab-renamer-root>` host + Shadow DOM + React root.

Main UI component:

- `.analysis/recovered/src/contentScript/components/App/App.tsx`

User interaction:

1. User types new title in `TitleInputBox`.
2. Optional emoji favicon selected in `FaviconPicker`.
3. Pressing Enter calls:
   - `tab.setSignature(newDocumentTitle, newDocumentFavicon)` (`App.tsx:82`)
4. Dialog is hidden.

## 6.3 Applying title and favicon

Implementation in `.analysis/recovered/src/contentScript/tab.ts`.

### Title

- `setSignature()` routes to `_setTitle()` when title is non-null.
- `_setTitle()` writes `document.title = newTabTitle`.
- If `preserve=true`, `_preserveTabTitle(desiredTitle)` attaches MutationObserver to `<title>`:
  - If page changes title away from desired, extension restores desired title.
  - The page’s attempted title is saved as `originalTitle` for future restoration.

### Favicon

- Favicon path uses `Favicon.fromDTO(...).getUrl()` to materialize URL.
- Existing `<link rel~='icon'>` elements are removed and replaced.
- Current configured strategy is `mutation_observer` (`config.ts:31`), so removed links are cached in memory and restored when clearing.

## 6.4 Clearing rename

In `setSignature(title=null, favicon=...)` / `setSignature(..., favicon=null)`:

- `_restoreTitle()` disconnects title preserver and restores `originalTitle` if current signature had a custom title.
- `_restoreFavicon()` removes injected favicon and restores original favicon links (or `/favicon.ico` fallback if none found).

## 6.5 Title correction fallback (PDF viewer)

Some pages (notably Chrome PDF viewer) can change visible tab title without normal DOM `<title>` mutation behavior.

Handling path:

1. Background listens to `chrome.tabs.onUpdated`.
2. If `changeInfo.title` changes, `handleTitleChange(tabId, newTitle)` runs.
3. If stored signature title exists and differs, background schedules a correction message:
   - sends `COMMAND_REFRESH_CURRENT_TITLE` to content script.
4. Content script handles by `tab.resetCurrentTitle()`:
   - writes `document.title = ""` then desired title.

Code:

- `.analysis/recovered/src/background/background.ts:138`
- `.analysis/recovered/src/background/titleChangeHandler.ts`
- `.analysis/recovered/src/contentScript/contentScript.tsx:73`
- `.analysis/recovered/src/contentScript/tab.ts:232`

## 7. Persistence and Tab Identity Strategy

Repository: `.analysis/recovered/src/repositories/tabRepository.ts`

### Storage

- Uses `chrome.storage.sync` via utility wrappers.
- Records stored as `{ [tabIdString]: TabInfo }`.

### Save path

- `save_signature` creates `TabInfo` with current tab metadata and stores it.

### Load/match path

`loadTabAndUpdateId(tabId, url, index, isBeingOpened)`:

1. Try exact current tab ID.
2. Else find closed tabs with same URL.
3. If multiple URL matches, prefer same tab index; else most recently closed.
4. If matched record has old ID, delete old key and re-save under current tab ID.
5. If `isBeingOpened=true`, mark record open (`isClosed=false`, `closedAt=null`).

This is how renamed tabs can be restored across tab ID churn/reopen scenarios.

### Lifecycle updates

- `onRemoved`: mark tab as closed with timestamp.
- `onUpdated(url)`: keep stored URL in sync for tracked tab.
- `onMoved`: keep stored index synchronized for tracked tabs in window.
- startup/install: mark all open signatures as closed to avoid stale-open state.
- periodic GC: delete closed entries older than 14 days.

Code references:

- `.analysis/recovered/src/background/background.ts:111`
- `.analysis/recovered/src/background/background.ts:144`
- `.analysis/recovered/src/background/background.ts:158`
- `.analysis/recovered/src/background/markAllOpenSignaturesAsClosed.ts`
- `.analysis/recovered/src/background/garbageCollector.ts`

## 8. Why Two Content Scripts Exist

Manifest:

- `initializationContentScript.js` at `document_start`
- `contentScript.js` at `document_end`

Reason:

- `document_start` script handles early title restoration + original-title stashing.
- `document_end` script mounts UI and durable observers after DOM is ready.

This split reduces visible title flicker and improves restoration correctness.

## 9. Notable Constraints and Behavior

- Restricted Chrome pages cannot be renamed; background displays fallback popup.
- Dialog submit is Enter-driven; empty input means “clear custom title”.
- UI currently supports emoji favicon picks (native or Twemoji). `App.tsx` explicitly throws if stored favicon type is not emoji type.
- Background uses mutex-protected repository operations to reduce races in tab lifecycle events.

## 10. Key Files for Maintenance

- `manifest.json`
- `background.js` / `background.js.map`
- `contentScript.js` / `contentScript.js.map`
- `initializationContentScript.js` / `initializationContentScript.js.map`

Mapped source equivalents (human-readable) under `.analysis/recovered/src/`:

- `background/background.ts`
- `background/titleChangeHandler.ts`
- `repositories/tabRepository.ts`
- `contentScript/initializationContentScript.ts`
- `contentScript/contentScript.tsx`
- `contentScript/tab.ts`
- `contentScript/components/App/App.tsx`
- `backgroundScriptApi.ts`
- `types.ts`
- `config.ts`
