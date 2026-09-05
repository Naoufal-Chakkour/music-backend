const axios = require('axios');

const API_URL =
  'https://commons.wikimedia.org/w/api.php';

/*
|--------------------------------------------------------------------------
| Supported audio extensions
|--------------------------------------------------------------------------
*/

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'ogg',
  'oga',
  'opus',
  'wav',
  'flac',
  'm4a',
  'aac',
  'webm'
]);

/*
|--------------------------------------------------------------------------
| Get extension from URL
|--------------------------------------------------------------------------
*/

function getExtension(url) {
  try {
    const pathname =
      new URL(url).pathname;

    const match =
      pathname.match(
        /\.([a-z0-9]+)$/i
      );

    return match
      ? match[1].toLowerCase()
      : null;

  } catch {
    return null;
  }
}

/*
|--------------------------------------------------------------------------
| Extension → MIME type
|--------------------------------------------------------------------------
*/

function extensionToMimeType(
  extension
) {
  switch (extension) {
    case 'mp3':
      return 'audio/mpeg';

    case 'ogg':
    case 'oga':
      return 'audio/ogg';

    case 'opus':
      return 'audio/opus';

    case 'wav':
      return 'audio/wav';

    case 'flac':
      return 'audio/flac';

    case 'm4a':
      return 'audio/mp4';

    case 'aac':
      return 'audio/aac';

    case 'webm':
      return 'audio/webm';

    default:
      return null;
  }
}

/*
|--------------------------------------------------------------------------
| Get actual Wikimedia media file
|--------------------------------------------------------------------------
*/

async function getFileInfo(
  title
) {
  try {
    const { data } =
      await axios.get(
        API_URL,
        {
          params: {
            action: 'query',
            format: 'json',

            prop: 'imageinfo',

            titles: title,

            iiprop:
              'url|mime|size|extmetadata'
          },

          timeout: 10000,

          headers: {
            'User-Agent':
              'MusicVault/3.0 (music search application)'
          }
        }
      );

    const pages =
      data?.query?.pages;

    if (
      !pages ||
      typeof pages !== 'object'
    ) {
      return null;
    }

    const page =
      Object.values(pages)[0];

    if (
      !page ||
      !Array.isArray(
        page.imageinfo
      )
    ) {
      return null;
    }

    const info =
      page.imageinfo[0];

    if (
      !info?.url
    ) {
      return null;
    }

    const extension =
      getExtension(
        info.url
      );

    const mimeType =
      String(
        info.mime || ''
      ).toLowerCase();

    /*
     * Verify that this is actually
     * an audio file.
     */

    const isAudio =
      mimeType.startsWith(
        'audio/'
      ) ||
      AUDIO_EXTENSIONS.has(
        extension
      );

    if (!isAudio) {
      return null;
    }

    /*
     * Extract license information
     * from Wikimedia metadata.
     */

    let license =
      'Wikimedia Commons - check file license';

    const metadata =
      info.extmetadata || {};

    if (
      metadata.LicenseShortName?.value
    ) {
      license =
        String(
          metadata
            .LicenseShortName
            .value
        );
    }

    return {
      url:
        String(info.url),

      mimeType:
        extensionToMimeType(
          extension
        ) ||
        (
          mimeType.startsWith(
            'audio/'
          )
            ? mimeType
            : null
        ),

      extension:
        extension
          ? `.${extension}`
          : null,

      license
    };

  } catch (err) {
    console.error(
      `[Wikimedia] file info failed for "${title}":`,
      err.message
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| Search Wikimedia Commons
|--------------------------------------------------------------------------
*/

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
            action: 'query',

            list: 'search',

            srsearch:
              `${cleanQuery} filetype:audio`,

            /*
             * Namespace 6 = File
             */

            srnamespace: 6,

            srlimit: 20,

            format: 'json'
          },

          timeout: 10000,

          headers: {
            'User-Agent':
              'MusicVault/3.0 (music search application)'
          }
        }
      );

    const searchResults =
      data?.query?.search;

    if (
      !Array.isArray(
        searchResults
      )
    ) {
      console.warn(
        '[Wikimedia] Unexpected search response'
      );

      return [];
    }

    /*
     * Resolve the actual media URL
     * for every search result.
     */

    const settled =
      await Promise.allSettled(
        searchResults.map(
          async result => {
            const title =
              String(
                result?.title || ''
              );

            if (!title) {
              return null;
            }

            const fileInfo =
              await getFileInfo(
                title
              );

            if (!fileInfo) {
              return null;
            }

            /*
             * Remove "File:" from the
             * displayed title.
             */

            const cleanTitle =
              title.replace(
                /^File:/i,
                ''
              );

            return {
              id:
                title,

              title:
                cleanTitle,

              artist:
                'Wikimedia Commons',

              downloadUrl:
                fileInfo.url,

              streamUrl:
                fileInfo.url,

              downloadAllowed:
                true,

              license:
                fileInfo.license,

              sourceProvider:
                'Wikimedia Commons',

              mimeType:
                fileInfo.mimeType,

              extension:
                fileInfo.extension
            };
          }
        )
      );

    const results = [];

    for (
      const result of settled
    ) {
      if (
        result.status ===
          'fulfilled' &&
        result.value
      ) {
        results.push(
          result.value
        );
      }
    }

    return results;

  } catch (err) {
    const status =
      err.response?.status;

    console.error(
      `[Wikimedia] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};