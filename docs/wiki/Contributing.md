# Contributing

## Coding Conventions
Project conventions are defined in `AGENTS.md` and enforced by project structure:
- Use vanilla JavaScript only (no TypeScript in source).
- Zero-build workflow (plain source files, no bundler/transpile).
- Use JSDoc for source typing.
- Use single quotes for string literals.
- Content scripts should be wrapped in IIFEs to avoid global pollution.
- Browser-ready third-party libs should live under `src/libs/`.

Code organization patterns to follow:
- Feature config UI modules in `src/options/` write to `chrome.storage.local`.
- Background service worker in `src/background/index.js` owns message/command routing.
- Shared cross-context contracts/constants live in `src/shared/`.

## How to Add a New Feature
1. Define storage/message contracts first.
   - Add shared constants in `src/shared/` when contracts are cross-context.
2. Add background routing.
   - Register command/context/runtime handlers in `src/background/index.js`.
3. Implement feature logic module.
   - Prefer dedicated file in `src/background/` or `src/contentScript/`.
4. Add options UI if feature is configurable.
   - Add section UI in `src/options/index.html`.
   - Add logic module under `src/options/` and import it in `src/options/options.js`.
5. Wire popup/home entry points if user-triggered from quick actions.
6. Add migration/normalization for new persisted keys.
   - Update backup/import-export normalization paths in:
     - `src/background/options-backup.js`
     - `src/options/importExport.js`

## How to Add Tests
Current state:
- No automated test harness exists in repo scripts.

Recommended incremental approach:
1. Add focused unit-like scripts for pure helpers (for example in `src/shared/`).
2. Add fixture-based validation for rule normalization in options modules.
3. Add smoke scripts for background message contracts.
4. Update `package.json` with real `test` command when introducing test infra.

## Run CI Checks Locally
There is no full local CI wrapper, but you can run key release checks:
- Build packaging artifact:
```bash
./.github/scripts/build-extension.sh dist extension.zip
```
- Validate versioned files before release commit:
  - Ensure `manifest.json` and `package.json` versions match.
- Optional dry-run style checks:
  - Load unpacked extension and validate major workflows manually (popup, options, save-to-unsorted, LLM send, recording preview).

## Pull Request Expectations
- Keep changes scoped by feature domain.
- Preserve message-type and storage-key compatibility where possible.
- Document new contracts in this wiki (`docs/wiki/`) when behavior changes.
- Include manual verification notes for UI/runtime flows until automated tests are added.
