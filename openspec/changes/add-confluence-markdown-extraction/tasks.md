## 1. Specification
- [x] 1.1 Add an OpenSpec delta for Confluence-aware Markdown extraction in the shared LLM/download pipeline.
- [x] 1.2 Validate the OpenSpec change.

## 2. Implementation
- [x] 2.1 Add a Confluence DOM fast path to the general page extractor before Readability fallback.
- [x] 2.2 Mirror the reference extension's Turndown behavior for Confluence lists, tables, code blocks, and images.
- [x] 2.3 Keep existing popup/background message contracts unchanged so downloads and LLM sends share the new extractor.
- [x] 2.4 Update README and store-facing docs to mention Confluence support.

## 3. Verification
- [x] 3.1 Run OpenSpec validation and syntax verification for the changed script.
- [x] 3.2 Review the final diff for the Confluence extraction path and docs updates.
