const axios = require('axios');

const AUDIUS_HOST =
  'https://discoveryprovider.audius.co';

const APP_NAME =
  'MusicVault';

async function search(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

  try {
    const { data } =
      await axios.get(
        `${AUDIUS_HOST}/v1/tracks/search`,
        {
          params: {
            query: cleanQuery,
            app_name: APP_NAME,
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
      !Array.isArray(data.data)
    ) {
      console.warn(
        '[Audius] Unexpected API response'
      );

      return [];
    }

    return data.data
      .map(track => {
        if (
          !track ||
          !track.id
        ) {
          return null;
        }

        /*
         * Audius provides a stream endpoint
         * for tracks.
         */

        const streamUrl =
          `${AUDIUS_HOST}/v1/tracks/${encodeURIComponent(
            track.id
          )}/stream?app_name=${encodeURIComponent(
            APP_NAME
          )}`;

        /*
         * Only expose a download URL when
         * Audius explicitly marks the track
         * as downloadable.
         */

        const isDownloadable =
          track.downloadable === true ||
          track.is_downloadable === true;

        let downloadUrl = null;

        if (isDownloadable) {
          downloadUrl =
            `${AUDIUS_HOST}/v1/tracks/${encodeURIComponent(
              track.id
            )}/download?app_name=${encodeURIComponent(
              APP_NAME
            )}`;
        }

        return {
          id:
            String(track.id),

          title:
            String(
              track.title ||
              'Unknown Track'
            ),

          artist:
            String(
              track.user?.name ||
              'Unknown Artist'
            ),

          /*
           * Streaming remains available even
           * when downloading is disabled.
           */

          streamUrl,

          downloadUrl,

          downloadAllowed:
            Boolean(
              downloadUrl
            ),

          license:
            'Audius - check artist terms',

          sourceProvider:
            'Audius',

          mimeType:
            'audio/mpeg',

          extension:
            '.mp3'
        };
      })
      .filter(Boolean)
      .filter(track =>
        Boolean(
          track.streamUrl ||
          track.downloadUrl
        )
      );

  } catch (err) {
    const status =
      err.response?.status;

    console.error(
      `[Audius] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};