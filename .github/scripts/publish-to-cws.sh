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

echo "Requesting OAuth access token..."
token_response="$(curl --silent --show-error --fail \
  --request POST \
  --url 'https://oauth2.googleapis.com/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "client_id=${CWS_CLIENT_ID}" \
  --data-urlencode "client_secret=${CWS_CLIENT_SECRET}" \
  --data-urlencode "refresh_token=${CWS_REFRESH_TOKEN}" \
  --data-urlencode 'grant_type=refresh_token')"

access_token="$(TOKEN_RESPONSE="${token_response}" node -e "
  const response = JSON.parse(process.env.TOKEN_RESPONSE || '{}');
  if (!response.access_token) {
    process.stderr.write('Token response missing access_token\\n');
    process.exit(1);
  }
  process.stdout.write(response.access_token);
")"

echo "Uploading package for extension ${CWS_EXTENSION_ID}..."
upload_response="$(curl --silent --show-error --fail \
  --request PUT \
  --url "https://www.googleapis.com/upload/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}" \
  --header "Authorization: Bearer ${access_token}" \
  --header 'x-goog-api-version: 2' \
  --header 'Content-Type: application/zip' \
  --data-binary "@${ARCHIVE_PATH}")"

upload_state="$(UPLOAD_RESPONSE="${upload_response}" node -e "
  const response = JSON.parse(process.env.UPLOAD_RESPONSE || '{}');
  process.stdout.write(String(response.uploadState || ''));
")"

if [ "${upload_state}" != 'SUCCESS' ]; then
  echo "Upload did not succeed. Response:"
  echo "${upload_response}"
  exit 1
fi

echo "Publishing extension with publishTarget=${PUBLISH_TARGET}..."
publish_response="$(curl --silent --show-error --fail \
  --request POST \
  --url "https://www.googleapis.com/chromewebstore/v1.1/items/${CWS_EXTENSION_ID}/publish?publishTarget=${PUBLISH_TARGET}" \
  --header "Authorization: Bearer ${access_token}" \
  --header 'x-goog-api-version: 2')"

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
