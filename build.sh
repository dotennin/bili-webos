#!/bin/bash
# Build, package (app + service), and deploy to TV
set -e
cd "$(dirname "$0")"
PASS="${1:-4E7082}"

echo "=== [1/3] Build & Package ==="
cd app
npx vite build 2>&1 | tail -2
cp webos-meta/* dist/
cd dist
ares-package --no-minify . ../../service/com.biliwebos.app.service 2>&1 | grep -E "Success|ERR|Create"
cd ../..

echo ""
echo "=== [2/3] Deploy ==="
node tools/deploy.mjs "$PASS" 2>&1 | grep -E "Done|Error|Connected"

echo ""
echo "=== [3/3] Done ==="
