## Context

The highlight text feature currently uses a flat rule structure where each rule has exactly one URL pattern and one set of highlight settings. This design document covers the migration to a more flexible structure supporting multiple patterns and multiple highlight definitions per rule.

**Stakeholders**: End users managing highlight rules, extension maintainers.

## Goals / Non-Goals

### Goals
- Allow users to define multiple URL patterns per rule
- Allow users to define multiple highlight styles per rule
- Maintain full backward compatibility with existing stored rules
- Provide intuitive UI for managing the new structure

### Non-Goals
- Changing how highlights are visually rendered on pages (styling stays the same)
- Adding new highlight types beyond existing `whole-phrase`, `comma-separated`, `regex`
- Changing the storage key or sync mechanism

## Decisions

### Decision 1: New Data Structure

**Old structure:**
```javascript
{
  id: string,
  pattern: string,              // single URL pattern
  type: 'whole-phrase' | 'comma-separated' | 'regex',
  value: string,
  textColor: string,
  backgroundColor: string,
  bold: boolean,
  italic: boolean,
  underline: boolean,
  ignoreCase: boolean,
  disabled?: boolean,
  createdAt?: string,
  updatedAt?: string
}
```

**New structure:**
```javascript
{
  id: string,
  patterns: string[],           // one or more URL patterns
  highlights: HighlightEntry[], // one or more highlight definitions
  disabled?: boolean,
  createdAt?: string,
  updatedAt?: string
}

// Where HighlightEntry is:
{
  id: string,                   // unique within the rule
  type: 'whole-phrase' | 'comma-separated' | 'regex',
  value: string,
  textColor: string,
  backgroundColor: string,
  bold: boolean,
  italic: boolean,
  underline: boolean,
  ignoreCase: boolean
}
```

**Rationale**: Moving `disabled`, `createdAt`, and `updatedAt` to the rule level (not per-highlight) keeps management simple. Each highlight entry gets its own `id` for stable accordion state and editing.

### Decision 2: Eager Migration Strategy

Migration runs in these locations:
1. **On extension load** (`loadRules()` in both content script and options page)
2. **During import** (`importExport.js`)
3. **During restore** (`options-backup.js`)

The migration function:
- Detects legacy rules by checking for `pattern` (string) vs `patterns` (array)
- Converts `pattern` → `patterns: [pattern]`
- Extracts highlight fields into `highlights: [{ id, type, value, ... }]`
- Preserves all original data
- Saves migrated rules back to storage

**Rationale**: Eager migration ensures all code paths work with the new structure consistently. Running migration at import/restore/load covers all entry points.

### Decision 3: UI Components

**URL Patterns (Tag/Chip UI)**:
- Input field with "Add" button
- Each pattern displays as a removable chip/tag
- Validation runs on each pattern before adding
- At least one pattern required

**Highlights (Accordion UI)**:
- Collapsible sections, one per highlight entry
- Each section shows: type badge, value preview, color chips
- Expand to edit full highlight settings
- "Add highlight" button creates new collapsed entry
- At least one highlight required
- Delete button on each entry (disabled if only one remains)

**Rule List Summary**:
- Shows pattern count: "3 patterns" or first pattern if only one
- Shows highlight count: "2 highlights" or value preview if only one
- Detail panel shows summary lists, not full editing

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Migration corrupts existing rules | Validate before overwriting; keep original fields during migration; extensive testing |
| UI becomes complex/confusing | Progressive disclosure via accordion; sensible defaults; clear empty states |
| Storage size increases | Minimal impact; most users have few rules; sync storage limit (100KB) unlikely to be hit |
| Performance with many highlights per rule | Early exit on first match per text node (existing behavior); debounced re-application |

## Migration Plan

1. **Phase 1**: Implement migration utility function with unit tests
2. **Phase 2**: Update content script to use new structure (with migration on load)
3. **Phase 3**: Update options page UI (with migration on load)
4. **Phase 4**: Update import/export and backup/restore to use migration
5. **Rollback**: If issues arise, the migration function is idempotent; re-running on fixed code will work

## Open Questions

None — all questions resolved in pre-proposal discussion.

