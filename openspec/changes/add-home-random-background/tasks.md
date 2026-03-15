## 1. Specification
- [x] 1.1 Define the `home-page` capability for new-tab override, cached wallpaper rendering, refresh controls, zen mode, and failure handling
- [x] 1.2 Record that `openspec validate add-home-random-background --strict` could not be run because the `openspec` CLI is unavailable in this workspace

## 2. Implementation
- [x] 2.1 Add the new-tab manifest override for `src/home/index.html`
- [x] 2.2 Add home-page controls and search-suggestion markup while preserving the existing dashboard overlay
- [x] 2.3 Implement cached wallpaper fetching and persisted zen mode in `src/home/home.js`
- [x] 2.4 Restyle the home page for full-screen cover wallpaper and readable translucent overlays

## 3. Verification
- [x] 3.1 Run syntax and diff checks for the touched files
- [x] 3.2 Document the remaining manual verification scenarios for new-tab, cache persistence, wallpaper refresh, zen mode, and popup regression
