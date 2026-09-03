const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());


// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('Music Backend Service is Running!');
});


// تشغيل yt-dlp
function runYtDlp(args, options = {}) {
  return spawn('/usr/local/bin/yt-dlp', args, {
      ...options,
      env: {
          ...process.env,
          PATH: `/root/.deno/bin:${process.env.PATH || ''}`
      },
      stdio: ['ignore', 'pipe', 'pipe']
  });
}


// البحث
app.get('/api/search', (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({
            error: 'Query parameter required'
        });
    }

    const args = [
        `ytsearch10:${query}`,

        '--flat-playlist',
        '--dump-single-json',
        '--skip-download',

        '--no-warnings',

        '--extractor-args',
        'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416'
    ];

    const process = runYtDlp(args);

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', data => {
        stdout += data.toString();
    });

    process.stderr.on('data', data => {
        stderr += data.toString();
    });

    process.on('close', code => {

        if (code !== 0) {
            console.error('Search error:', stderr);

            return res.status(500).json({
                error: 'Failed to search YouTube'
            });
        }

        try {
            const data = JSON.parse(stdout);

            const results = (data.entries || []).map(video => ({
                id: video.id,
                title: video.title,
                artist: video.uploader || 'Unknown Artist',
                duration: video.duration || 0,
                coverUrl: video.thumbnail || ''
            }));

            res.json(results);

        } catch (error) {
            console.error('JSON error:', error);

            res.status(500).json({
                error: 'Invalid YouTube response'
            });
        }
    });
});


// تنزيل MP3
app.get('/api/download', (req, res) => {

  const videoId = req.query.id;

  if (!videoId) {
      return res.status(400).send('Missing Video ID');
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader(
      'Content-Disposition',
      'attachment; filename="song.mp3"'
  );

  const args = [
    url,

    '--extract-audio',
    '--audio-format',
    'mp3',

    '--output',
    '-',

    '--no-warnings',

    '--verbose',

    '--js-runtimes',
    'deno',

    '--extractor-args',
    'youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416'
];

  console.log(`Starting download: ${videoId}`);

  const process = runYtDlp(args);

  process.stdout.pipe(res);

  process.stderr.on('data', data => {
      console.error(`yt-dlp: ${data.toString()}`);
  });

  process.on('close', code => {

      console.log(`yt-dlp exited with code ${code}`);

      if (code !== 0) {
          console.error(
              `Download failed for video ${videoId}`
          );
      }
  });

  req.on('close', () => {

      if (!res.writableEnded) {
          process.kill('SIGTERM');
      }
  });
});


// تشغيل السيرفر
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});