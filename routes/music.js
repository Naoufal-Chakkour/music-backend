const express = require('express');
const axios = require('axios');
const archiver = require('archiver');
const dns = require('dns').promises;
const net = require('net');

const {
  searchAllSources
} = require('../services/musicSources');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Limits
|--------------------------------------------------------------------------
*/

const MAX_TRACKS_PER_DOWNLOAD = 50;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const DOWNLOAD_TIMEOUT = 30000;

/*
|--------------------------------------------------------------------------
| Supported providers
|--------------------------------------------------------------------------
*/

const ALLOWED_PROVIDERS = new Set([
  'Jamendo',
  'Audius',
  'ccMixter',
  'FMA',
  'Internet Archive',
  'Musopen',
  'Openverse',
  'Wikimedia Commons',
  'SoundCloud'
]);

/*
|--------------------------------------------------------------------------
| Exact hosts used by our own source APIs
|--------------------------------------------------------------------------
*/

const EXACT_ALLOWED_HOSTS = new Set([
  'api.jamendo.com',

  'discoveryprovider.audius.co',

  'ccmixter.org',
  'www.ccmixter.org',

  'freemusicarchive.org',
  'www.freemusicarchive.org',

  'archive.org',
  'www.archive.org',

  'musopen.org',
  'www.musopen.org',

  'api.openverse.org',

  'commons.wikimedia.org',
  'upload.wikimedia.org'
]);

/*
|--------------------------------------------------------------------------
| IP security
|--------------------------------------------------------------------------
*/

function isPrivateOrLocalIp(ip) {
  const version = net.isIP(ip);

  if (!version) {
    return true;
  }

  /*
   * IPv4
   */

  if (version === 4) {
    const parts = ip
      .split('.')
      .map(Number);

    const [a, b] = parts;

    // 0.0.0.0/8
    if (a === 0) {
      return true;
    }

    // 10.0.0.0/8
    if (a === 10) {
      return true;
    }

    // 127.0.0.0/8
    if (a === 127) {
      return true;
    }

    // 169.254.0.0/16
    if (
      a === 169 &&
      b === 254
    ) {
      return true;
    }

    // 172.16.0.0/12
    if (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) {
      return true;
    }

    // 192.168.0.0/16
    if (
      a === 192 &&
      b === 168
    ) {
      return true;
    }

    // 100.64.0.0/10
    if (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) {
      return true;
    }

    // 198.18.0.0/15
    if (
      a === 198 &&
      (
        parts[2] === 18 ||
        parts[2] === 19
      )
    ) {
      return true;
    }

    return false;
  }

  /*
   * IPv6
   */

  const normalized =
    ip.toLowerCase();

  // Unspecified / loopback
  if (
    normalized === '::' ||
    normalized === '::1'
  ) {
    return true;
  }

  // Unique local addresses
  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }

  // Link-local
  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| DNS security check
|--------------------------------------------------------------------------
*/

async function resolvesToPublicIp(hostname) {
  try {
    const addresses =
      await dns.lookup(
        hostname,
        {
          all: true,
          verbatim: true
        }
      );

    if (!addresses.length) {
      return false;
    }

    return addresses.every(
      address =>
        !isPrivateOrLocalIp(
          address.address
        )
    );

  } catch (err) {
    console.warn(
      `[security] DNS lookup failed for ${hostname}:`,
      err.message
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Remote URL validation
|--------------------------------------------------------------------------
*/

async function isAllowedRemoteUrl(
  value,
  sourceProvider
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return false;
  }

  if (
    !ALLOWED_PROVIDERS.has(
      sourceProvider
    )
  ) {
    return false;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  /*
   * HTTPS only
   */

  if (
    url.protocol !== 'https:'
  ) {
    return false;
  }

  const hostname =
    url.hostname.toLowerCase();

  /*
   * Direct IP addresses
   */

  if (net.isIP(hostname)) {
    return !isPrivateOrLocalIp(
      hostname
    );
  }

  /*
   * Explicitly trusted hosts
   */

  if (
    EXACT_ALLOWED_HOSTS.has(
      hostname
    )
  ) {
    return true;
  }

  /*
   * Internet Archive uses
   * different iaXXX.us.archive.org
   * download hosts.
   */

  if (
    sourceProvider ===
      'Internet Archive' &&
    /^ia\d+\.us\.archive\.org$/i.test(
      hostname
    )
  ) {
    return resolvesToPublicIp(
      hostname
    );
  }

  /*
   * Openverse can point to
   * third-party media hosts.
   *
   * We therefore verify that
   * the hostname resolves to
   * public IP addresses.
   */

  if (
    sourceProvider ===
      'Openverse'
  ) {
    return resolvesToPublicIp(
      hostname
    );
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Filename security
|--------------------------------------------------------------------------
*/

function sanitizeFilename(name) {
  let filename =
    String(name || 'track')
      .replace(
        /[\\/:*?"<>|]/g,
        '_'
      )
      .replace(
        /[\u0000-\u001F\u007F]/g,
        ''
      )
      .trim();

  if (!filename) {
    filename = 'track';
  }

  /*
   * Avoid "." and ".."
   */

  filename =
    filename.replace(
      /^\.+$/,
      'track'
    );

  /*
   * Limit filename length
   */

  return filename.substring(
    0,
    180
  );
}

/*
|--------------------------------------------------------------------------
| Content-Type → extension
|--------------------------------------------------------------------------
*/

function extensionFromContentType(
  contentType
) {
  if (!contentType) {
    return null;
  }

  const type =
    contentType
      .split(';')[0]
      .trim()
      .toLowerCase();

  const extensions = {
    'audio/mpeg': '.mp3',
    'audio/mp3': '.mp3',

    'audio/ogg': '.ogg',
    'application/ogg': '.ogg',

    'audio/opus': '.opus',

    'audio/wav': '.wav',
    'audio/x-wav': '.wav',

    'audio/flac': '.flac',
    'audio/x-flac': '.flac',

    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',

    'audio/aac': '.aac',

    'audio/webm': '.webm'
  };

  return (
    extensions[type] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| Audio Content-Type validation
|--------------------------------------------------------------------------
*/

function isAudioContentType(
  contentType
) {
  if (!contentType) {
    return false;
  }

  const type =
    contentType
      .split(';')[0]
      .trim()
      .toLowerCase();

  return (
    type.startsWith('audio/') ||
    type === 'application/ogg'
  );
}

/*
|--------------------------------------------------------------------------
| Unique filename
|--------------------------------------------------------------------------
*/

function createUniqueFilename(
  baseName,
  extension,
  usedNames
) {
  let filename =
    `${baseName}${extension}`;

  let counter = 2;

  while (
    usedNames.has(
      filename.toLowerCase()
    )
  ) {
    filename =
      `${baseName} (${counter})${extension}`;

    counter++;
  }

  usedNames.add(
    filename.toLowerCase()
  );

  return filename;
}

/*
|--------------------------------------------------------------------------
| GET /api/search
|--------------------------------------------------------------------------
*/

router.get(
  '/search',
  async (req, res) => {
    const artist =
      String(
        req.query.artist || ''
      ).trim();

    if (!artist) {
      return res.status(400).json({
        error:
          'الرجاء إرسال اسم الفنان عبر ?artist='
      });
    }

    if (artist.length > 200) {
      return res.status(400).json({
        error:
          'عبارة البحث طويلة جدًا'
      });
    }

    try {
      const results =
        await searchAllSources(
          artist
        );

      return res.status(200).json({
        count: results.length,
        results
      });

    } catch (err) {
      console.error(
        '[search] error:',
        err
      );

      return res.status(500).json({
        error:
          'حدث خطأ أثناء البحث'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| POST /api/download
|--------------------------------------------------------------------------
*/

router.post(
  '/download',
  async (req, res) => {
    const {
      tracks
    } = req.body || {};

    if (
      !Array.isArray(tracks) ||
      tracks.length === 0
    ) {
      return res.status(400).json({
        error:
          'الرجاء إرسال قائمة tracks غير فارغة'
      });
    }

    if (
      tracks.length >
      MAX_TRACKS_PER_DOWNLOAD
    ) {
      return res.status(400).json({
        error:
          `الحد الأقصى هو ${MAX_TRACKS_PER_DOWNLOAD} ملفًا في العملية الواحدة`
      });
    }

    /*
     * Validate every requested track.
     */

    const validTracks = [];

    for (const track of tracks) {
      if (
        !track ||
        typeof track !== 'object'
      ) {
        continue;
      }

      /*
       * We only download tracks that
       * explicitly have a download URL.
       */

      if (
        !track.downloadUrl
      ) {
        continue;
      }

      const provider =
        String(
          track.sourceProvider || ''
        );

      const allowed =
        await isAllowedRemoteUrl(
          track.downloadUrl,
          provider
        );

      if (!allowed) {
        console.warn(
          '[download] blocked URL:',
          track.downloadUrl
        );

        continue;
      }

      validTracks.push({
        ...track,
        sourceProvider: provider
      });
    }

    if (
      validTracks.length === 0
    ) {
      return res.status(400).json({
        error:
          'لا توجد ملفات قابلة للتنزيل من المصادر المدعومة'
      });
    }

    /*
     * ZIP response
     */

    res.status(200);

    res.setHeader(
      'Content-Type',
      'application/zip'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="music.zip"'
    );

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    const archive =
      archiver('zip', {
        zlib: {
          level: 6
        }
      });

    let archiveFailed =
      false;

    archive.on(
      'error',
      err => {
        archiveFailed = true;

        console.error(
          '[download] archive error:',
          err
        );

        if (
          !res.writableEnded
        ) {
          res.end();
        }
      }
    );

    archive.on(
      'warning',
      err => {
        console.warn(
          '[download] archive warning:',
          err.message
        );
      }
    );

    archive.pipe(res);

    const usedNames =
      new Set();

    let addedCount = 0;

    /*
     * Download files sequentially.
     *
     * This prevents all files from being
     * loaded into memory simultaneously.
     */

    for (
      const track of validTracks
    ) {
      if (archiveFailed) {
        break;
      }

      try {
        const response =
          await axios.get(
            track.downloadUrl,
            {
              responseType:
                'arraybuffer',

              timeout:
                DOWNLOAD_TIMEOUT,

              maxContentLength:
                MAX_FILE_SIZE,

              maxBodyLength:
                MAX_FILE_SIZE,

              /*
               * Do not silently follow
               * redirects to arbitrary hosts.
               */

              maxRedirects: 0,

              validateStatus:
                status =>
                  status >= 200 &&
                  status < 300,

              headers: {
                'User-Agent':
                  'MusicVault/3.0'
              }
            }
          );

        const contentType =
          response.headers[
            'content-type'
          ] || '';

        /*
         * Only accept audio.
         */

        if (
          !isAudioContentType(
            contentType
          )
        ) {
          console.warn(
            `[download] skipped non-audio "${track.title}" (${contentType})`
          );

          continue;
        }

        if (
          !response.data ||
          response.data.length === 0
        ) {
          console.warn(
            `[download] empty file skipped: ${track.title}`
          );

          continue;
        }

        if (
          response.data.length >
          MAX_FILE_SIZE
        ) {
          console.warn(
            `[download] file too large: ${track.title}`
          );

          continue;
        }

        /*
         * Prefer the actual response MIME type.
         * Fall back to source metadata.
         */

        const extension =
          extensionFromContentType(
            contentType
          ) ||
          (
            typeof track.extension ===
              'string' &&
            /^\.[a-z0-9]+$/i.test(
              track.extension
            )
              ? track.extension
              : '.bin'
          );

        const baseName =
          sanitizeFilename(
            track.title
          );

        const filename =
          createUniqueFilename(
            baseName,
            extension,
            usedNames
          );

        archive.append(
          Buffer.from(
            response.data
          ),
          {
            name: filename
          }
        );

        addedCount++;

        console.log(
          `[download] added: ${filename}`
        );

      } catch (err) {
        /*
         * A single failed track should not
         * destroy the complete ZIP.
         */

        console.error(
          `[download] failed "${track.title}":`,
          err.message
        );
      }
    }

    if (archiveFailed) {
      return;
    }

    /*
     * Nothing could be downloaded.
     */

    if (
      addedCount === 0
    ) {
      console.warn(
        '[download] no audio files were added'
      );

      archive.abort();

      if (
        !res.writableEnded
      ) {
        res.end();
      }

      return;
    }

    /*
     * Finalize ZIP.
     */

    try {
      await archive.finalize();

    } catch (err) {
      console.error(
        '[download] finalize error:',
        err
      );

      if (
        !res.writableEnded
      ) {
        res.end();
      }
    }
  }
);

module.exports = router;