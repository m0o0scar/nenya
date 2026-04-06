## MODIFIED Requirements
### Requirement: Sending or downloading context SHALL validate prerequisites before contacting the background
Sending or downloading context SHALL remain available through the popup and existing keyboard flows, and Markdown download SHALL also be invokable from the extension context menu without changing the underlying collection pipeline.

#### Scenario: Download workflow returns a markdown bundle
- **GIVEN** the operator clicks the popup download button or triggers the `llm-download-markdown` command,
- **WHEN** tabs are eligible, **THEN** the extension MUST request `collect-page-content-as-markdown`, prepend the current prompt as `# Prompt` when one exists, append one `## Page N` section per collected tab (with `**URL:**` metadata and the captured body markdown), and trigger a file download named `page-content-<timestamp>.md`.

#### Scenario: Context menu triggers markdown download
- **GIVEN** the user opens the extension context menu on a page,
- **WHEN** they choose `Download as markdown`,
- **THEN** the background MUST run the same highlighted-tabs-or-active-tab selection logic used by the `llm-download-markdown` command,
- **AND** it MUST reuse the same `collect-page-content-as-markdown` pipeline and generated `page-content-<timestamp>.md` file format instead of maintaining a separate export path.
