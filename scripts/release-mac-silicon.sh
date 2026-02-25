#!/usr/bin/env bash
set -euo pipefail

# Build, sign, notarize and staple macOS Apple Silicon DMG for Tauri app.
#
# Usage:
#   scripts/release-mac-silicon.sh
#
# Optional env:
#   APP_NAME=Tentacle
#   APPLE_SIGNING_IDENTITY='Developer ID Application: ... (TEAMID)'
#   APPLE_API_ISSUER='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
#   APPLE_API_KEY='ABC123XYZ9'
#   APPLE_API_KEY_PATH='/absolute/path/AuthKey_ABC123XYZ9.p8'
#   NOTARY_TIMEOUT_MINUTES=30
#   NOTARY_POLL_SECONDS=20

APP_NAME="${APP_NAME:-Tentacle}"
TARGET="aarch64-apple-darwin"
NOTARY_TIMEOUT_MINUTES="${NOTARY_TIMEOUT_MINUTES:-30}"
NOTARY_POLL_SECONDS="${NOTARY_POLL_SECONDS:-20}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env: $name"
    exit 1
  fi
}

require_cmd npm
require_cmd xcrun
require_cmd security
require_cmd awk

require_env APPLE_API_ISSUER
require_env APPLE_API_KEY
require_env APPLE_API_KEY_PATH

if [ ! -f "$APPLE_API_KEY_PATH" ]; then
  echo "APPLE_API_KEY_PATH does not exist: $APPLE_API_KEY_PATH"
  exit 1
fi

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning | sed -n 's/.*"\(Developer ID Application:.*\)".*/\1/p' | head -n1 || true)"
fi

if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  echo "Could not auto-detect APPLE_SIGNING_IDENTITY."
  echo "Run: security find-identity -v -p codesigning"
  echo "Then export APPLE_SIGNING_IDENTITY='Developer ID Application: ... (TEAMID)'"
  exit 1
fi

export APPLE_SIGNING_IDENTITY

echo "==> Using signing identity: $APPLE_SIGNING_IDENTITY"
echo "==> Building target: $TARGET"

cd "$FRONTEND_DIR"
npm ci
npm run tauri build -- --target "$TARGET"

BUNDLE_DIR="$ROOT_DIR/target/$TARGET/release/bundle/dmg"
DMG_PATH="$(find "$BUNDLE_DIR" -maxdepth 1 -type f -name '*.dmg' | sort | tail -n1 || true)"

if [ -z "$DMG_PATH" ] || [ ! -f "$DMG_PATH" ]; then
  echo "DMG not found in: $BUNDLE_DIR"
  exit 1
fi

echo "==> DMG built: $DMG_PATH"
echo "==> Submitting for notarization..."

SUBMIT_OUT="$(xcrun notarytool submit "$DMG_PATH" \
  --issuer "$APPLE_API_ISSUER" \
  --key-id "$APPLE_API_KEY" \
  --key "$APPLE_API_KEY_PATH" 2>&1)"

echo "$SUBMIT_OUT"

SUBMISSION_ID="$(printf '%s\n' "$SUBMIT_OUT" | awk '/id:/ {print $2; exit}')"
if [ -z "$SUBMISSION_ID" ]; then
  echo "Failed to parse notarization submission id."
  exit 1
fi

echo "==> Submission ID: $SUBMISSION_ID"

start_ts="$(date +%s)"
timeout_seconds="$((NOTARY_TIMEOUT_MINUTES * 60))"

while true; do
  INFO_OUT="$(xcrun notarytool info "$SUBMISSION_ID" \
    --issuer "$APPLE_API_ISSUER" \
    --key-id "$APPLE_API_KEY" \
    --key "$APPLE_API_KEY_PATH" 2>&1 || true)"

  echo "$INFO_OUT"

  if printf '%s\n' "$INFO_OUT" | grep -qi 'status:[[:space:]]*Accepted'; then
    echo "==> Notarization accepted"
    break
  fi

  if printf '%s\n' "$INFO_OUT" | grep -qiE 'status:[[:space:]]*(Invalid|Rejected)'; then
    echo "==> Notarization failed. Fetching log..."
    xcrun notarytool log "$SUBMISSION_ID" \
      --issuer "$APPLE_API_ISSUER" \
      --key-id "$APPLE_API_KEY" \
      --key "$APPLE_API_KEY_PATH" || true
    exit 1
  fi

  now_ts="$(date +%s)"
  elapsed="$((now_ts - start_ts))"
  if [ "$elapsed" -ge "$timeout_seconds" ]; then
    echo "Timed out after ${NOTARY_TIMEOUT_MINUTES}m waiting for notarization."
    echo "You can continue checking with:"
    echo "xcrun notarytool info $SUBMISSION_ID --issuer \"$APPLE_API_ISSUER\" --key-id \"$APPLE_API_KEY\" --key \"$APPLE_API_KEY_PATH\""
    exit 1
  fi

  sleep "$NOTARY_POLL_SECONDS"
done

echo "==> Stapling DMG..."
xcrun stapler staple "$DMG_PATH"

echo "==> Validating staple..."
xcrun stapler validate "$DMG_PATH"

echo "==> Gatekeeper assessment..."
spctl -a -vvv -t install "$DMG_PATH"

echo
echo "✅ Done"
echo "Artifact: $DMG_PATH"
