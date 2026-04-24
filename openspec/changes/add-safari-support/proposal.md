## Why
Nenya needs an initial Safari Web Extension target after removing Chrome-only bookmark mirroring, tab grouping, and extension notifications. A Safari target should use a reduced manifest and avoid exposing features that depend on unsupported Chrome extension APIs.

## What Changes
- Add a Safari-specific manifest source that omits removed or unsupported permissions.
- Document the Safari conversion workflow and support matrix.
- Gate Chrome-only screen recording UI/actions when offscreen document APIs are unavailable.

## Impact
- Affected specs: safari-support
- Affected code: `manifest.safari.json`, `docs/SAFARI.md`, screen-recording gates in popup/options/context-menu/background code
