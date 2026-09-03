const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// إضافة رد للمسار الرئيسي لإنهاء رسالة Cannot GET /
app.get('/', (req, res) => {
    res.send('Music Backend Service is Running!');
});

// مسار البحث الشغال 100%
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query parameter required' });
    }

    try {
        const response = await fetch(`https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        const results = data.slice(0, 10).map(item => ({
            id: item.videoId,
            title: item.title,
            artist: item.author || 'Unknown Artist',
            duration: item.lengthSeconds,
            audioUrl: `https://inv.nadeko.net/latest_version?id=${item.videoId}&italic=true`,
            coverUrl: item.videoThumbnails ? item.videoThumbnails[0].url : ''
        }));

        res.json(results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch tracks' });
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
