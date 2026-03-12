# Change: update split screen current-display behavior

## Why
The existing split-screen shortcut only supports a narrow two-case flow and the existing merge shortcut merges single-tab windows across all windows rather than limiting itself to the active display. Users need explicit split and merge actions that only affect windows on the current screen and can arrange them into deterministic grid layouts.

## What Changes
- Add explicit `split` and `merge` triggers for keyboard commands and context menus.
- Scope both split and merge operations to normal windows on the current display only.
- Update split behavior to move highlighted tabs or the active tab into separate windows, enforce a 12-window limit, and arrange resulting windows into supported grids.
- Update merge behavior to combine all tabs from current-display windows into a single window.

## Impact
- Affected specs: split-screen
- Affected code: `manifest.json`, `src/background/index.js`, `src/shared/contextMenus.js`
