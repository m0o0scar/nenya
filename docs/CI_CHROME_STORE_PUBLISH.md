# GitHub Actions: Auto Version + Chrome Store Publish

This repository has two release workflows:

1. `.github/workflows/version-management.yml`
- Trigger: push to `main`
- Action: bump `manifest.json` + `package.json` minor version, commit, tag `v<version>`
- Note: set `RELEASE_PUSH_TOKEN` so tag pushes can trigger downstream workflows.

2. `.github/workflows/chrome-store-publish.yml`
- Trigger: push tag `v*`
- Trigger: `workflow_run` when `Version Management` completes successfully on `main`
- Also supports manual run (`workflow_dispatch`) with a tag input.
- Action: verify tag commit belongs to `main`, build zip, upload + publish to Chrome Web Store

## Required GitHub Secrets

Set these in repository settings:

- `CWS_EXTENSION_ID`
  - Chrome extension ID from the Chrome Web Store item URL.
- `RELEASE_PUSH_TOKEN`
  - GitHub PAT used by `version-management.yml` to push version commits and tags.
  - Optional for this setup (publish also runs via `workflow_run`).
  - Useful if you want the tag push event itself to trigger other workflows.
  - Recommended scopes: `repo` and `workflow`.
- `CWS_CLIENT_ID`
  - OAuth 2.0 client ID from Google Cloud project.
- `CWS_CLIENT_SECRET`
  - OAuth 2.0 client secret for the same client ID.
- `CWS_REFRESH_TOKEN`
  - Refresh token issued with scope `https://www.googleapis.com/auth/chromewebstore`.
- `CWS_PUBLISH_TARGET` (optional)
  - `default` (public) or `trustedTesters`.
  - If omitted, workflow defaults to `default`.

## One-Time Credential Setup (OAuth Refresh Token)

1. Create a Google Cloud project (or use an existing one owned by the publisher account).
2. Enable the Chrome Web Store API.
3. Create OAuth client credentials.
4. Generate a refresh token with scope:
   - `https://www.googleapis.com/auth/chromewebstore`
5. Add all values as GitHub secrets.

## Service Account Option

Chrome Web Store API v2 also supports service accounts. You can switch to that flow later, but the current workflow uses OAuth refresh token credentials.
