const axios = require('axios');

const SEARCH_URL =
  'https://archive.org/advancedsearch.php';

const METADATA_URL =
  'https://archive.org/metadata/';

/*
|--------------------------------------------------------------------------
| Supported audio formats
|--------------------------------------------------------------------------
*/

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'flac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'aac',
  'webm'
]);

const AUDIO_FORMATS = new Set([
  'VBR MP3',
  'MP3',
  'M4A',
  'FLAC',
  'WAV',
  'Ogg Vorbis',
  'Ogg',
  'Opus',
  'AAC',
  'WebM'
]);

/*
|--------------------------------------------------------------------------
| MIME type
|--------------------------------------------------------------------------
*/

function getMimeType(extension) {
  switch (extension) {
    case 'mp3':
      return 'audio/mpeg';

    case 'm4a':
      return 'audio/mp4';

    case 'flac':
      return 'audio/flac';

    case 'wav':
      return 'audio/wav';

    case 'ogg':
    case 'oga':
      return 'audio/ogg';

    case 'opus':
      return 'audio/opus';

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
| Check whether an Archive.org file is audio
|--------------------------------------------------------------------------
*/

function isAudioFile(file) {
  if (
    !file ||
    typeof file !== 'object'
  ) {
    return false;
  }

  const name =
    String(file.name || '');

  const format =
    String(file.format || '');

  const extension =
    name
      .split('.')
      .pop()
      .toLowerCase();

  return (
    AUDIO_EXTENSIONS.has(
      extension
    ) ||
    AUDIO_FORMATS.has(
      format
    )
  );
}

/*
|--------------------------------------------------------------------------
| Build direct download URL
|--------------------------------------------------------------------------
*/

function getFileUrl(
  identifier,
  fileName
) {
  const encodedIdentifier =
    encodeURIComponent(
      identifier
    );

  const encodedFileName =
    String(fileName)
      .split('/')
      .map(part =>
        encodeURIComponent(part)
      )
      .join('/');

  return (
    `https://archive.org/download/${encodedIdentifier}/${encodedFileName}`
  );
}

/*
|--------------------------------------------------------------------------
| Get metadata and locate an audio file
|--------------------------------------------------------------------------
*/

async function getAudioFile(
  identifier
) {
  try {
    const { data } =
      await axios.get(
        `${METADATA_URL}${encodeURIComponent(identifier)}`,
        {
          timeout: 10000,

          headers: {
            'User-Agent':
              'MusicVault/3.0'
          }
        }
      );

    if (
      !data ||
      !Array.isArray(data.files)
    ) {
      return null;
    }

    /*
     * Select usable audio files.
     */

    const audioFiles =
      data.files
        .filter(isAudioFile)
        .filter(file => {
          const size =
            Number(
              file.size || 0
            );

          return (
            Number.isFinite(size) &&
            size > 0
          );
        });

    if (
      audioFiles.length === 0
    ) {
      return null;
    }

    /*
     * Prefer the largest audio file.
     *
     * This generally avoids selecting
     * tiny preview/thumbnail files when
     * several audio representations exist.
     */

    audioFiles.sort(
      (a, b) => {
        const sizeA =
          Number(a.size || 0);

        const sizeB =
          Number(b.size || 0);

        return sizeB - sizeA;
      }
    );

    const file =
      audioFiles[0];

    const fileName =
      String(file.name);

    const extension =
      fileName
        .split('.')
        .pop()
        .toLowerCase();

    const url =
      getFileUrl(
        identifier,
        fileName
      );

    return {
      url,

      mimeType:
        getMimeType(
          extension
        ),

      extension:
        `.${extension}`
    };

  } catch (err) {
    console.error(
      `[Internet Archive] metadata failed for "${identifier}":`,
      err.message
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| Search Internet Archive
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
        SEARCH_URL,
        {
          params: {
            q:
              `${cleanQuery} AND mediatype:audio`,

            /*
             * Fields needed from the
             * search response.
             */

            'fl[]': [
              'identifier',
              'title',
              'creator',
              'description',
              'licenseurl'
            ],

            rows: 20,

            page: 1,

            output: 'json'
          },

          timeout: 10000,

          headers: {
            'User-Agent':
              'MusicVault/3.0'
          }
        }
      );

    const docs =
      data?.response?.docs;

    if (
      !Array.isArray(docs)
    ) {
      console.warn(
        '[Internet Archive] Unexpected search response'
      );

      return [];
    }

    /*
     * Each search result needs a metadata
     * request because the search endpoint
     * does not directly give us the actual
     * audio file URL.
     */

    const settled =
      await Promise.allSettled(
        docs.map(
          async doc => {
            if (
              !doc ||
              !doc.identifier
            ) {
              return null;
            }

            const identifier =
              String(
                doc.identifier
              );

            const audioFile =
              await getAudioFile(
                identifier
              );

            if (!audioFile) {
              return null;
            }

            return {
              id:
                identifier,

              title:
                String(
                  doc.title ||
                  identifier
                ),

              artist:
                String(
                  doc.creator ||
                  'Unknown Artist'
                ),

              downloadUrl:
                audioFile.url,

              streamUrl:
                audioFile.url,

              downloadAllowed:
                true,

              license:
                String(
                  doc.licenseurl ||
                  'Internet Archive - check item license'
                ),

              sourceProvider:
                'Internet Archive',

              mimeType:
                audioFile.mimeType,

              extension:
                audioFile.extension
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
      `[Internet Archive] search failed${status ? ` (${status})` : ''}:`,
      err.message
    );

    return [];
  }
}

module.exports = {
  search
};