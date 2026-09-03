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

module.exports = app;