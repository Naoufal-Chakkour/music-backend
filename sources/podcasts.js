const axios = require('axios');

const API_URL =
  'https://listen-api.listennotes.com/api/v2';

const apiKey =
   String(
   process.env.LISTEN_API_KEY || ''
   ).trim();  

async function search(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

 

  try {
    const { data } =
      await axios.get(
        `${API_URL}/search`,
        {
          params: {
            q: cleanQuery,

            type:
              'episode',

            offset:
              0,

            len_min:
              10,

            len_max:
              36000,

            language:
              'German',

            safe_mode:
              1
          },

          timeout:
            10000,

            headers: {
              'X-ListenAPI-Key':
                apiKey,
            
              'User-Agent':
                'MusicVault/3.0'
            }
        }
      );

    if (
      !data ||
      !Array.isArray(
        data.results
      )
    ) {
      console.warn(
        '[Podcasts] Unexpected API response'
      );

      return [];
    }

    return data.results
      .map(episode => {
        if (
          !episode ||
          !episode.id
        ) {
          return null;
        }

        const audioUrl =
          episode.audio;

        if (
          !audioUrl
        ) {
          return null;
        }

        return {
          id:
            `podcast-${episode.id}`,

          title:
            String(
              episode.title_original ||
              episode.title ||
              'Unknown Episode'
            ),

          artist:
            String(
              episode.podcast?.title_original ||
              episode.podcast?.title ||
              'Podcast'
            ),

          streamUrl:
            String(audioUrl),

          downloadUrl:
            String(audioUrl),

          downloadAllowed:
            true,

          license:
            'Podcast RSS / publisher terms',

          sourceProvider:
            'Listen Notes',

          mimeType:
            'audio/mpeg',

          extension:
            '.mp3'
        };
      })
      .filter(Boolean);

  } catch (err) {
    const status =
      err.response?.status;

    console.error(
      `[Podcasts] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};
