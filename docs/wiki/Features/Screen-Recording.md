# Feature: Screen Recording

## What This Feature Does
User-facing:
- Toggles screen recording from popup, context menu, or keyboard command.
- Shows recording status on extension badge.
- Opens preview page after stop for playback/download/start-new.

System-facing:
- Uses offscreen document to access MediaRecorder APIs not available in MV3 service workers.
- Persists video blobs in IndexedDB for recovery after page reloads.

## Key Modules and Responsibilities
- `src/background/screen-recorder.js`
  - Recording state machine (`recordingState`).
  - Offscreen lifecycle (`createOffscreenDocument`, `closeOffscreenDocument`).
  - Start/stop/toggle APIs (`startScreenRecording`, `stopScreenRecording`, `handleScreenRecordingToggle`).
  - Message bridge (`handleScreenRecorderMessage`, line 363).
- `src/recording/offscreen.js`
  - Handles `screen-recorder:start` and `screen-recorder:stop`.
  - Acquires stream via `getDisplayMedia` fallback chain.
  - Creates blob URL and stores blob in IndexedDB via `saveVideoBlob`.
- `src/recording/storage.js`
  - IndexedDB wrapper (`DB_NAME = 'nenya-recordings'`, store `videos`, key `current`).
- `src/recording/preview.js`
  - Loads video from blob URL, then IndexedDB, then base64 fallback.
  - Sends lifecycle messages (`preview-opened`, `preview-closed`, `close-offscreen`, `start-new`).

## Public Interfaces
Commands/context:
- Command: `screen-recording-start`
- Context menu: `NENYA_MENU_IDS.SCREEN_RECORDING`

Runtime messages:
- Background <-> offscreen:
  - `screen-recorder:start`
  - `screen-recorder:stop`
  - `get-video-base64`
- Preview -> background:
  - `screen-recorder:get-video-blob`
  - `screen-recorder:close-offscreen`
  - `screen-recorder:start-new`
  - `screen-recorder:preview-opened`
  - `screen-recorder:preview-closed`
- Offscreen -> background:
  - `screen-recorder:stream-ended`

## Data Model / Storage Touches
- `chrome.storage.session`
  - `recordedVideoUrl`
- IndexedDB
  - DB: `nenya-recordings`
  - Store: `videos`
  - Key: `current`
  - Value: `{ blob, timestamp, size, type }`

## Main Control Flow
```mermaid
sequenceDiagram
  participant UI as Popup/Command/Context Menu
  participant BG as background/screen-recorder.js
  participant OFF as recording/offscreen.js
  participant IDB as recording/storage.js
  participant PREV as recording/preview.js

  UI->>BG: screen-recorder toggle
  BG->>BG: createOffscreenDocument()
  BG->>OFF: screen-recorder:start
  OFF->>OFF: getDisplayMedia + MediaRecorder.start
  UI->>BG: stop toggle
  BG->>OFF: screen-recorder:stop
  OFF->>IDB: saveVideoBlob(blob)
  OFF-->>BG: {success, blobUrl}
  BG->>PREV: open preview.html?video=blob:...
  PREV->>BG: screen-recorder:close-offscreen
  PREV->>BG: preview-closed (schedule delete)
```

## Error Handling and Edge Cases
- Capture fallback logic in offscreen script:
  - tries audio+video, then video-only, then alternate APIs.
- `stopScreenRecording` always clears recording state and attempts offscreen cleanup on error.
- Preview load order is resilient:
  1. blob URL
  2. IndexedDB
  3. base64 fetch through background
- Known mismatch:
  - Download filename in `preview.js` is always `.webm` even when recorder MIME type may be `video/mp4`.

## Observability
- Verbose logs with `[screen-recorder]`, `[offscreen]`, `[preview]`, `[storage]` prefixes across modules.
- Badge blink state indicates active recording and temporarily disables popup for click-to-stop behavior.

## Tests
- No automated tests exist; behavior is currently exercised manually.
