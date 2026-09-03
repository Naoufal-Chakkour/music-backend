#!/bin/sh

echo "=== DEBUG RUNTIMES ==="

export PATH="/root/.deno/bin:$PATH"

echo "=== DENO FILE TEST ==="

echo "PATH=$PATH"

echo "--- Check Deno file ---"
ls -la /root/.deno/bin/ || true

echo "--- Which Deno ---"
which deno || true

echo "--- Deno version ---"
deno --version || true

echo "--- yt-dlp version ---"
yt-dlp --version || true

echo "--- yt-dlp with Deno ---"
yt-dlp --js-runtimes deno --verbose --version || true

echo "=== END DEBUG ==="

echo "Starting bgutil POT Provider..."

cd /opt/bgutil-ytdlp-pot-provider/server

node build/main.js --port 4416 &

echo "bgutil POT Provider started"

sleep 3

echo "Starting Music Backend..."

cd /app

npm start