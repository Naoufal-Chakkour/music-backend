#!/bin/sh

echo "=== DEBUG RUNTIMES ==="

echo "=== DENO PATH TEST ==="
export PATH="/root/.deno/bin:$PATH"
echo "PATH=$PATH"

echo "--- Deno ---"
which deno
deno --version

echo "--- yt-dlp ---"
/usr/local/bin/yt-dlp --js-runtimes deno --version

echo "=== END DENO PATH TEST ==="

echo "--- Installed binaries ---"
which yt-dlp
yt-dlp --version

echo "=== END DEBUG ==="

echo "Starting bgutil POT Provider..."

cd /opt/bgutil-ytdlp-pot-provider/server

node build/main.js --port 4416 &

echo "bgutil POT Provider started on 127.0.0.1:4416"

sleep 3

echo "Starting Music Backend..."

cd /app

npm start