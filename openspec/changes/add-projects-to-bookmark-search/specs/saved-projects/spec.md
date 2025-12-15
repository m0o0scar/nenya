## ADDED Requirements

### Requirement: Users MUST be able to search for saved projects from the bookmark search input
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

