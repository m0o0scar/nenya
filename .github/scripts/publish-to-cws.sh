#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
PUBLISH_TARGET="${CWS_PUBLISH_TARGET:-default}"
ACCESS_TOKEN="${CWS_ACCESS_TOKEN:-}"

if [ -z "${ARCHIVE_PATH}" ] || [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Usage: publish-to-cws.sh <path-to-zip>"
  exit 1
fi

if [ -z "${CWS_EXTENSION_ID:-}" ]; then
  echo 'Missing required env var: CWS_EXTENSION_ID'
  exit 1
fi

trim_secret() {
  local value="$1"
  value="$(printf '%s' "${value}" | tr -d '\r')"
  # shellcheck disable=SC2001
  value="$(printf '%s' "${value}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  printf '%s' "${value}"
}

CWS_EXTENSION_ID="$(trim_secret "${CWS_EXTENSION_ID}")"
ACCESS_TOKEN="$(trim_secret "${ACCESS_TOKEN}")"
PUBLISH_TARGET="$(trim_secret "${PUBLISH_TARGET}")"
if [ -n "${CWS_PUBLISHER_ID:-}" ]; then
  CWS_PUBLISHER_ID="$(trim_secret "${CWS_PUBLISHER_ID}")"
fi

parse_upload_state() {
  local response="$1"
  UPLOAD_RESPONSE="${response}" node -e "
    const response = JSON.parse(process.env.UPLOAD_RESPONSE || '{}');
    process.stdout.write(String(response.uploadState || ''));
  "
}

upload_has_error_code() {
  local response="$1"
  local expected_code="$2"
  UPLOAD_RESPONSE="${response}" EXPECTED_CODE="${expected_code}" node -e "
    let response = {};
    try { response = JSON.parse(process.env.UPLOAD_RESPONSE || '{}'); } catch (_) {}
    const errors = Array.isArray(response.itemError) ? response.itemError : [];
    const expectedCode = process.env.EXPECTED_CODE || '';
    const found = errors.some((itemError) => String(itemError.error_code || '') === expectedCode);
    process.stdout.write(found ? 'true' : 'false');
  "
}

request_upload() {
  local upload_body_file
  upload_body_file="$(mktemp)"
  UPLOAD_STATUS="$(curl --silent --show-error \
    --output "${upload_body_file}" \
    --write-out '%{http_code}' \
    --request PUT \
    --url "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}" \
    --header "Authorization: Bearer ${access_token}" \
    --header 'x-goog-api-version: 2' \
    --header 'Content-Type: application/zip' \
    --data-binary "@${ARCHIVE_PATH}")"

  UPLOAD_RESPONSE="$(cat "${upload_body_file}")"
  rm -f "${upload_body_file}"
}

cancel_pending_submission() {
  local cancel_body_file cancel_status cancel_response

  if [ -z "${CWS_PUBLISHER_ID:-}" ]; then
    echo "Upload blocked by ITEM_NOT_UPDATABLE."
    echo "Set CWS_PUBLISHER_ID to enable automatic cancellation of pending review."
    return 1
  fi

  cancel_body_file="$(mktemp)"
  cancel_status="$(curl --silent --show-error \
    --output "${cancel_body_file}" \
    --write-out '%{http_code}' \
    --request POST \
    --url "https://chromewebstore.googleapis.com/v2/publishers/${CWS_PUBLISHER_ID}/items/${CWS_EXTENSION_ID}:cancelSubmission" \
    --header "Authorization: Bearer ${access_token}")"

  cancel_response="$(cat "${cancel_body_file}")"
  rm -f "${cancel_body_file}"

  if [ "${cancel_status}" -lt 200 ] || [ "${cancel_status}" -ge 300 ]; then
    echo "Cancel submission failed with HTTP ${cancel_status}."
    if [ -n "${cancel_response}" ]; then
      echo "Response:"
      echo "${cancel_response}"
    fi
    return 1
  fi

  # Give CWS a moment to release the previous review lock.
  sleep 5

  return 0
}

if [ -z "${ACCESS_TOKEN}" ]; then
  echo 'Missing required env var: CWS_ACCESS_TOKEN'
  echo 'Hint: configure google-github-actions/auth to mint an access token with scope https://www.googleapis.com/auth/chromewebstore.'
  exit 1
fi

access_token="${ACCESS_TOKEN}"

echo "Uploading package for extension ${CWS_EXTENSION_ID}..."
request_upload
upload_status="${UPLOAD_STATUS}"
upload_response="${UPLOAD_RESPONSE}"

if [ "${upload_status}" -lt 200 ] || [ "${upload_status}" -ge 300 ]; then
  echo "Upload request failed with HTTP ${upload_status}."
  echo "Response:"
  echo "${upload_response}"
  exit 1
fi

upload_state="$(parse_upload_state "${upload_response}")"

if [ "${upload_state}" != 'SUCCESS' ]; then
  if [ "$(upload_has_error_code "${upload_response}" 'ITEM_NOT_UPDATABLE')" = 'true' ]; then
    echo "Upload failed with ITEM_NOT_UPDATABLE. Attempting to cancel pending submission..."

    if ! cancel_pending_submission; then
      echo "Upload did not succeed. Response:"
      echo "${upload_response}"
      exit 1
    fi

    echo "Retrying upload after cancelSubmission..."
    request_upload
    upload_status="${UPLOAD_STATUS}"
    upload_response="${UPLOAD_RESPONSE}"

    if [ "${upload_status}" -lt 200 ] || [ "${upload_status}" -ge 300 ]; then
      echo "Upload retry failed with HTTP ${upload_status}."
      echo "Response:"
      echo "${upload_response}"
      exit 1
    fi

    upload_state="$(parse_upload_state "${upload_response}")"
  fi
fi

if [ "${upload_state}" != 'SUCCESS' ]; then
  echo "Upload did not succeed. Response:"
  echo "${upload_response}"
  exit 1
fi

echo "Publishing extension with publishTarget=${PUBLISH_TARGET}..."
publish_body_file="$(mktemp)"
publish_status_code="$(curl --silent --show-error \
  --output "${publish_body_file}" \
  --write-out '%{http_code}' \
  --request POST \
  --url "https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}/publish?publishTarget=${PUBLISH_TARGET}" \
  --header "Authorization: Bearer ${access_token}" \
  --header 'x-goog-api-version: 2')"

publish_response="$(cat "${publish_body_file}")"
rm -f "${publish_body_file}"

if [ "${publish_status_code}" -lt 200 ] || [ "${publish_status_code}" -ge 300 ]; then
  echo "Publish request failed with HTTP ${publish_status_code}."
  echo "Response:"
  echo "${publish_response}"
  exit 1
fi

publish_status="$(PUBLISH_RESPONSE="${publish_response}" node -e "
  const response = JSON.parse(process.env.PUBLISH_RESPONSE || '{}');
  const status = response.status;
  if (Array.isArray(status)) {
    process.stdout.write(status.join(','));
    process.exit(0);
  }
  process.stdout.write(String(status || ''));
")"

if ! printf '%s' "${publish_status}" | grep -q 'OK'; then
  echo "Publish did not return OK status. Response:"
  echo "${publish_response}"
  exit 1
fi

echo "Chrome Web Store publish completed. Status: ${publish_status}"
