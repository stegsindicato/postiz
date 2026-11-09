#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUTH="$ROOT/libraries/nestjs-libraries/src/integrations/social/instagram.v3.auth.ts"
OUT="$ROOT/steg-instagram-v3/_build"
mkdir -p "$OUT"
tsc --target ES2022 --lib ES2022,DOM --module commonjs --outDir "$OUT" "$AUTH"
node --test "$ROOT/steg-instagram-v3/test-auth.cjs"
