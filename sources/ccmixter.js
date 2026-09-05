const axios = require('axios');

const API_URL =
  'https://ccmixter.org/api/query';

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
            f: 'json',
            s: cleanQuery,
            search_type: 'any',
            limit: 20,
            dataview: 'links'
          },

          timeout: 10000,

          headers: {
            'User-Agent':
              'MusicVault/3.0'
          }
        }
      );

    /*
     * ccMixter's API can return
     * the result collection in
     * different structures.
     */

    let results = [];

    if (Array.isArray(data)) {
      results = data;
    } else if (
      Array.isArray(data?.results)
    ) {
      results = data.results;
    } else if (
      Array.isArray(data?.uploads)
    ) {
      results = data.uploads;
    }

    return results
      .map(track => {
        if (
          !track ||
          typeof track !== 'object'
        ) {
          return null;
        }

        /*
         * Possible direct file URL.
         */

        const possibleDownloadUrl =
          track.download_url ||
          track.file_url ||
          track.file ||
          track.download ||
          null;

        /*
         * Possible streaming URL.
         */

        const possibleStreamUrl =
          track.stream_url ||
          track.preview_url ||
          track.file_url ||
          possibleDownloadUrl ||
          null;

        const downloadUrl =
          typeof possibleDownloadUrl ===
            'string' &&
          /^https:\/\//i.test(
            possibleDownloadUrl
          )
            ? possibleDownloadUrl
            : null;

        const streamUrl =
          typeof possibleStreamUrl ===
            'string' &&
          /^https:\/\//i.test(
            possibleStreamUrl
          )
            ? possibleStreamUrl
            : null;

        /*
         * Ignore records without
         * any playable/downloadable URL.
         */

        if (
          !downloadUrl &&
          !streamUrl
        ) {
          return null;
        }

        return {
          id:
            track.upload_id ||
            track.id ||
            null,

          title:
            String(
              track.upload_name ||
              track.title ||
              track.name ||
              'Unknown Track'
            ),

          artist:
            String(
              track.user_name ||
              track.artist ||
              track.creator ||
              'Unknown Artist'
            ),

          downloadUrl,

          streamUrl,

          downloadAllowed:
            Boolean(
              downloadUrl
            ),

          license:
            String(
              track.license_name ||
              track.license ||
              'Creative Commons - check track license'
            ),

          sourceProvider:
            'ccMixter',

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
      `[ccMixter] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};