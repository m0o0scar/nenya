# Change: add Confluence-specific markdown extraction

## Why
Confluence pages do not convert cleanly through the generic Readability pipeline. Nested lists, tables, code blocks, Atlassian macros, and images lose too much fidelity, which makes both Markdown downloads and LLM context attachments less useful.

## What Changes
- Add a Confluence-aware extraction path inside the existing general page extractor.
- Reuse the same Confluence conversion path for both Markdown downloads and LLM send flows by keeping the existing collector/background interfaces unchanged.
- Add an OpenSpec delta for the shared send-context-to-llm capability describing the Confluence fast path.
- Update user-facing docs to mention explicit Confluence support in page-content extraction and Markdown downloads.

## Impact
- Affected specs: `send-context-to-llm`
- Affected code: `src/contentScript/getContent-general.js`, `README.md`, `docs/STORE.md`
