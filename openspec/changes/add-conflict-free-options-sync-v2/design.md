# Design: Conflict-Free Options Sync

## Context
Nenya syncs extension configuration through Raindrop for users who work across browsers. Whole-file JSON backup is not a safe sync model because the newest upload can erase another browser's unsynced edits.

## Decisions
- Use Automerge 3.2.0 as a local browser-ready module under `src/libs` so no build step or runtime npm dependency is introduced.
- Store one Automerge document in a dedicated `nenya / options sync` Raindrop collection. The document contains the current option categories plus `_meta` device data.
- Persist the local Automerge document in `chrome.storage.local.automergeOptionsDoc` so offline edits survive service-worker restarts before the next remote sync.
- Use a stable per-install hex actor id in `chrome.storage.local.automergeActorId`.
- Save the remote document as Base64 chunks in Raindrop item excerpts, with chunk metadata `{ version, syncId, index, total, data }`. Reads require one complete chunk set and reject partial/corrupt data.
- Preserve the legacy `nenya / backup` JSON file. If no CRDT document exists, the first sync may seed the Automerge document from that legacy file and current local options without deleting the old file.

## Trade-offs
- Automerge adds vendor size, but it removes bespoke conflict-resolution logic for multi-device writes.
- Restore remains destructive by design because users still need a recovery path when local state is corrupt or unwanted.
