## MODIFIED Requirements
### Requirement: The background page SHALL assemble sanitized context packages
The background page SHALL continue to collect page content through the shared extractor pipeline, while preserving Confluence-specific structure by letting the general extractor switch to a Confluence-aware conversion path before Readability fallback.

#### Scenario: Collect page content before injecting into LLM tabs
- **GIVEN** a `collect-and-send-to-llm` message arrives,
- **THEN** the background MUST derive at least one tab id (falling back to highlighted or active tabs), reject the call when none are found or `llmProviders` is empty, sequentially run `collectPageContentFromTabs()` so each tab loads the correct extractor (`getContent-youtube.js`, `getContent-notion.js`, or the general page pipeline plus `pageContentCollector.js`), and store the resulting `{ title, url, content }` list as `collectedContents`,
- **AND** the general page pipeline MUST detect Confluence page DOM (`#main-content`, `.wiki-content`, or `.confluence-content`) before invoking Readability and convert that content through a Confluence-specific Turndown path that preserves page title, nested lists, tables, code blocks, and Confluence images,
- **AND** when a single active tab is being sent, it MUST attempt to capture a JPEG screenshot via `chrome.tabs.captureVisibleTab()` and unshift that blob metadata into `selectedLocalFiles`,
- **AND** once the content is ready it MUST either call `reuseLLMTabs(sessionId, llmProviders, collectedContents)` (marking `sessionsWithSentContent`) or fall back to `openOrReuseLLMTabs()` to open new tabs when reuse is impossible, returning `{ success: true }` only after every provider injection has been triggered.

#### Scenario: Serve markdown payloads for downloads
- **GIVEN** a `collect-page-content-as-markdown` request,
- **THEN** the background MUST run the same `collectPageContentFromTabs()` pipeline, including the Confluence-aware fast path in the general extractor when the page DOM matches Confluence, and respond with `{ success: true, contents }` so the popup can compose the `.md` file without duplicating extraction logic.
