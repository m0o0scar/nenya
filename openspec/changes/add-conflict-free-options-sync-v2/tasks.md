## 1. Implementation
- [x] 1.1 Add pinned browser-ready Automerge library under `src/libs`.
- [x] 1.2 Add Automerge sync module with actor id, local document persistence, Raindrop chunk save/load, merge sync, force restore, and legacy JSON seeding.
- [x] 1.3 Replace old options backup handlers with merge sync handlers while preserving existing message types.
- [x] 1.4 Queue storage-change syncs and run periodic/startup/login syncs.
- [x] 1.5 Update options UI copy so manual backup means sync and restore is marked destructive.

## 2. Validation
- [x] 2.1 Run OpenSpec validation for this change.
- [x] 2.2 Run JavaScript syntax checks on changed background/options files.
- [ ] 2.3 Manually verify two-browser convergence against a live Raindrop account.
