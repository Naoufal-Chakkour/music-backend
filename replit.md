# Music Backend

## Run on Replit

The project runs as a Node.js Express API:

```bash
node server.js
```

The Replit workflow starts the server on port `5000`. The server also requires
Python and FFmpeg for `yt-dlp-exec` audio extraction; both are configured in
`.replit`.

## API endpoints

- `GET /api/search?q=<search text>` searches YouTube and returns matching tracks.
- `GET /api/download?id=<YouTube video ID>` extracts and downloads an MP3.