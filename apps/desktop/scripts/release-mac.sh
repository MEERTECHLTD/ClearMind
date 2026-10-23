#!/bin/sh
# Developer ID release of the direct download: universal app signed with the
# hardened runtime and notarized (electron-builder), then the DMG itself signed,
# notarized and stapled so Gatekeeper accepts it straight from a browser.
# Needs the "Developer ID Application: MEERTECH LTD (7N86K8Q433)" identity in the
# keychain and an App Store Connect API key:
#   APPLE_API_KEY=/path/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=uuid npm run release:mac
set -eu
cd "$(dirname "$0")/.."
: "${APPLE_API_KEY:?}" "${APPLE_API_KEY_ID:?}" "${APPLE_API_ISSUER:?}"
ID="Developer ID Application: MEERTECH LTD (7N86K8Q433)"
npm run build -- -c.mac.identity="MEERTECH LTD (7N86K8Q433)" -c.mac.hardenedRuntime=true -c.mac.notarize=true
codesign --force --timestamp --sign "$ID" dist/ClearMind.dmg
xcrun notarytool submit dist/ClearMind.dmg --key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple dist/ClearMind.dmg
spctl -a -vv -t exec dist/mac-universal/ClearMind.app
spctl -a -vv -t open --context context:primary-signature dist/ClearMind.dmg
