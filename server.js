const express = require('express');
const cors = require('cors');
const { exec } = require('yt-dlp-exec');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// الصفحة الرئيسية
app.get('/', (req, res) => {
    res.send('Music Backend Service is Running!');
});

// البحث
app.get('/api/search', async (req, res) => {
    const query = req.query.q;

    if (!query) {
        return res.status(400).json({
            error: 'Query parameter required'
        });
    }

    try {
        const result = await exec(`ytsearch10:${query}`, {
            dumpSingleJson: true,
            flatPlaylist: true,
            skipDownload: true,
            noWarnings: true,
            callHome: false
        });

        const data = JSON.parse(result.stdout);

        const results = (data.entries || []).map(video => ({
            id: video.id,
            title: video.title,
            artist: video.uploader || 'Unknown Artist',
            duration: video.duration || 0,
            coverUrl: video.thumbnail || ''
        }));

        res.json(results);

    } catch (error) {
        console.error('Search error:', error);

        res.status(500).json({
            error: 'Failed to search YouTube'
        });
    }
});

// تنزيل الصوت MP3
app.get('/api/download', async (req, res) => {
    const videoId = req.query.id;

    if (!videoId) {
        return res.status(400).send('Missing Video ID');
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="song.mp3"'
        );

        const subprocess = exec(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: '-',
            noWarnings: true,
            callHome: false
        }, {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        subprocess.stdout.pipe(res);

        subprocess.stderr.on('data', data => {
            console.error(`yt-dlp: ${data}`);
        });

        subprocess.on('close', code => {
            if (code !== 0) {
                console.error(`yt-dlp exited with code ${code}`);

                if (!res.headersSent) {
                    res.status(500).send('Failed to download audio');
                }
            }
        });

    } catch (error) {
        console.error('Download error:', error);

        if (!res.headersSent) {
            res.status(500).send('Failed to extract audio');
        }
    }
});

// تشغيل السيرفر
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});