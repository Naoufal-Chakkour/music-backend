const axios = require('axios');

const API_URL =
  'https://freemusicarchive.org/api/get/tracks.json';

const API_KEY =
  process.env.FMA_API_KEY;

async function search(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

  /*
   * FMA API requires an API key.
   * If none is configured, simply skip FMA.
   */
  if (!API_KEY) {
    console.warn(
      '[FMA] FMA_API_KEY is not configured - skipping'
    );

    return [];
  }

  try {
    const { data } =
      await axios.get(
        API_URL,
        {
          params: {
            api_key: API_KEY,
            search: cleanQuery,
            limit: 20
          },

          timeout: 10000,

          headers: {
            'User-Agent':
              'MusicVault/3.0'
          }
        }
      );

    if (
      !data ||
      !Array.isArray(data.dataset)
    ) {
      console.warn(
        '[FMA] Unexpected API response'
      );

      return [];
    }

    return data.dataset
      .map(track => {
        if (
          !track ||
          typeof track !== 'object'
        ) {
          return null;
        }

        /*
         * Try the known FMA file URL fields.
         */

        const rawUrl =
          track.track_file_url ||
          track.file_url ||
          null;

        const mediaUrl =
          typeof rawUrl === 'string' &&
          /^https:\/\//i.test(rawUrl)
            ? rawUrl
            : null;

        /*
         * No playable file = ignore result.
         */

        if (!mediaUrl) {
          return null;
        }

        return {
          id:
            track.track_id ||
            track.id ||
            null,

          title:
            String(
              track.track_title ||
              track.title ||
              'Unknown Track'
            ),

          artist:
            String(
              track.artist_name ||
              track.artist ||
              'Unknown Artist'
            ),

          downloadUrl:
            mediaUrl,

          streamUrl:
            mediaUrl,

          downloadAllowed:
            true,

          /*
           * Keep the license information
           * instead of assuming that every FMA
           * track has identical usage rights.
           */

          license:
            String(
              track.license_title ||
              track.license ||
              'FMA - check track license'
            ),

          sourceProvider:
            'FMA',

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
      `[FMA] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};