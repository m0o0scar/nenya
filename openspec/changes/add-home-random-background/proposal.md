# Change: add cached random-photo new tab home

## Why
The extension already has a dedicated home surface, but it is not wired in as the browser new-tab page and it lacks a stable visual identity. Users want a full-screen random photo background that still renders consistently after the first successful fetch and can be refreshed on demand.

## What Changes
- Add a new-tab override that points to the existing Nenya home page.
- Add cached random wallpaper fetching from `https://unsplash.it/2560/1440` with stable local rendering after the first fetch.
- Add home-only controls for `Change image` and persisted `Zen mode`.
- Keep the current dashboard overlay for search, shortcuts, and sessions.

## Impact
- Affected specs: `home-page`
- Affected code: `manifest.json`, `src/home/index.html`, `src/home/home.css`, `src/home/home.js`
