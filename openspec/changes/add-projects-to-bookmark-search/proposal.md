# Change: Include Saved Projects in Bookmark Search

## Why
Currently, the popup's bookmark search functionality only searches through browser bookmarks and bookmark folders. Users have saved projects that are semantically similar to bookmark folders but are stored in Raindrop, and these projects are not discoverable through the search interface. This creates an inconsistent user experience where users must remember to look in the projects list separately even when searching could surface relevant results.

## What Changes
- Extend the bookmark search functionality in `src/popup/popup.js` to include saved projects in search results
- Sort matching saved projects before matching bookmarks to prioritize projects
- Update the search UI to distinguish between bookmarks, bookmark folders, and saved projects
- Modify the `initializeBookmarksSearch` function to query both Chrome bookmarks API and saved projects
- Add visual indicators (icons/styling) to differentiate project results from bookmark results

## Impact
- Affected specs: `saved-projects`
- Affected code:
  - `src/popup/popup.js` (bookmark search functionality around lines 1430-1760)
  - `src/popup/projects.js` (may need to expose project search helper)
  - `src/popup/index.html` (possibly update search placeholder text)

