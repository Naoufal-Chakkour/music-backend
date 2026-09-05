const axios = require('axios');

const API_URL =
  'https://api.openverse.org/v1/audio/';

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
            q: cleanQuery,
            page_size: 20
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
        '[Openverse] Unexpected API response'
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
         * Openverse provides the direct
         * media URL in "url".
         */

        const mediaUrl =
          typeof track.url === 'string' &&
          /^https:\/\//i.test(
            track.url
          )
            ? track.url
            : null;

        if (!mediaUrl) {
          return null;
        }

        /*
         * License information.
         *
         * Openverse itself recommends
         * verifying the license of the
         * individual work.
         */

        const licenseParts = [
          track.license,
          track.license_version
        ].filter(Boolean);

        const license =
          licenseParts.length > 0
            ? licenseParts.join(' ')
            : 'Openverse - verify track license';

        /*
         * Openverse indexes openly licensed
         * media, but the actual media can be
         * hosted on another provider.
         */

        return {
          id:
            track.identifier ||
            track.id ||
            null,

          title:
            String(
              track.title ||
              'Unknown Track'
            ),

          artist:
            String(
              track.creator ||
              'Unknown Artist'
            ),

          downloadUrl:
            mediaUrl,

          streamUrl:
            mediaUrl,

          downloadAllowed:
            true,

          license,

          sourceProvider:
            'Openverse',

          mimeType:
            track.mimetype ||
            null,

          extension:
            track.filetype
              ? `.${String(
                  track.filetype
                ).replace(
                  /^\./,
                  ''
                ).toLowerCase()}`
              : null
        };
      })
      .filter(Boolean);

  } catch (err) {
    const status =
      err.response?.status;

    console.error(
      `[Openverse] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};