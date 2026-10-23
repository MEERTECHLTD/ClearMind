#!/bin/sh
# Compiles native/apple_signin.mm into a universal Node-API addon
# (native/build/apple_signin.node). Node-API is ABI-stable, so Node's own headers
# work for Electron. Needs Xcode command-line tools.
set -eu
cd "$(dirname "$0")/.."
NODE_INC="${NODE_INCLUDE_DIR:-$(dirname "$(dirname "$(command -v node)")")/include/node}"
mkdir -p native/build
xcrun clang++ -std=c++17 -fobjc-arc -O2 -dynamiclib -undefined dynamic_lookup \
  -arch arm64 -arch x86_64 -mmacosx-version-min=12.0 \
  -DNODE_GYP_MODULE_NAME=apple_signin -DNAPI_VERSION=8 -I"$NODE_INC" \
  -framework AppKit -framework AuthenticationServices \
  native/apple_signin.mm -o native/build/apple_signin.node
lipo -archs native/build/apple_signin.node
