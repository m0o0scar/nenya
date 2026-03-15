## ADDED Requirements
### Requirement: The extension SHALL render Nenya home as the new tab page
The extension SHALL override Chrome's new tab page with `src/home/index.html`.

#### Scenario: Opening a new tab loads the Nenya home surface
- **WHEN** the user opens a new tab in Chrome
- **THEN** Chrome MUST load the extension page at `src/home/index.html`
- **AND** the page MUST preserve the existing Nenya home dashboard features

### Requirement: The home page SHALL cache and reuse the current wallpaper locally
The home page SHALL fetch a random image from `https://unsplash.it/2560/1440`, cache it locally, and reuse that cached image on subsequent renders.

#### Scenario: First load fetches and caches a wallpaper
- **GIVEN** the home page has no cached wallpaper in local storage
- **WHEN** the page finishes loading
- **THEN** it MUST render the fallback gradient first
- **AND** fetch a random image from `https://unsplash.it/2560/1440`
- **AND** convert the fetched image into a locally cached data URL
- **AND** store the cached image under `nenya.home.backgroundDataUrl`
- **AND** store the fetch timestamp under `nenya.home.backgroundFetchedAt`
- **AND** replace the fallback background only after the new image is cached successfully

#### Scenario: Later visits reuse the cached wallpaper
- **GIVEN** the home page has a cached wallpaper in local storage
- **WHEN** the user opens a new tab or reloads the page
- **THEN** the page MUST apply the cached wallpaper immediately before any network fetch
- **AND** it MUST keep rendering that cached image until the user explicitly requests a refresh

### Requirement: The home page SHALL expose wallpaper refresh controls
The home page SHALL provide a top-right control that fetches and applies a new wallpaper without discarding the previous cached image on failure.

#### Scenario: Refreshing the wallpaper succeeds
- **GIVEN** the home page is open
- **WHEN** the user clicks `Change image`
- **THEN** the control MUST enter a loading state
- **AND** the page MUST fetch a new random image from `https://unsplash.it/2560/1440`
- **AND** it MUST update the cached wallpaper only after the new image is stored successfully
- **AND** it MUST apply the new wallpaper without reloading the page

#### Scenario: Refreshing the wallpaper fails
- **GIVEN** the home page already has a cached wallpaper
- **WHEN** the user clicks `Change image`
- **AND** the fetch or cache write fails
- **THEN** the page MUST keep the previous cached wallpaper visible
- **AND** it MUST show a non-blocking error status message

### Requirement: The home page SHALL support persisted zen mode
The home page SHALL provide a zen mode that hides the dashboard overlay while preserving the wallpaper and the top-right controls.

#### Scenario: Zen mode persists across visits
- **GIVEN** the user enables zen mode
- **WHEN** the page reloads or the user opens another new tab
- **THEN** the page MUST restore zen mode from `nenya.home.zenMode`
- **AND** keep only the top-right controls visible over the wallpaper
- **AND** restore the full dashboard overlay when zen mode is turned off

### Requirement: Home search SHALL preserve custom search suggestions
The home page SHALL continue to support the existing search behavior, including custom search suggestions used by the shared popup logic.

#### Scenario: Home search initializes shared custom search suggestions
- **GIVEN** the home page reuses the popup bookmark-search logic
- **WHEN** the user focuses the home search input and types a custom-search prefix
- **THEN** the page MUST render the shared custom search suggestions container
- **AND** custom-search shortcut execution MUST keep working on the home surface
