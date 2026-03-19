# Change: add dedicated raindrop backup for pinned search results

## Why
Pinned search results live outside the options UI but are still user-curated state. Today they only persist locally and piggyback on the general options export/backup payload, which does not provide a dedicated Raindrop sync target for this list.

## What Changes
- Add a dedicated Raindrop backup/restore flow for `pinnedSearchResults`
- Store the list in a root-level Raindrop collection named `nenya / pinned search results`
- Upload and restore a single file item named `pinned_search_results.json`
- Mirror the existing options backup lifecycle for this dataset: startup comparison, automatic restore checks, local-change auto-backup, and restore after login
- Fix the existing post-login sync message so approved login flows can trigger restore immediately

## Impact
- Affected specs: `options-restore-backup`
- Affected code: `src/background/index.js`, `src/background/options-backup.js`, new pinned-search-results backup module, and pinned-search-results normalization helpers
