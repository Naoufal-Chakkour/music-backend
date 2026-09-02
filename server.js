const express = require('express');
const cors = require('cors');
const { exec } = require('yt-dlp-exec');

const app = express();
app.use(cors());

// مسار البحث
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'مطلوب نص البحث' });

  try {
    const output = await exec(`ytsearch10:${query}`, {
      dumpSingleJson: true,
      noWarnings: true,
      callHome: false,
    });

    const data = JSON.parse(output.stdout);
    const results = (data.entries || []).map(video => ({
      id: video.id,
      title: video.title,
      artist: video.uploader || 'فنان',
      cover: video.thumbnail,
      duration: video.duration
    }));

    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'فشل عملية البحث' });
  }
});

// مسار التنزيل واستخراج الصوت الكامل
app.get('/api/download', async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send('Missing Video ID');

  try {
    res.header('Content-Type', 'audio/mpeg');
    res.header('Content-Disposition', `attachment; filename="song.mp3"`);

    const subprocess = exec(`https://www.youtube.com/watch?v=${videoId}`, {
      extractAudio: true,
      audioFormat: 'mp3',
      output: '-',
    }, { stdio: ['ignore', 'pipe', 'ignore'] });

    subprocess.stdout.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).send('فشل استخراج ملف الصوت');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));