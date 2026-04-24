## 1. Implementation
- [x] 1.1 Remove manifest permissions that become unused: `bookmarks`, `tabGroups`, and any notification-related permission or documentation entry.
- [x] 1.2 Remove browser bookmark mirror/export runtime code, including `src/background/raindrop-export.js`, bookmark folder helpers, mirror root folder creation, pull/reset handlers that mutate browser bookmarks, and startup/alarm hooks tied to local bookmark mirroring.
- [x] 1.3 Remove popup/options UI and JavaScript for browser bookmark mirror/search surfaces, while preserving Raindrop authentication and Save to Unsorted flows that do not use browser bookmarks.
- [x] 1.4 Remove all tab grouping behavior and guard against leftover `chrome.tabs.group`, `chrome.tabGroups`, or `groupId` feature dependencies.
- [x] 1.5 Remove extension notification UI, preferences, storage keys, backup/import-export handling, and background `pushNotification` call sites, replacing required user feedback with existing popup/options status or action badge behavior.
- [x] 1.6 Update specs, README, store docs, and privacy/permission descriptions to stop advertising removed features.
- [x] 1.7 Run OpenSpec validation, static JS checks for touched files, and repo-wide reference scans for removed APIs/keys.
