## MODIFIED Requirements

### Requirement: Automatic options sync MUST merge concurrent browser changes
The options sync system SHALL use a single Automerge document stored in Raindrop to merge option changes across browser devices without normal sync overwriting unmerged local edits.

#### Scenario: Local edits are recorded before remote sync
- **WHEN** any supported option key in `chrome.storage.local` changes
- **THEN** the background sync service SHALL record that change in the local Automerge document with the current browser actor id
- **AND** it SHALL debounce a Raindrop sync rather than uploading a whole JSON snapshot.

#### Scenario: Remote sync merges instead of overwrites
- **WHEN** startup, install, login, alarm, storage-change, or manual backup sync runs
- **THEN** the service SHALL fetch the Raindrop Automerge document, merge it with the local Automerge document, apply the merged options to `chrome.storage.local`, persist the merged local document, and save the merged document back to Raindrop
- **AND** local edits that have not yet reached Raindrop SHALL remain in the merged result.

### Requirement: Raindrop sync storage MUST be chunked and integrity checked
The remote Automerge document SHALL be serialized and split into Raindrop item chunks that can be validated before loading.

#### Scenario: Saving chunked sync state
- **WHEN** a sync saves the Automerge document
- **THEN** the system SHALL Base64 encode it, split it into Raindrop item excerpts with `{ version, syncId, index, total, data }`, and remove obsolete chunks after the new chunk set is written.

#### Scenario: Rejecting incomplete remote state
- **WHEN** the system reads Raindrop sync chunks
- **THEN** it SHALL only load a chunk set when all indices from `0` to `total - 1` exist for the same `syncId`
- **AND** it SHALL fail without applying partial options when no complete chunk set can be reconstructed.

### Requirement: Manual restore MUST be a destructive recovery action
Manual Restore SHALL replace the local Automerge document and local options from the remote Raindrop document instead of performing a normal merge.

#### Scenario: Force restore discards local unsynced changes
- **WHEN** the user triggers Restore from the options or popup backup controls
- **THEN** the background SHALL fetch and validate the remote Automerge document, replace local option storage with that document, persist it locally, and report that local unsynced changes were discarded.

### Requirement: Legacy JSON backup MUST remain available for migration
The existing `nenya / backup` JSON backup SHALL be left untouched and MAY seed the first Automerge document when no CRDT document exists.

#### Scenario: First sync without CRDT document
- **GIVEN** Raindrop has no `nenya / options sync` Automerge chunks
- **AND** a legacy `nenya / backup` JSON file exists
- **WHEN** normal sync runs
- **THEN** the system SHALL create a new Automerge document from the legacy payload and current local options, save it to the new collection, and leave the legacy file unchanged.
