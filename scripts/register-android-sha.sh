#!/usr/bin/env bash
# Register an Android signing-certificate fingerprint on the ClearMind Firebase
# Android app (fixes Google sign-in DEVELOPER_ERROR / code 10 for that build).
# Usage: scripts/register-android-sha.sh AB:CD:...   (SHA-1 or SHA-256, colons optional)
# Requires the firebase CLI logged in with access to project clearmind-b8d2b.
set -euo pipefail
PROJECT=clearmind-b8d2b
APP_ID=1:1026200124634:android:45b522411901c8ea9cf9e3
sha=$(echo "${1:?pass the SHA-1 from Play Console → Test and release → App integrity → App signing key certificate}" | tr -d ': ' | tr 'A-F' 'a-f')
case ${#sha} in 40|64) ;; *) echo "Not a SHA-1 (40 hex) or SHA-256 (64 hex): $1" >&2; exit 1 ;; esac
if firebase apps:android:sha:list "$APP_ID" --project "$PROJECT" | grep -qi "$sha"; then
  echo "Already registered: $sha"
else
  firebase apps:android:sha:create "$APP_ID" "$sha" --project "$PROJECT"
fi
firebase apps:android:sha:list "$APP_ID" --project "$PROJECT"
echo "Done. No new app build is needed — Google checks the fingerprint server-side; allow a few minutes to propagate."
