#!/bin/sh
set -eu

OUTPUT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SHARE_DATA_DIR="$OUTPUT_DIR/../work/vigie-share-data"

export VIGIE_HOST=127.0.0.1
export VIGIE_PORT=8766
export VIGIE_DATA_DIR="$SHARE_DATA_DIR"
export VIGIE_DB_FILENAME=.vigie-share.sqlite3
export VIGIE_COOKIE_SECURE=1
export VIGIE_ALLOW_TRYCLOUDFLARE_ORIGIN=1

echo "Instance de partage prête sur http://127.0.0.1:8766"
echo "Données séparées du serveur local principal. Arrêter avec Ctrl+C."
exec python3 "$OUTPUT_DIR/server.py"
