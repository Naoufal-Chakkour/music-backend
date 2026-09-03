#!/bin/sh

echo "=== DEBUG RUNTIMES ==="
which deno || true
deno --version || true
which yt-dlp || true
yt-dlp --version || true
echo "=== END DEBUG ==="

echo "Starting bgutil POT Provider..."

cd /opt/bgutil-ytdlp-pot-provider/server

node build/main.js --port 4416 &

echo "bgutil POT Provider started on 127.0.0.1:4416"

sleep 3

echo "Starting Music Backend..."

cd /app

npm start