const axios = require('axios');

const CLIENT_ID =
  process.env.SOUNDCLOUD_CLIENT_ID;

const API_URL =
  'https://api-v2.soundcloud.com/search/tracks';

/*
|--------------------------------------------------------------------------
| Search SoundCloud
|--------------------------------------------------------------------------
*/

async function search(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

  /*
   * SoundCloud is optional.
   *
   * If no legitimate client ID is configured,
   * simply skip this provider.
   */

  if (!CLIENT_ID) {
    return [];
  }

  try {
    const { data } =
      await axios.get(
        API_URL,
        {
          params: {
            q: cleanQuery,

            client_id:
              CLIENT_ID,

            limit: 20,

            offset: 0
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
      !Array.isArray(
        data.collection
      )
    ) {
      console.warn(
        '[SoundCloud] Unexpected API response'
      );

      return [];
    }

    return data.collection
      .map(track => {
        if (
          !track ||
          typeof track !== 'object'
        ) {
          return null;
        }

        /*
         * SoundCloud exposes different
         * media transcodings.
         *
         * We prefer a progressive stream
         * when one is available.
         */

        const transcodings =
          Array.isArray(
            track.media?.transcodings
          )
            ? track.media.transcodings
            : [];

        const progressive =
          transcodings.find(
            item =>
              item &&
              item.format?.protocol ===
                'progressive' &&
              typeof item.url ===
                'string'
          );

        const streamUrl =
          progressive?.url ||
          null;

        /*
         * Do NOT fabricate a download URL.
         *
         * SoundCloud download availability
         * depends on the track and its
         * permissions.
         */

        const downloadUrl =
          null;

        /*
         * No stream = no useful result.
         */

        if (!streamUrl) {
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
              track.title ||
              'Unknown Track'
            ),

          artist:
            String(
              track.user?.username ||
              'Unknown Artist'
            ),

          downloadUrl,

          streamUrl,

          downloadAllowed:
            false,

          license:
            'SoundCloud - check track terms',

          sourceProvider:
            'SoundCloud',

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
      `[SoundCloud] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};