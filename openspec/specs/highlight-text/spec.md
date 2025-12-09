# Highlight Text Specification

## Purpose

The highlight text feature allows users to define rules that automatically highlight specific text patterns on matching web pages. Rules support multiple URL patterns and multiple highlight definitions per rule, with backward compatibility for legacy single-pattern rules.

## Requirements

### Requirement: The options page SHALL load and sanitize highlight rules from sync storage

The options page MUST load highlight rules from `chrome.storage.local.highlightTextRules`, migrate any legacy single-pattern rules to the new multi-pattern/multi-highlight structure, validate all patterns and highlight entries, and render the sanitized list.

#### Scenario: Normalize stored rules on page load
- **GIVEN** the options page initializes,
- **THEN** `loadRules()` MUST fetch `highlightTextRules`, detect legacy single-pattern rules (where `pattern` is a string instead of `patterns` array), migrate them to the new structure via `migrateHighlightRules()`, and save back if any migration occurred,
- **AND** it MUST drop any entries that are not objects, that have empty `patterns` arrays, or that have empty `highlights` arrays,
- **AND** for each pattern in `patterns[]` it MUST validate using `URLPattern` parsing,
- **AND** for each entry in `highlights[]` it MUST validate regex patterns when `type === 'regex'` and coerce missing boolean flags (`bold`, `italic`, `underline`, `ignoreCase`) to `false`,
- **AND** it MUST retain rule-level `disabled`, `createdAt`, and `updatedAt` timestamps, returning the sanitized array for rendering,
- **AND** if no array exists it MUST default to an empty list so the empty state renders.

#### Scenario: React to sync updates coming from other contexts
- **GIVEN** another browser, the Automerge syncer, or the import/export tool modifies `highlightTextRules`,
- **WHEN** `chrome.storage.onChanged` fires with that key in the `sync` namespace,
- **THEN** the options script MUST reload via `loadRules()` (which includes migration), re-render the list, and clear edit/detail panels when the referenced rule disappears so stale IDs are not left selected.

### Requirement: The highlight rule form SHALL enforce valid input and provide complete rule metadata

The highlight rule form MUST support multiple URL patterns via a tag/chip UI, multiple highlight entries via an accordion UI, and persist each rule as `{ id, patterns: string[], highlights: HighlightEntry[], disabled?, createdAt?, updatedAt? }`.

#### Scenario: Manage URL patterns via tag/chip UI
- **GIVEN** the user is editing the highlight rule form,
- **WHEN** they enter a URL pattern in the pattern input and click "Add" or press Enter,
- **THEN** the handler MUST validate the pattern via `URLPattern` constructor, display an error if invalid, or add a removable chip/tag displaying the pattern,
- **AND** clicking the remove button on a chip MUST delete that pattern from the list,
- **AND** form submission MUST require at least one valid pattern, surfacing an error if the patterns list is empty.

#### Scenario: Manage highlight entries via accordion UI
- **GIVEN** the user is editing the highlight rule form,
- **WHEN** the form loads or "Add highlight" is clicked,
- **THEN** a collapsible accordion entry MUST appear showing a header with type badge, value preview, and color chips,
- **AND** expanding the entry MUST reveal the full highlight editor: type select, value textarea, color pickers with alpha sliders, and bold/italic/underline/ignoreCase checkboxes,
- **AND** clicking "Delete" on an entry MUST remove it (disabled if only one entry remains),
- **AND** form submission MUST require at least one highlight entry.

#### Scenario: Add or edit a rule through the form
- **GIVEN** the user fills `#highlightTextRuleForm`,
- **WHEN** they submit with at least one valid pattern and at least one valid highlight entry (each with non-empty `value` and valid regex if `type === 'regex'`),
- **THEN** the handler MUST either create a new rule with a generated UUID (`generateRuleId()`) plus `createdAt`, or update the existing `editingRuleId` with a fresh `updatedAt`,
- **AND** it MUST capture each highlight entry's styling via the color pickers plus alpha sliders (converted with `formatColorWithAlpha()`) and the bold/italic/underline/ignoreCase checkboxes,
- **AND** each highlight entry MUST have its own unique `id` generated via `generateRuleId()` or preserved if editing,
- **AND** invalid input MUST keep the form in place, surface the specific error in `#highlightTextFormError`, retain focus, and leave storage untouched until corrected,
- **AND** `clearForm()` MUST reset the inputs to a single empty pattern chip area and a single default highlight entry with default colors (`#000000` text, `#ffff00` background).

#### Scenario: View, toggle, or delete existing rules
- **GIVEN** at least one rule is stored,
- **THEN** `renderRulesList()` MUST show either the empty-state card or an `<article>` per rule containing:
  - Pattern summary: first pattern (monospace) plus "(+N more)" if multiple patterns exist
  - Highlight summary: first highlight's value preview plus "(+N more)" badge if multiple highlights exist
  - Type badge for first highlight, color chips for first highlight, and `B/I/U` indicators for first highlight's styling
- **AND** the Enabled toggle MUST flip `rule.disabled` and persist back to sync without altering other metadata, dimming disabled rows via `opacity-50`,
- **AND** "View" MUST populate the detail drawer (`highlightTextRuleDetails`) with a summary showing all patterns as a bullet list and all highlights as a compact list with type/value/colors,
- **AND** "Edit" MUST repopulate the form with all patterns as chips and all highlights as accordion entries, scroll the form into view, set `editingRuleId`, and switch the submit label to "Update rule",
- **AND** "Delete" MUST confirm via `window.confirm`, remove the rule, persist the pruned array, and hide the detail drawer if it referenced the deleted entry.

### Requirement: The popup highlight shortcut SHALL prefill the options section with the active tab URL

The popup MUST allow users to quickly jump to the highlight text options section with the current tab URL pre-filled as the first pattern chip.

#### Scenario: Jump from the popup to the Highlight Text form
- **GIVEN** the user clicks the 🟨 shortcut in `src/popup/popup.js`,
- **WHEN** `handleHighlightText()` resolves the active tab,
- **THEN** it MUST require a valid `tab.url`, store `{ highlightTextPrefillUrl: url }` in `chrome.storage.local`, call `chrome.runtime.openOptionsPage()`, close the popup on success, and surface a status error if no tab/URL is found,
- **AND** once the options page loads, `checkForPrefillUrl()` MUST fetch and delete that local key, wait (retrying up to ~2.5 s) for `window.navigationManager`, navigate to `#highlight-text-heading`, reveal that section, focus the pattern input, and add the stored URL as the first pattern chip so the user can immediately add more patterns or highlights.

### Requirement: The highlight text content script SHALL apply stored rules to matching pages

The content script MUST load rules from storage, migrate legacy rules, match current URL against each rule's `patterns[]` array, and apply all `highlights[]` entries from matching rules to the page DOM.

#### Scenario: Load rules and decide applicability
- **GIVEN** the script initializes,
- **THEN** `loadRules()` MUST pull `highlightTextRules`, detect and migrate legacy single-pattern rules via `migrateHighlightRules()`, save back if migration occurred, drop anything missing required fields (`patterns[]`, `highlights[]`), coerce boolean flags, and cache them in memory,
- **AND** `applyHighlighting()` MUST clear any previous spans via `removeAllHighlights()`, read `window.location.href`, and filter to enabled rules where ANY pattern in `patterns[]` matches via `URLPattern` or the wildcard fallback, then iterate over each matching rule's `highlights[]` to apply all highlight entries to the DOM.

#### Scenario: Wrap matched text while protecting page semantics
- **GIVEN** a text node is being processed,
- **WHEN** a highlight entry with `type === 'whole-phrase'` matches, the script MUST wrap only the first contiguous match in that node with a `<span class="nenya-highlight-<ruleId>-<highlightId>">` styled with the entry's text/background colors, padding, border radius, and optional bold/italic/underline flags,
- **AND** for `comma-separated` entries it MUST iterate the trimmed list, wrap the first matching entry per node,
- **AND** for `regex` entries it MUST call `text.matchAll()` to wrap every capture using `DocumentFragment`,
- **AND** the class name MUST include both rule ID and highlight entry ID to allow proper removal and minimap coloring,
- **AND** the walker MUST ignore `<script>`, `<style>`, `<code>`, `<pre>`, `<textarea>`, and `<input>` tags, skip any element already containing the highlight class prefix.

### Requirement: Highlight rendering SHALL stay accurate as content, navigation state, or stored rules change

The content script MUST re-apply highlights when DOM content changes, URL changes in SPA navigations, or stored rules are modified from another context.

#### Scenario: Reapply highlights when the DOM or URL changes
- **GIVEN** the page mutates after the initial pass,
- **THEN** the MutationObserver MUST watch `document.body` for added nodes, detect when `window.location.href` changes in SPA navigations, and debounce `applyHighlighting()` (100 ms) whenever new text content appears or the URL differs from the last pass,
- **AND** `popstate` events, window `resize`, and scroll listeners MUST either trigger a debounced reapply (resize) or refresh the minimap viewport box so the overlay tracks the current view.

#### Scenario: Respond to storage edits
- **GIVEN** the user edits highlight rules elsewhere,
- **WHEN** `chrome.storage.onChanged` reports `highlightTextRules` in the `sync` area,
- **THEN** the content script MUST reload the rules (including migration), re-run `applyHighlighting()`, clearing obsolete spans before painting new matches.

### Requirement: The highlight minimap SHALL visualize result density and offer navigation

The minimap MUST display markers for all highlighted elements on the page, colored according to each highlight entry's background color, and allow users to click markers to navigate.

#### Scenario: Render markers and viewport indicator
- **GIVEN** `applyHighlighting()` finishes,
- **THEN** `updateMinimap()` MUST query all elements whose class name starts with `nenya-highlight-`, hide the minimap (`opacity: 0`) when none exist, or otherwise create 3 px-tall markers positioned by the match’s top offset divided by total document height,
- **AND** markers MUST inherit the highlight’s computed background color so groups of matches are visually tied to their rule styling,
- **AND** `updateMinimapViewport()` MUST set the viewport overlay height/position proportional to `window.innerHeight / documentHeight` and `scrollY / documentHeight`, updating on scroll/resize via debounced listeners.

#### Scenario: Allow users to jump via the minimap
- **GIVEN** the minimap is visible,
- **WHEN** the user clicks a marker,
- **THEN** the handler MUST scroll the associated highlight element into centered view with smooth behavior.

### Requirement: Backward compatibility migration SHALL convert legacy rules to the new structure

The migration utility MUST detect legacy single-pattern highlight rules and convert them to the new multi-pattern/multi-highlight structure, preserving all original data and running idempotently.

#### Scenario: Migrate legacy single-pattern rule
- **GIVEN** a stored rule has `pattern` (string) instead of `patterns` (array),
- **WHEN** `migrateHighlightRule(rule)` is called,
- **THEN** it MUST return a new object with `patterns: [rule.pattern]` and `highlights: [{ id, type, value, textColor, backgroundColor, bold, italic, underline, ignoreCase }]` extracted from the flat fields,
- **AND** it MUST preserve `id`, `disabled`, `createdAt`, `updatedAt`,
- **AND** the highlight entry MUST receive a newly generated `id`.

#### Scenario: Skip migration for already-migrated rules
- **GIVEN** a stored rule already has `patterns` (array) and `highlights` (array),
- **WHEN** `migrateHighlightRule(rule)` is called,
- **THEN** it MUST return the rule unchanged (idempotent).

#### Scenario: Migration runs during import and restore
- **GIVEN** the user imports settings or restores a backup containing legacy highlight rules,
- **WHEN** the import/restore flow processes `highlightTextRules`,
- **THEN** it MUST call `migrateHighlightRules()` before merging or applying the rules to storage.

