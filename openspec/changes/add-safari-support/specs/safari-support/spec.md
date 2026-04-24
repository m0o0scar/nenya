## ADDED Requirements

### Requirement: Safari target manifest MUST use a reduced permission set
The Safari target manifest MUST avoid permissions and commands for removed or unsupported features while preserving the shared zero-build source layout.

#### Scenario: Safari manifest excludes removed feature permissions
- **GIVEN** `manifest.safari.json` is used as the Safari target manifest,
- **THEN** it MUST NOT request `bookmarks`, `tabGroups`, `notifications`, `tabCapture`, `desktopCapture`, `downloads`, `offscreen`, or `clipboardRead`,
- **AND** it MUST keep the standard extension surfaces required for popup, options, content scripts, context menus, tabs, scripting, storage, alarms, clipboard write, Raindrop API access, and all-URL content features.

#### Scenario: Safari manifest omits screen recording entry points
- **GIVEN** screen recording depends on Chrome offscreen documents and downloads,
- **THEN** the Safari manifest MUST omit screen recording commands and recording web-accessible resources.

### Requirement: Chrome-only screen recording MUST be feature-gated
Runtime surfaces MUST hide or fail gracefully when the current browser does not expose the APIs required by the existing screen recorder.

#### Scenario: Unsupported browsers hide screen recording shortcuts
- **GIVEN** the browser lacks `chrome.offscreen.createDocument`, `chrome.runtime.getContexts`, or `chrome.storage.session`,
- **THEN** popup pinned shortcuts, options shortcut configuration, and context menus MUST not expose screen recording as an actionable feature.

#### Scenario: Direct screen recording requests fail gracefully
- **GIVEN** a direct background request reaches the screen recording handler in a browser without the required APIs,
- **THEN** the handler MUST return `{ success: false, error }` instead of throwing or reporting success.

### Requirement: Safari support documentation MUST describe current support boundaries
Documentation MUST make the initial Safari target understandable without changing the Chrome manifest.

#### Scenario: Safari documentation lists supported and disabled features
- **GIVEN** a maintainer reads `docs/SAFARI.md`,
- **THEN** it MUST describe which shared features are intended to work in Safari,
- **AND** it MUST explicitly list removed/disabled features and explain that `manifest.safari.json` should be staged as `manifest.json` for conversion rather than replacing the Chrome manifest in the source tree.

### Requirement: Safari packaging automation MUST stage and package the target
Maintainers MUST be able to run one npm script to prepare the Safari source and invoke Apple's packaging tool.

#### Scenario: npm script stages Safari source
- **GIVEN** a maintainer runs `npm run safari`,
- **THEN** the script MUST copy the required extension resources into a staging directory,
- **AND** it MUST write `manifest.safari.json` as the staged `manifest.json` without modifying the Chrome manifest in the repo root.

#### Scenario: npm script invokes Apple's available packaging tool
- **GIVEN** the staged Safari source is ready,
- **THEN** the script MUST invoke `safari-web-extension-packager` when available and fall back to `safari-web-extension-converter` when needed,
- **AND** it MUST pass non-interactive packaging options for project location, app name, bundle identifier, Swift, macOS-only packaging, copied resources, forced overwrite, and no automatic Xcode open.
