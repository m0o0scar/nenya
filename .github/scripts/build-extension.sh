#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="${1:-dist}"
ARCHIVE_NAME="${2:-extension.zip}"
PACKAGE_DIR="${DIST_DIR}/package"

if ! command -v zip >/dev/null 2>&1; then
  echo "zip command is required but not installed."
  exit 1
fi

rm -rf "${PACKAGE_DIR}"
mkdir -p "${PACKAGE_DIR}"

cp manifest.json "${PACKAGE_DIR}/manifest.json"
cp -R src "${PACKAGE_DIR}/src"
cp -R assets "${PACKAGE_DIR}/assets"

(
  cd "${PACKAGE_DIR}"
  find . -name '.DS_Store' -delete
  zip -qr "../${ARCHIVE_NAME}" .
)

echo "Built extension package: ${DIST_DIR}/${ARCHIVE_NAME}"
