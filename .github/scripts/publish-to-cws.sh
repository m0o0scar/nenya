#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-}"
PUBLISH_TARGET="${CWS_PUBLISH_TARGET:-default}"

if [ -z "${ARCHIVE_PATH}" ] || [ ! -f "${ARCHIVE_PATH}" ]; then
  echo "Usage: publish-to-cws.sh <path-to-zip>"
  exit 1
fi

required_vars=(
  CWS_EXTENSION_ID
  CWS_CLIENT_ID
  CWS_CLIENT_SECRET
  CWS_REFRESH_TOKEN
)

for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "Missing required env var: ${var_name}"
    exit 1
  fi
done

trim_secret() {
  local value="$1"
  value="$(printf '%s' "${value}" | tr -d '\r')"
  # shellcheck disable=SC2001
  value="$(printf '%s' "${value}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  printf '%s' "${value}"
}

CWS_EXTENSION_ID="$(trim_secret "${CWS_EXTENSION_ID}")"
CWS_CLIENT_ID="$(trim_secret "${CWS_CLIENT_ID}")"
CWS_CLIENT_SECRET="$(trim_secret "${CWS_CLIENT_SECRET}")"
CWS_REFRESH_TOKEN="$(trim_secret "${CWS_REFRESH_TOKEN}")"
PUBLISH_TARGET="$(trim_secret "${PUBLISH_TARGET}")"
if [ -n "${CWS_PUBLISHER_ID:-}" ]; then
  CWS_PUBLISHER_ID="$(trim_secret "${CWS_PUBLISHER_ID}")"
fi

request_oauth_token() {
  local token_body_file

  token_body_file="$(mktemp)"
  OAUTH_TOKEN_STATUS="$(curl --silent --show-error \
    --output "${token_body_file}" \
    --write-out '%{http_code}' \
    --request POST \
    --url 'https://oauth2.googleapis.com/token' \
    --header 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "client_id=${CWS_CLIENT_ID}" \
    --data-urlencode "client_secret=${CWS_CLIENT_SECRET}" \
    --data-urlencode "refresh_token=${CWS_REFRESH_TOKEN}" \
    --data-urlencode 'grant_type=refresh_token')"

  OAUTH_TOKEN_RESPONSE="$(cat "${token_body_file}")"
  rm -f "${token_body_file}"
}

parse_oauth_error() {
  local response="$1"
  node -e "
    let body = {};
    try { body = JSON.parse(process.argv[1] || '{}'); } catch (_) {}
    const code = body.error || '';
    const description = body.error_description || '';
    process.stdout.write(code + '|' + description);
  " "${response}"
}

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

echo "Requesting OAuth access token..."
request_oauth_token
token_status="${OAUTH_TOKEN_STATUS}"
token_response="${OAUTH_TOKEN_RESPONSE}"

if [ "${token_status}" != '200' ]; then
  oauth_error="$(parse_oauth_error "${token_response}")"
  oauth_error_code="${oauth_error%%|*}"
  oauth_error_description="${oauth_error#*|}"
fi

if [ "${token_status}" != '200' ]; then
  echo "OAuth token request failed with HTTP ${token_status}."
  if [ -n "${oauth_error_code}" ]; then
    echo "OAuth error: ${oauth_error_code}"
  fi
  if [ -n "${oauth_error_description}" ]; then
    echo "OAuth description: ${oauth_error_description}"
  fi

  if [ "${oauth_error_code}" = 'invalid_client' ]; then
    echo "Hint: CWS_CLIENT_ID/CWS_CLIENT_SECRET pair is invalid or malformed."
    echo "Hint: ensure both values come from the same Google OAuth client and contain no extra spaces/newlines."
  fi
  if [ "${oauth_error_code}" = 'invalid_grant' ]; then
    echo "Hint: refresh token is invalid/revoked, or it was minted for a different OAuth client."
    echo "Hint: regenerate refresh token with scope https://www.googleapis.com/auth/chromewebstore using this same client ID."
  fi
  if [ "${oauth_error_code}" = 'unauthorized_client' ]; then
    echo "Hint: this OAuth client is not allowed for this token flow."
    echo "Hint: use OAuth client type 'Web application' in Google Cloud."
    echo "Hint: your refresh token must be minted with this exact client ID and secret."
    echo "Hint: when using OAuth Playground, enable 'Use your own OAuth credentials' and enter this same client ID/secret."
    echo "Hint: add https://developers.google.com/oauthplayground to Authorized redirect URIs for this OAuth client."
    echo "Hint: ensure the account that created the refresh token can access the Chrome Web Store publisher/extension."
  fi

  exit 1
fi

access_token="$(TOKEN_RESPONSE="${token_response}" node -e "
  const response = JSON.parse(process.env.TOKEN_RESPONSE || '{}');
  if (!response.access_token) {
    process.stderr.write('Token response missing access_token\\n');
    process.exit(1);
  }
  process.stdout.write(response.access_token);
")"

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
