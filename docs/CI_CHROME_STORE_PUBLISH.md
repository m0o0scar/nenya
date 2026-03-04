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
- Action: verify tag commit belongs to `main`, build zip, mint a short-lived access token from Google service account credentials, then upload + publish to Chrome Web Store

## Required GitHub Secrets

Set these in repository settings:

- `CWS_EXTENSION_ID`
  - Chrome extension ID from the Chrome Web Store item URL.
- `RELEASE_PUSH_TOKEN`
  - GitHub PAT used by `version-management.yml` to push version commits and tags.
  - Optional for this setup (publish also runs via `workflow_run`).
  - Useful if you want the tag push event itself to trigger other workflows.
  - Recommended scopes: `repo` and `workflow`.
- `GCP_SERVICE_ACCOUNT_KEY`
  - Full JSON key content for the Google service account used by CI.
  - The workflow uses this secret with `google-github-actions/auth` and requests scope `https://www.googleapis.com/auth/chromewebstore`.
- `CWS_PUBLISH_TARGET` (optional)
  - `default` (public) or `trustedTesters`.
  - If omitted, workflow defaults to `default`.
- `CWS_PUBLISHER_ID` (optional but recommended)
  - Required only for auto-canceling a pending review when upload returns `ITEM_NOT_UPDATABLE`.
  - Value is your Chrome Web Store publisher ID used by Chrome Web Store API v2.

## One-Time Credential Setup (Service Account)

1. Create a Google Cloud project (or use an existing one owned by the publisher account).
2. Enable the Chrome Web Store API.
3. Create a service account in that project.
   - In the creation wizard:
   - Step 2 (`Grant this service account access to project`): leave role empty.
   - Step 3 (`Grant users access to this service account`): leave empty unless you intentionally want additional admins/users.
4. Create a JSON key for that service account.
5. In Chrome Web Store Developer Dashboard, add this service account email under API/service-account access for your publisher.
   - Ensure it can manage the target extension.
6. Save the JSON key content as GitHub secret `GCP_SERVICE_ACCOUNT_KEY`.
7. Add/update `CWS_EXTENSION_ID` and optionally `CWS_PUBLISH_TARGET` and `CWS_PUBLISHER_ID`.

## Troubleshooting Service Account Errors

- `google-github-actions/auth` fails before publish
  - `GCP_SERVICE_ACCOUNT_KEY` is missing, malformed, or not valid JSON.
- Upload/publish returns `401`/`403`
  - Service account is not linked in Chrome Web Store API access.
  - Service account lacks permission for the target extension/publisher.
- `ITEM_NOT_UPDATABLE`
  - Extension has an active pending review/ready-to-publish state and cannot accept a new upload yet.
  - Set `CWS_PUBLISHER_ID` so CI can call `cancelSubmission` and retry upload automatically.
- Publish fails after key rotation/revocation
  - Generate a new JSON key and update `GCP_SERVICE_ACCOUNT_KEY`.

## Notes

- This workflow no longer requires `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, or `CWS_REFRESH_TOKEN`.
- Service accounts avoid refresh-token revocation/expiration issues (`invalid_grant` from refresh-token OAuth flow).
