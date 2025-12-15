## Purpose

The Saved Projects capability allows users to capture, store, and restore collections of browser tabs as projects in Raindrop. Users can save highlighted tabs with their context (pinned state, tab groups), manage projects from the popup, and restore entire project workspaces with a single click.
## Requirements
### Requirement: Users MUST be able to save highlighted tabs as a Raindrop project
The popup's "Save project" button MUST capture the user's current context and persist it as a Raindrop collection under the "Saved projects" group.

#### Scenario: Prompt for project name and sanitize tabs
- **GIVEN** the user clicks “Save project” in the popup,
- **THEN** the extension MUST gather highlighted tabs (falling back to the active tab), normalize each URL (including converting split-view URLs and applying URL processing rules), drop non-http(s) entries, and deduplicate by normalized URL,
- **AND** prompt the user for a project name (pre-filled via `deriveDefaultProjectName`), requiring a non-empty value before continuing.

#### Scenario: Create Raindrop collection and metadata
- **GIVEN** a valid name and tab set,
- **THEN** the background MUST ensure the user is authenticated, ensure the “Saved projects” Raindrop group exists (creating it when missing), create a private Raindrop collection (searching for a cover, if available), and store each tab as a Raindrop item,
- **AND** every item MUST include JSON metadata (`excerpt`) capturing the tab’s pinned state, tab index, and tab group (name/color/order) so it can be restored later.

#### Scenario: Provide result feedback and notifications
- **GIVEN** the save completes,
- **THEN** the background MUST return a `SaveProjectResult` with created/skipped/failed counts and the resolved project name, trigger the project save notification (when enabled), update the action badge, and the popup MUST surface the success/failure summary and refresh the saved-projects list.

### Requirement: Users MUST be able to manage saved projects from the popup
The projects panel MUST list Raindrop collections within the "Saved projects" group and expose actions to open, add tabs, replace content, or delete a project.

#### Scenario: Load cached projects then refresh from Raindrop
- **GIVEN** the popup projects container renders,
- **THEN** it MUST first request `projects:getCachedProjects` to display the last cached list (if any) while showing a loading state,
- **AND** it MUST immediately call `projects:listProjects`; on success it MUST render the fresh list (cover, title, tab count, actions) and cache it via `cacheProjectsList`, while errors render a friendly fallback.

#### Scenario: Add highlighted tabs to an existing project
- **GIVEN** the user clicks “Add tabs” next to a project,
- **THEN** the popup MUST collect highlighted/active tabs, normalize/ deduplicate them, and send `projects:addTabsToProject` with the descriptors,
- **AND** the background MUST append new Raindrop items (skipping URLs already present), include proper metadata, update counts, and emit the appropriate notification before returning the summary so the popup can show the status.

#### Scenario: Replace project items
- **GIVEN** the user chooses “Replace with highlighted tabs” or “Replace with current window tabs,”
- **THEN** the popup MUST confirm the destructive action, collect the requested tab set (highlighted or all current-window tabs), sanitize it, and send `projects:replaceProjectItems`,
- **AND** the background MUST remove existing Raindrop items for that collection, upload the new sanitized set, and report created/skipped/failed counts via `SaveProjectResult`.

#### Scenario: Delete project
- **GIVEN** the user confirms deletion,
- **THEN** the popup MUST send `projects:deleteProject` and optimistically remove the row,
- **AND** the background MUST delete the Raindrop collection, invalidate the cache, and raise a notification so the popup can confirm success (or restore the row on error).

### Requirement: Users MUST be able to open or restore saved projects from the popup
Users MUST be able to either open the Raindrop page for a project or restore the stored tabs (respecting pinned order and tab groups) into their browser window.

#### Scenario: Open project in a new tab
- **GIVEN** the user clicks the project title or cover,
- **THEN** the popup MUST open the project’s Raindrop URL in a new tab (converting nenya.local split URLs back to the extension format when needed).

#### Scenario: Restore project tabs/groups into the current window
- **GIVEN** the user clicks the “Restore tabs” action,
- **THEN** the popup MUST show progress, disable the projects container, and send `projects:restoreProjectTabs` with the project ID and title,
- **AND** the background MUST fetch all items, parse stored metadata, sort entries to approximate original order (pinned first, then tab indices), deduplicate URLs, convert nenya.local split URLs back to extension URLs, and recreate tabs in the active window,
- **AND** it MUST pin tabs flagged as pinned, recreate tab groups (name/color/order) when `chrome.tabGroups` is available, and report counts of created/pinned/grouped tabs alongside any errors so the popup can notify the user.

#### Scenario: Handle restore failures gracefully
- **GIVEN** restoration fails (missing tokens, empty collection, or tab creation errors),
- **THEN** the background MUST return `ok: false` with an error message and surface project notifications (if enabled), while the popup re-enables controls and shows the error in `statusMessage`.

### Requirement: Bookmark search MUST include saved projects
The popup's bookmark search functionality MUST include saved projects in search results, allowing users to discover and access projects alongside bookmarks.

#### Scenario: Search projects by title
- **GIVEN** the user types a search query in the bookmark search input (at least 3 characters),
- **THEN** the system MUST query both Chrome bookmarks and saved projects,
- **AND** match projects where the title contains the search query (case-insensitive),
- **AND** return matching projects with their metadata (id, title, itemCount, url, cover).

#### Scenario: Sort projects before bookmarks in results
- **GIVEN** the search returns both matching projects and matching bookmarks,
- **THEN** the results MUST be sorted with all matching saved projects appearing before any matching bookmarks,
- **AND** within projects, maintain relevance-based ordering,
- **AND** within bookmarks, maintain the existing title-match priority ordering.

#### Scenario: Render project results with visual distinction
- **GIVEN** search results include saved projects,
- **THEN** each project result MUST display the project icon (or cover if available), project title, and item count,
- **AND** project results MUST use a distinct visual indicator (e.g., 📁 emoji or project-specific icon),
- **AND** project results MUST be visually distinguishable from bookmark and folder results.

#### Scenario: Open project from search results
- **GIVEN** the user clicks on a project search result or presses Enter when a project is highlighted,
- **THEN** the system MUST restore the project tabs into the current window (same behavior as clicking the project in the projects list),
- **AND** show appropriate loading and status feedback,
- **AND** close the popup after successful restoration.

#### Scenario: Keyboard navigation across mixed results
- **GIVEN** search results include both projects and bookmarks,
- **THEN** the user MUST be able to navigate through all results using arrow keys,
- **AND** the highlight indicator MUST work consistently across both result types,
- **AND** pressing Enter on a highlighted item MUST trigger the appropriate action (restore project or open bookmark).

#### Scenario: Handle empty project results gracefully
- **GIVEN** the search query matches bookmarks but no projects,
- **THEN** the system MUST display only bookmark results without errors,
- **AND** the search experience MUST remain unchanged from current behavior.

#### Scenario: Search input placeholder reflects broader scope
- **GIVEN** the user views the bookmark search input,
- **THEN** the placeholder text MUST indicate that both bookmarks and projects are searchable (e.g., "Search bookmarks and projects...").

