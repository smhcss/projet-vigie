#!/bin/sh
set -eu

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared n’est pas installé. Suis le guide officiel : https://developers.cloudflare.com/tunnel/downloads/"
  exit 1
fi

if [ "$#" -ne 0 ]; then
  echo "Usage : $0"
  exit 2
fi

exec cloudflared tunnel --url http://127.0.0.1:8766
