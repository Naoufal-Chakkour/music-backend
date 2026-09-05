const axios = require('axios');

const JAMENDO_API_URL =
  'https://api.jamendo.com/v3.0/tracks/';

const CLIENT_ID =
  process.env.JAMENDO_CLIENT_ID;

async function search(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

  /*
   * Jamendo requires a real client_id.
   */
  if (!CLIENT_ID) {
    console.warn(
      '[Jamendo] JAMENDO_CLIENT_ID is not configured'
    );

    return [];
  }

  try {
    const { data } =
      await axios.get(
        JAMENDO_API_URL,
        {
          params: {
            client_id: CLIENT_ID,

            format: 'json',

            limit: 20,

            namesearch: cleanQuery,

            /*
             * Ask Jamendo to include
             * license information.
             */
            include: 'licenses',

            /*
             * Explicitly request the
             * streaming/download formats.
             */
            audioformat: 'mp31',

            audiodlformat: 'mp32'
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
        '[Jamendo] Unexpected API response'
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
         * Jamendo provides:
         *
         * audio          = stream URL
         * audiodownload  = download URL
         *
         * audiodownload_allowed determines
         * whether our application may offer
         * the download option.
         */

        const streamUrl =
          typeof track.audio === 'string' &&
          track.audio.trim()
            ? track.audio
            : null;

        const downloadAllowed =
          track.audiodownload_allowed === true;

        const downloadUrl =
          downloadAllowed &&
          typeof track.audiodownload === 'string' &&
          track.audiodownload.trim()
            ? track.audiodownload
            : null;

        /*
         * Ignore completely unusable
         * records.
         */

        if (
          !streamUrl &&
          !downloadUrl
        ) {
          return null;
        }

        return {
          id:
            track.id !== undefined &&
            track.id !== null
              ? String(track.id)
              : null,

          title:
            String(
              track.name ||
              'Unknown Track'
            ),

          artist:
            String(
              track.artist_name ||
              'Unknown Artist'
            ),

          /*
           * Can be null for a
           * stream-only track.
           */
          downloadUrl,

          /*
           * Always keep the stream
           * URL when available.
           */
          streamUrl,

          downloadAllowed:
            Boolean(
              downloadAllowed &&
              downloadUrl
            ),

          license:
            String(
              track.license_ccurl ||
              'Jamendo License - check track terms'
            ),

          sourceProvider:
            'Jamendo',

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

    const apiMessage =
      err.response?.data?.headers?.error_message;

    console.error(
      `[Jamendo] search failed${status ? ` (${status})` : ''}:`,
      apiMessage ||
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};