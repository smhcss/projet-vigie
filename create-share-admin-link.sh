#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage : $0 https://<adresse-trycloudflare>"
  exit 2
fi

OUTPUT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
case "$1" in
  https://*.trycloudflare.com) ;;
  *) echo "Utilise l’adresse HTTPS trycloudflare fournie par le tunnel."; exit 2 ;;
esac

export VIGIE_HOST=127.0.0.1
export VIGIE_PORT=8766
export VIGIE_DATA_DIR="$OUTPUT_DIR/../work/vigie-share-data"
export VIGIE_DB_FILENAME=.vigie-share.sqlite3
export VIGIE_COOKIE_SECURE=1
export VIGIE_ALLOW_TRYCLOUDFLARE_ORIGIN=1
export VIGIE_PUBLIC_ORIGIN="$1"
exec python3 "$OUTPUT_DIR/server.py" --create-admin-link
