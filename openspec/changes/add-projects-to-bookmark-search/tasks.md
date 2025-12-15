# Implementation Tasks

## 1. Backend Message Handler
- [ ] 1.1 Add message handler in `src/background/projects.js` for searching projects by query string
- [ ] 1.2 Implement project search logic that matches against project titles
- [ ] 1.3 Return search results with project metadata (id, title, itemCount, url, cover)

## 2. Popup Search Integration
- [ ] 2.1 Modify `performSearch` function in `src/popup/popup.js` to query both bookmarks and projects
- [ ] 2.2 Merge and sort results (projects first, then bookmarks)
- [ ] 2.3 Update `renderSearchResults` to handle project result items with appropriate icons
- [ ] 2.4 Add click handler for project results to restore project tabs
- [ ] 2.5 Ensure keyboard navigation works seamlessly across both result types

## 3. UI Enhancement
- [ ] 3.1 Add visual distinction for project results (e.g., different icon: 📁 or project-specific emoji)
- [ ] 3.2 Show item count for projects in search results
- [ ] 3.3 Update search input placeholder to reflect broader search scope (e.g., "Search bookmarks and projects...")

## 4. Testing
- [ ] 4.1 Test search with projects matching query
- [ ] 4.2 Test search with bookmarks matching query
- [ ] 4.3 Test search with both projects and bookmarks matching query
- [ ] 4.4 Test sorting (projects before bookmarks)
- [ ] 4.5 Test keyboard navigation through mixed results
- [ ] 4.6 Test opening projects from search results

