const jamendo = require('../sources/jamendo');
const audius = require('../sources/audius');
const ccmixter = require('../sources/ccmixter');
const fma = require('../sources/fma');
const archive = require('../sources/archive');
const musopen = require('../sources/musopen');
const openverse = require('../sources/openverse');
const wikimedia = require('../sources/wikimedia');
const soundcloud = require('../sources/soundcloud');

/*
|--------------------------------------------------------------------------
| Music sources
|--------------------------------------------------------------------------
*/

const sources = [
  jamendo,
  audius,
  ccmixter,
  fma,
  archive,
  musopen,
  openverse,
  wikimedia,
  soundcloud
];

/*
|--------------------------------------------------------------------------
| Search all sources
|--------------------------------------------------------------------------
*/

async function searchAllSources(query) {
  const cleanQuery =
    String(query || '').trim();

  if (!cleanQuery) {
    return [];
  }

  /*
   * Search all providers simultaneously.
   *
   * Promise.allSettled() is intentional:
   * if one provider fails, the other providers
   * can still return their results.
   */

  const settled =
    await Promise.allSettled(
      sources.map(source =>
        source.search(cleanQuery)
      )
    );

  const results = [];

  for (const result of settled) {
    /*
     * Ignore failed providers.
     */

    if (
      result.status !==
      'fulfilled'
    ) {
      continue;
    }

    if (
      !Array.isArray(
        result.value
      )
    ) {
      continue;
    }

    /*
     * Normalize every returned track.
     */

    for (
      const track of result.value
    ) {
      if (
        !track ||
        typeof track !== 'object'
      ) {
        continue;
      }

      /*
       * A result must have a title
       * and at least one usable URL.
       *
       * IMPORTANT:
       * stream-only results are allowed.
       */

      if (!track.title) {
        continue;
      }

      if (
        !track.streamUrl &&
        !track.downloadUrl
      ) {
        continue;
      }

      const streamUrl =
        track.streamUrl
          ? String(track.streamUrl)
          : (
              track.downloadUrl
                ? String(track.downloadUrl)
                : null
            );

      const downloadUrl =
        track.downloadUrl
          ? String(track.downloadUrl)
          : null;

      results.push({
        id:
          track.id !== undefined &&
          track.id !== null
            ? String(track.id)
            : null,

        title:
          String(
            track.title
          ),

        artist:
          String(
            track.artist ||
            'Unknown Artist'
          ),

        /*
         * null means:
         * this source does not provide
         * a downloadable file.
         */

        downloadUrl,

        /*
         * streamUrl is independent from
         * downloadUrl.
         *
         * Therefore a track can be:
         *
         * downloadUrl = null
         * streamUrl   = valid URL
         */

        streamUrl,

        downloadAllowed:
          track.downloadAllowed === true &&
          Boolean(downloadUrl),

        license:
          String(
            track.license ||
            'Unknown License'
          ),

        sourceProvider:
          String(
            track.sourceProvider ||
            'Unknown'
          ),

        mimeType:
          track.mimeType
            ? String(track.mimeType)
            : null,

        extension:
          track.extension
            ? String(track.extension)
            : null
      });
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Remove exact duplicates
  |--------------------------------------------------------------------------
  */

  const seen =
    new Set();

  return results.filter(
    track => {
      const key = [
        track.sourceProvider,
        track.id || '',
        track.streamUrl || '',
        track.downloadUrl || ''
      ].join('|');

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

module.exports = {
  searchAllSources
};