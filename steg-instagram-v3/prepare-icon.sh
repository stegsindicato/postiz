#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source_icon="apps/frontend/public/icons/platforms/instagram.png"
target_icon="apps/frontend/public/icons/platforms/instagram-v3.png"
if [ ! -f "$source_icon" ]; then
  echo "ERROR: no se encontró $source_icon (revisa los iconos de tu versión de Postiz)." >&2
  exit 1
fi
cp -f "$source_icon" "$target_icon"
echo "Icono Instagram V3 preparado: $target_icon"
