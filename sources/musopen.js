const axios = require('axios');

/*
|--------------------------------------------------------------------------
| Musopen
|--------------------------------------------------------------------------
|
| Musopen's public website/API availability can change.
| This adapter therefore fails gracefully and never
| prevents the other music sources from working.
|
*/

const API_URL =
  'https://musopen.org/api/search/';

async function search(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

  try {
    const { data } =
      await axios.get(
        API_URL,
        {
          params: {
            q: cleanQuery
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
      !Array.isArray(data.results)
    ) {
      console.warn(
        '[Musopen] Unexpected API response'
      );

      return [];
    }

    return data.results
      .map(track => {
        if (
          !track ||
          typeof track !== 'object'
        ) {
          return null;
        }

        /*
         * Try possible audio/stream fields.
         */

        const streamUrl =
          track.audio_url ||
          track.audioUrl ||
          null;

        /*
         * Only use an explicit download URL.
         *
         * We do NOT automatically turn every
         * page URL into a download URL.
         */

        const downloadUrl =
          track.download_url ||
          track.downloadUrl ||
          null;

        const validStreamUrl =
          typeof streamUrl === 'string' &&
          /^https:\/\//i.test(
            streamUrl
          )
            ? streamUrl
            : null;

        const validDownloadUrl =
          typeof downloadUrl === 'string' &&
          /^https:\/\//i.test(
            downloadUrl
          )
            ? downloadUrl
            : null;

        /*
         * If the API returns neither an audio
         * stream nor an actual download URL,
         * this result is not useful to us.
         */

        if (
          !validStreamUrl &&
          !validDownloadUrl
        ) {
          return null;
        }

        return {
          id:
            track.id ||
            track.pk ||
            null,

          title:
            String(
              track.title ||
              track.name ||
              'Unknown Track'
            ),

          artist:
            String(
              track.composer ||
              track.performer ||
              track.artist ||
              'Unknown Artist'
            ),

          downloadUrl:
            validDownloadUrl,

          streamUrl:
            validStreamUrl ||
            validDownloadUrl,

          downloadAllowed:
            Boolean(
              validDownloadUrl
            ),

          license:
            String(
              track.license ||
              track.license_name ||
              'Musopen - check track license'
            ),

          sourceProvider:
            'Musopen',

          mimeType:
            track.mime_type ||
            track.mimeType ||
            'audio/mpeg',

          extension:
            track.file_extension
              ? `.${String(
                  track.file_extension
                ).replace(
                  /^\./,
                  ''
                )}`
              : '.mp3'
        };
      })
      .filter(Boolean);

  } catch (err) {
    const status =
      err.response?.status;

    console.error(
      `[Musopen] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    /*
     * Important:
     * Do not make Musopen failure stop
     * Jamendo/Audius/Archive/etc.
     */

    return [];
  }
}

module.exports = {
  search
};